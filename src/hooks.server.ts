import type { Handle } from '@sveltejs/kit';
import { json, redirect } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { randomUUID } from 'node:crypto';
import { building } from '$app/environment';

import { AUTH_BASE_PATH } from '$lib/auth/config.js';
import { createRequestLogger, runWithLogContext } from '$lib/logging';
import { isAppError } from '$lib/errors';
import { paraglideMiddleware } from '$lib/paraglide/server.js';
import { auth, isSetupComplete, repairCurrentUserAdminRole } from '$lib/server/auth/index.js';
import { checkApiRateLimit, applyRateLimitHeaders } from '$lib/server/rate-limit.js';
import { SECURITY_HEADERS, BASE_SECURITY_HEADERS } from '$lib/server/security/headers.js';
import {
	createSupportId,
	setAuthenticatedLocals,
	clearAuthenticatedLocals
} from '$lib/server/auth/session-helpers.js';
import { ensureServicesInitialized } from '$lib/server/services/initializer.js';
import '$lib/server/services/shutdown.js';
import { handleError } from '$lib/server/hooks/error-handler.js';

export { handleError };

const localeHandler: Handle = async ({ event, resolve }) => {
	return paraglideMiddleware(event.request, () => {
		return resolve(event);
	});
};

const authHandler: Handle = async ({ event, resolve }) => {
	ensureServicesInitialized();

	if (building) {
		return resolve(event);
	}

	const normalizedBasePath = AUTH_BASE_PATH.endsWith('/')
		? AUTH_BASE_PATH.slice(0, -1)
		: AUTH_BASE_PATH;
	const isAuthRoute =
		event.url.pathname === normalizedBasePath ||
		event.url.pathname.startsWith(`${normalizedBasePath}/`);

	if (isAuthRoute) {
		return auth.handler(event.request);
	}

	return resolve(event);
};

const customHandler: Handle = async ({ event, resolve }) => {
	const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	const clientId = event.request.headers.get('x-correlation-id');
	const correlationId = clientId && UUID_REGEX.test(clientId) ? clientId : randomUUID();
	const supportId = createSupportId();
	const requestLogger = createRequestLogger({
		requestId: correlationId,
		correlationId,
		supportId,
		logDomain: 'http',
		method: event.request.method,
		path: event.url.pathname
	});

	event.locals.correlationId = correlationId;
	event.locals.requestId = correlationId;
	event.locals.supportId = supportId;
	event.locals.logger = requestLogger;
	const pathname = event.url.pathname;

	return runWithLogContext(
		{
			requestId: correlationId,
			correlationId,
			supportId,
			logDomain: 'http',
			method: event.request.method,
			path: pathname
		},
		async () => {
			function requiresStreamingApiKey(path: string): boolean {
				if (path === '/api/livetv/playlist.m3u' || path.startsWith('/api/livetv/playlist.m3u/')) {
					return true;
				}
				if (path === '/api/livetv/epg.xml' || path.startsWith('/api/livetv/epg.xml/')) {
					return true;
				}
				if (path.startsWith('/api/livetv/stream/')) {
					return true;
				}
				if (path.startsWith('/api/streaming/session/')) {
					return true;
				}
				if (path.startsWith('/api/streaming/usenet/')) {
					return true;
				}
				return false;
			}

			const isStreamingApiRoute = requiresStreamingApiKey(pathname);

			function isHealthRoute(path: string): boolean {
				if (path === '/health' || path.startsWith('/health/')) {
					return true;
				}
				if (path === '/api/health' || path.startsWith('/api/health/')) {
					return true;
				}
				if (path === '/api/ready' || path.startsWith('/api/ready/')) {
					return true;
				}
				return false;
			}

			let session = null;
			let apiKey = null;

			if (!isStreamingApiRoute) {
				const apiKeyHeader = event.request.headers.get('x-api-key');
				if (apiKeyHeader) {
					try {
						session = await auth.api.getSession({
							headers: new Headers({ 'x-api-key': apiKeyHeader })
						});
						apiKey = apiKeyHeader;
					} catch {
						// Invalid API key, continue to cookie auth
					}
				}

				if (!session) {
					session = await auth.api.getSession({
						headers: event.request.headers
					});
				}

				if (session) {
					if (
						session.user?.id &&
						session.user.role !== 'admin' &&
						(await repairCurrentUserAdminRole(session.user.id))
					) {
						session = {
							...session,
							user: {
								...session.user,
								role: 'admin'
							}
						};
					}

					setAuthenticatedLocals(event, session, apiKey);
				} else {
					clearAuthenticatedLocals(event);
				}
			} else {
				clearAuthenticatedLocals(event);
			}

			const setupComplete = await isSetupComplete();

			if (pathname.startsWith(AUTH_BASE_PATH)) {
				return resolve(event);
			}

			function isPublicRoute(path: string): boolean {
				if (path === '/login' || path.startsWith('/login/')) {
					return true;
				}
				if (path.startsWith(AUTH_BASE_PATH)) {
					return true;
				}
				if (isHealthRoute(path)) {
					return true;
				}
				return false;
			}

			if (isStreamingApiRoute) {
				const url = new URL(event.request.url);
				const apiKeyFromQuery = url.searchParams.get('api_key');
				const apiKeyFromHeader = event.request.headers.get('x-api-key');
				const apiKey = apiKeyFromQuery || apiKeyFromHeader;

				if (!apiKey) {
					return json(
						{
							success: false,
							error: 'API key required',
							code: 'API_KEY_REQUIRED'
						},
						{
							status: 401,
							headers: {
								'x-correlation-id': correlationId,
								'x-support-id': supportId,
								...BASE_SECURITY_HEADERS
							}
						}
					);
				}

				try {
					const verifyResult = await auth.api.verifyApiKey({
						body: {
							key: apiKey,
							permissions: {
								streaming: ['*']
							}
						}
					});

					if (!verifyResult.valid) {
						requestLogger.warn(
							{
								logDomain: 'auth',
								endpoint: pathname,
								error: verifyResult.error?.message || 'Invalid permissions'
							},
							'[Auth] Main API key attempted to access streaming endpoint'
						);

						return json(
							{
								success: false,
								error: 'Unauthorized',
								code: 'UNAUTHORIZED'
							},
							{
								status: 401,
								headers: {
									'x-correlation-id': correlationId,
									'x-support-id': supportId,
									...BASE_SECURITY_HEADERS
								}
							}
						);
					}

					event.locals.apiKey = apiKey;
					event.locals.apiKeyPermissions = verifyResult.key?.permissions || null;
				} catch (error) {
					requestLogger.error(
						{
							err: error,
							logDomain: 'auth',
							endpoint: pathname
						},
						'[Auth] API key validation error'
					);

					return json(
						{
							success: false,
							error: 'API key validation failed',
							code: 'INVALID_API_KEY'
						},
						{
							status: 401,
							headers: {
								'x-correlation-id': correlationId,
								...BASE_SECURITY_HEADERS
							}
						}
					);
				}
			} else {
				if (!setupComplete) {
					if (isHealthRoute(pathname)) {
						return resolve(event);
					}
					if (!pathname.startsWith('/setup')) {
						throw redirect(302, '/setup');
					}
				} else {
					if (!event.locals.user && !isPublicRoute(pathname)) {
						if (pathname.startsWith('/api/')) {
							return json(
								{
									success: false,
									error: 'Unauthorized',
									code: 'UNAUTHORIZED'
								},
								{
									status: 401,
									headers: {
										'x-correlation-id': correlationId,
										'x-support-id': supportId,
										...SECURITY_HEADERS
									}
								}
							);
						}
						throw redirect(302, '/login');
					}
				}
			}

			if (pathname.startsWith('/api/')) {
				const rateLimitResponse = checkApiRateLimit(event);
				if (rateLimitResponse) {
					return rateLimitResponse;
				}
			}

			if (setupComplete && event.locals.user) {
				if (pathname === '/setup' || pathname === '/login' || pathname.startsWith('/login/')) {
					throw redirect(302, '/');
				}
			}

			if (
				pathname === '/movies' ||
				pathname === '/movies/' ||
				pathname === '/library/movie' ||
				pathname === '/library/movie/'
			) {
				throw redirect(308, '/library/movies');
			}
			if (pathname === '/tv' || pathname === '/tv/') {
				throw redirect(308, '/library/tv');
			}
			if (
				pathname === '/movie' ||
				pathname === '/movie/' ||
				pathname === '/discover/movie' ||
				pathname === '/discover/movie/' ||
				pathname === '/discover/tv' ||
				pathname === '/discover/tv/' ||
				pathname === '/discover/person' ||
				pathname === '/discover/person/' ||
				pathname === '/person' ||
				pathname === '/person/'
			) {
				throw redirect(308, '/discover');
			}
			if (pathname.startsWith('/movie/')) {
				throw redirect(308, `/discover/movie/${pathname.slice('/movie/'.length)}`);
			}
			if (pathname.startsWith('/tv/')) {
				throw redirect(308, `/discover/tv/${pathname.slice('/tv/'.length)}`);
			}
			if (pathname.startsWith('/person/')) {
				throw redirect(308, `/discover/person/${pathname.slice('/person/'.length)}`);
			}

			const isStreamingRoute = event.url.pathname.startsWith('/api/streaming/');

			requestLogger.debug('Incoming request');

			const startTime = performance.now();

			try {
				const response = await resolve(event, {
					preload: ({ type }) => type !== 'js'
				});

				response.headers.set('x-correlation-id', correlationId);

				if (pathname.startsWith('/api/')) {
					const responseWithRateLimit = applyRateLimitHeaders(event, response);
					responseWithRateLimit.headers.forEach((value, key) => {
						if (key.startsWith('x-ratelimit')) {
							response.headers.set(key, value);
						}
					});
				}

				if (isStreamingRoute) {
					for (const [header, value] of Object.entries(BASE_SECURITY_HEADERS)) {
						response.headers.set(header, value);
					}
					response.headers.set('Access-Control-Allow-Origin', '*');
					response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
					response.headers.set('Access-Control-Allow-Headers', 'Range, Content-Type');
				} else {
					for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
						response.headers.set(header, value);
					}
				}

				const duration = Math.round(performance.now() - startTime);
				requestLogger.debug({ status: response.status, durationMs: duration }, 'Request completed');

				return response;
			} catch (error) {
				if (isStreamingRoute) {
					requestLogger.error({ err: error, logDomain: 'streams' }, 'Streaming route error');
					const message = error instanceof Error ? error.message : 'Stream error';
					return new Response(message, {
						status: 500,
						headers: {
							'Content-Type': 'text/plain',
							'x-correlation-id': correlationId,
							'x-support-id': supportId,
							...BASE_SECURITY_HEADERS
						}
					});
				}

				requestLogger.error({ err: error }, 'Unhandled error in request');

				if (isAppError(error)) {
					const response = json(
						{
							success: false,
							...error.toJSON()
						},
						{
							status: error.statusCode,
							headers: {
								'x-correlation-id': correlationId,
								'x-support-id': supportId,
								...SECURITY_HEADERS
							}
						}
					);
					return response;
				}

				const response = json(
					{
						success: false,
						error: 'Internal Server Error',
						code: 'INTERNAL_ERROR'
					},
					{
						status: 500,
						headers: {
							'x-correlation-id': correlationId,
							'x-support-id': supportId,
							...SECURITY_HEADERS
						}
					}
				);
				return response;
			}
		}
	);
};

export const handle = sequence(localeHandler, authHandler, customHandler);
