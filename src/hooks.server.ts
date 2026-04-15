import type { Handle, HandleServerError } from '@sveltejs/kit';
import { json, redirect } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { randomUUID } from 'node:crypto';
import { building } from '$app/environment';

import { AUTH_BASE_PATH } from '$lib/auth/config.js';
import {
	createRequestLogger,
	logger,
	registerServerLogSinks,
	runWithLogContext
} from '$lib/logging';
import { getLibraryScheduler } from '$lib/server/library/library-scheduler.js';
import { isFFprobeAvailable, getFFprobeVersion } from '$lib/server/library/ffprobe.js';
import { getDownloadMonitor } from '$lib/server/downloadClients/monitoring';
import { getImportService } from '$lib/server/downloadClients/import/ImportService.js';
import { getMonitoringScheduler } from '$lib/server/monitoring/MonitoringScheduler.js';
import { getExternalIdService } from '$lib/server/services/ExternalIdService.js';
import { getDataRepairService } from '$lib/server/services/DataRepairService.js';
import { qualityFilter } from '$lib/server/quality';
import { isAppError } from '$lib/errors';
import { initializeDatabase } from '$lib/server/db';
import { getCaptchaSolver } from '$lib/server/captcha';
import { getServiceManager } from '$lib/server/services/service-manager.js';
import { initPersistentStreamCache } from '$lib/server/streaming/cache/PersistentStreamCache';
import { getNntpManager } from '$lib/server/streaming/usenet/NntpManager';
import { getExtractionCacheManager } from '$lib/server/streaming/nzb/extraction/ExtractionCacheManager';
import { getMediaBrowserNotifier } from '$lib/server/notifications/mediabrowser';
import { getEpgScheduler } from '$lib/server/livetv/epg';
import { getLiveTvAccountManager } from '$lib/server/livetv/LiveTvAccountManager';
import { getLiveTvChannelService } from '$lib/server/livetv/LiveTvChannelService';
import { getLiveTvStreamService } from '$lib/server/livetv/streaming/LiveTvStreamService';
import { getStalkerPortalManager } from '$lib/server/livetv/stalker/StalkerPortalManager';
import { initializeProviderFactory } from '$lib/server/subtitles/providers/SubtitleProviderFactory.js';
import {
	auth,
	ensureStreamingApiKeyRateLimit,
	isSetupComplete,
	repairCurrentUserAdminRole
} from '$lib/server/auth/index.js';
import { checkApiRateLimit, applyRateLimitHeaders } from '$lib/server/rate-limit.js';
import type { SessionRecord, UserRecord } from '$lib/server/db/schema.js';
import { paraglideMiddleware } from '$lib/paraglide/server.js';
import { logCaptureStore } from '$lib/server/logging/log-capture-store.js';
import { logHistoryService } from '$lib/server/logging/log-history.js';

/**
 * Content Security Policy header.
 * Note: 'unsafe-inline' is required for Svelte's inline styles and some script functionality.
 * For stricter CSP, would need to implement nonce-based CSP with SvelteKit hooks.
 * Current policy is acceptable for LAN-only deployment.
 */
const CSP_HEADER = [
	"default-src 'self'",
	"script-src 'self' 'unsafe-inline'",
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data: https: http:",
	"connect-src 'self'",
	"font-src 'self'",
	"media-src 'self' blob: https: http:",
	"object-src 'none'",
	"child-src 'self'",
	"frame-ancestors 'self'"
].join('; ');

/**
 * Security headers for all responses
 * Note: upgrade-insecure-requests and Strict-Transport-Security removed for HTTP-only deployment
 */
const SECURITY_HEADERS = {
	'X-Frame-Options': 'SAMEORIGIN',
	'X-Content-Type-Options': 'nosniff',
	'X-XSS-Protection': '1; mode=block',
	'Referrer-Policy': 'strict-origin-when-cross-origin',
	'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
	'Content-Security-Policy': CSP_HEADER
};

/**
 * Base security headers (for streaming routes - without CSP)
 */
const BASE_SECURITY_HEADERS = {
	'X-Frame-Options': 'SAMEORIGIN',
	'X-Content-Type-Options': 'nosniff',
	'X-XSS-Protection': '1; mode=block',
	'Referrer-Policy': 'strict-origin-when-cross-origin'
};

type AuthSessionUser = {
	id: string;
	email: string;
	name?: string | null;
	image?: string | null;
	username?: string | null;
	displayUsername?: string | null;
	role?: string | null;
	language?: string | null;
	emailVerified?: boolean | number | null;
	banned?: boolean | number | null;
	banReason?: string | null;
	banExpires?: string | Date | null;
	createdAt?: string | Date | null;
	updatedAt?: string | Date | null;
};

type AuthSessionRecord = {
	id: string;
	userId: string;
	token: string;
	expiresAt?: string | Date | null;
	ipAddress?: string | null;
	userAgent?: string | null;
	impersonatedBy?: string | null;
	createdAt?: string | Date | null;
	updatedAt?: string | Date | null;
};

function createSupportId(): string {
	return randomUUID().split('-')[0] ?? randomUUID();
}

function toIntegerFlag(value: boolean | number | null | undefined): number | null {
	if (typeof value === 'number') {
		return value;
	}
	if (typeof value === 'boolean') {
		return value ? 1 : 0;
	}
	return null;
}

function toIsoString(value: string | Date | null | undefined): string {
	if (value instanceof Date) {
		return value.toISOString();
	}
	if (typeof value === 'string') {
		return value;
	}
	return new Date().toISOString();
}

function normalizeAuthUser(user: AuthSessionUser): UserRecord {
	return {
		id: user.id,
		name: user.name ?? null,
		email: user.email,
		emailVerified: toIntegerFlag(user.emailVerified),
		image: user.image ?? null,
		username: user.username ?? null,
		displayUsername: user.displayUsername ?? null,
		role: user.role ?? 'user',
		language: user.language ?? 'en',
		banned: toIntegerFlag(user.banned),
		banReason: user.banReason ?? null,
		banExpires:
			user.banExpires instanceof Date ? user.banExpires.toISOString() : (user.banExpires ?? null),
		createdAt: toIsoString(user.createdAt),
		updatedAt: toIsoString(user.updatedAt)
	};
}

function normalizeAuthSession(session: AuthSessionRecord): SessionRecord {
	return {
		id: session.id,
		userId: session.userId,
		token: session.token,
		expiresAt: toIsoString(session.expiresAt),
		ipAddress: session.ipAddress ?? null,
		userAgent: session.userAgent ?? null,
		impersonatedBy: session.impersonatedBy ?? null,
		createdAt: toIsoString(session.createdAt),
		updatedAt: toIsoString(session.updatedAt)
	};
}

function setAuthenticatedLocals(
	event: Parameters<Handle>[0]['event'],
	session: { user: AuthSessionUser; session: AuthSessionRecord },
	apiKey: string | null,
	apiKeyPermissions: Record<string, string[]> | null = null
): void {
	event.locals.user = normalizeAuthUser(session.user);
	event.locals.session = normalizeAuthSession(session.session);
	event.locals.apiKey = apiKey;
	event.locals.apiKeyPermissions = apiKeyPermissions;
}

function clearAuthenticatedLocals(event: Parameters<Handle>[0]['event']): void {
	event.locals.user = null;
	event.locals.session = null;
	event.locals.apiKey = null;
	event.locals.apiKeyPermissions = null;
}

/**
 * Locale handler - Sets up i18n context for the request using Paraglide
 * Must run early in the sequence to ensure locale is available for all handlers
 */
const localeHandler: Handle = async ({ event, resolve }) => {
	// Use paraglide middleware to handle locale detection and setting
	// The middleware reads/writes the PARAGLIDE_LOCALE cookie automatically
	return paraglideMiddleware(event.request, () => {
		// Continue with the SvelteKit request
		return resolve(event);
	});
};

/**
 * Global initialization promise - ensures init runs only once
 */
let initializationPromise: Promise<void> | null = null;
let initializationStarted = false;

/**
 * Initialize all background services
 */
async function initializeServices(): Promise<void> {
	// Skip during build
	if (building) {
		logger.info('Skipping service initialization during build');
		return;
	}

	// Prevent concurrent initialization
	if (initializationPromise) {
		return initializationPromise;
	}

	initializationPromise = (async () => {
		try {
			registerServerLogSinks({
				logCaptureStore,
				logHistoryService
			});

			await initializeDatabase();
			const updatedStreamingKeys = await ensureStreamingApiKeyRateLimit();
			if (updatedStreamingKeys > 0) {
				logger.info(
					{
						updatedKeys: updatedStreamingKeys
					},
					'Updated streaming API key rate limits'
				);
			}
			logger.info('Initializing background services...');

			// Verify ffprobe is available
			const ffprobeAvailable = await isFFprobeAvailable();
			if (ffprobeAvailable) {
				const version = await getFFprobeVersion();
				logger.info(`ffprobe available: ${version}`);
			} else {
				logger.warn('ffprobe not found. Library refresh will be slower and less accurate.');
			}

			// Sync default scoring profiles (insert new or update existing built-in profiles)
			await qualityFilter.seedDefaultScoringProfiles();

			// Check quality profiles
			const profiles = await qualityFilter.getAllProfiles();
			logger.info(`Loaded ${profiles.length} quality profiles`);

			// Register all services with the service manager
			const serviceManager = getServiceManager();

			// Register library scheduler first
			const libraryScheduler = getLibraryScheduler();
			serviceManager.register(libraryScheduler);

			// Initialize library services
			await getLibraryScheduler().initialize();
			logger.info('Library scheduler initialized');

			// Initialize provider factory for subtitle providers
			await initializeProviderFactory();
			logger.info('Provider registry initialized with 13 providers');

			// Register download monitor
			const downloadMonitor = getDownloadMonitor();
			serviceManager.register(downloadMonitor);

			// ImportService does not implement BackgroundService; start it directly.
			getImportService().start();

			// Register monitoring scheduler
			const monitoringScheduler = getMonitoringScheduler();
			serviceManager.register(monitoringScheduler);

			// Register external ID service
			const externalIdService = getExternalIdService();
			serviceManager.register(externalIdService);

			// Register data repair service
			const dataRepairService = getDataRepairService();
			serviceManager.register(dataRepairService);

			// Initialize captcha solver
			const captchaSolver = getCaptchaSolver();
			if (captchaSolver) {
				serviceManager.register(captchaSolver);
				logger.info('CaptchaSolver initialized for anti-bot bypass');
			}

			// Initialize stream cache
			await initPersistentStreamCache();

			// Initialize NNTP manager
			const nntpManager = getNntpManager();
			serviceManager.register(nntpManager);

			// Initialize extraction cache manager
			const extractionCacheManager = getExtractionCacheManager();
			serviceManager.register(extractionCacheManager);

			// Initialize MediaBrowser notifier (Jellyfin/Emby/Plex library updates)
			const mediaBrowserNotifier = getMediaBrowserNotifier();
			serviceManager.register(mediaBrowserNotifier);
			logger.info('MediaBrowser notifier initialized for Jellyfin/Emby/Plex integration');

			// Initialize Live TV services
			const liveTvAccountManager = getLiveTvAccountManager();
			serviceManager.register(liveTvAccountManager);

			const liveTvChannelService = getLiveTvChannelService();
			serviceManager.register(liveTvChannelService);

			const liveTvStreamService = getLiveTvStreamService();
			serviceManager.register(liveTvStreamService);

			const stalkerPortalManager = getStalkerPortalManager();
			serviceManager.register(stalkerPortalManager);

			const epgScheduler = getEpgScheduler();
			serviceManager.register(epgScheduler);

			// Start all registered services
			serviceManager.startAll();

			logger.info('All background services initialized and started');
		} catch (error) {
			logger.error('Failed to initialize services', error);
			throw error;
		}
	})();

	return initializationPromise;
}

function ensureServicesInitialized(): void {
	if (building || initializationStarted) {
		return;
	}

	initializationStarted = true;
	initializeServices().catch((error) => {
		logger.error('Service initialization failed', error);
	});
}

/**
 * Handler 1: Better Auth routes
 * Handles all /api/auth/* routes using Better Auth's SvelteKit handler
 */
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

/**
 * Handler 2: Custom Cinephage logic
 * Handles setup flow, authentication checks, security headers, and request logging
 */
const customHandler: Handle = async ({ event, resolve }) => {
	// Generate or extract correlation ID (validate format to prevent header/log injection)
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

	// Attach to locals for use in routes
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
				// Live TV endpoints
				if (path === '/api/livetv/playlist.m3u' || path.startsWith('/api/livetv/playlist.m3u/')) {
					return true;
				}
				if (path === '/api/livetv/epg.xml' || path.startsWith('/api/livetv/epg.xml/')) {
					return true;
				}
				if (path.startsWith('/api/livetv/stream/')) {
					return true;
				}

				// Streaming endpoints (Cinephage Streamer .strm files)
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

			// Fetch session from Better Auth - check API key first, then cookie
			let session = null;
			let apiKey = null;

			if (!isStreamingApiRoute) {
				// Check for API key in header
				const apiKeyHeader = event.request.headers.get('x-api-key');
				if (apiKeyHeader) {
					try {
						// Get session from API key
						session = await auth.api.getSession({
							headers: new Headers({ 'x-api-key': apiKeyHeader })
						});
						apiKey = apiKeyHeader;
					} catch {
						// Invalid API key, continue to cookie auth
					}
				}

				// If no API key session, try cookie-based session
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

			// Check if setup is complete
			const setupComplete = await isSetupComplete();

			// Auth routes are already handled by authHandler
			if (pathname.startsWith(AUTH_BASE_PATH)) {
				return resolve(event);
			}

			/**
			 * Check if route is public (does not require authentication)
			 * Public routes:
			 * - /login - Login page
			 * - /api/auth/* - Better Auth routes (login/logout/session management)
			 * - /api/health - Health check endpoint
			 * - /api/ready - Readiness endpoint
			 * - /health - Legacy health endpoint (redirects to /api/health)
			 * All other routes require authentication
			 * Note: Live TV and Streaming endpoints require API key authentication (see requiresStreamingApiKey)
			 */
			function isPublicRoute(path: string): boolean {
				// Login page
				if (path === '/login' || path.startsWith('/login/')) {
					return true;
				}

				// Better Auth routes (handles its own auth)
				if (path.startsWith(AUTH_BASE_PATH)) {
					return true;
				}

				// Health/readiness endpoints
				if (isHealthRoute(path)) {
					return true;
				}

				return false;
			}

			// Check if route requires Media Streaming API Key authentication
			if (isStreamingApiRoute) {
				// Get API key from query parameter (for .strm files) or header (for API clients)
				const url = new URL(event.request.url);
				const apiKeyFromQuery = url.searchParams.get('api_key');
				const apiKeyFromHeader = event.request.headers.get('x-api-key');
				const apiKey = apiKeyFromQuery || apiKeyFromHeader;

				if (!apiKey) {
					// No API key provided - reject request
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

				// Validate the API key using Better Auth
				try {
					// First verify the key has streaming permissions (not just any valid key)
					const verifyResult = await auth.api.verifyApiKey({
						body: {
							key: apiKey,
							permissions: {
								streaming: ['*']
							}
						}
					});

					if (!verifyResult.valid) {
						// Log for migration detection - Main API key attempting streaming access
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

					// Streaming routes do not rely on a full Better Auth session.
					// Avoid fetching one here so API-key validation is only counted once.
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
				// If setup not complete, force to setup wizard
				if (!setupComplete) {
					// Keep health endpoints available for orchestrators during setup
					if (isHealthRoute(pathname)) {
						return resolve(event);
					}
					if (!pathname.startsWith('/setup')) {
						throw redirect(302, '/setup');
					}
				}
				// Setup is complete - require authentication
				else {
					// Check if route requires authentication
					if (!event.locals.user && !isPublicRoute(pathname)) {
						// API routes return 401, page routes redirect to login
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

			// Apply rate limiting to API routes
			if (pathname.startsWith('/api/')) {
				const rateLimitResponse = checkApiRateLimit(event);
				if (rateLimitResponse) {
					return rateLimitResponse;
				}
			}

			// Redirect away from setup/login if setup is complete and user is logged in
			if (setupComplete && event.locals.user) {
				if (pathname === '/setup' || pathname === '/login' || pathname.startsWith('/login/')) {
					throw redirect(302, '/');
				}
			}

			// Route standardization redirects
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

			// Check if this is a streaming route - these handle their own errors
			const isStreamingRoute = event.url.pathname.startsWith('/api/streaming/');

			// Log incoming request
			requestLogger.debug('Incoming request');

			const startTime = performance.now();

			try {
				// Disable JS modulepreload Link headers to reduce response header size.
				// With 270+ JS chunks, these headers can exceed nginx's default buffer (4KB).
				// Preload hints are still included in HTML <link> tags, so no functional impact.
				const response = await resolve(event, {
					preload: ({ type }) => type !== 'js'
				});

				// Add correlation ID to response headers
				response.headers.set('x-correlation-id', correlationId);

				// Add rate limit headers to API responses
				if (pathname.startsWith('/api/')) {
					const responseWithRateLimit = applyRateLimitHeaders(event, response);
					// Copy headers from rate limit response
					responseWithRateLimit.headers.forEach((value, key) => {
						if (key.startsWith('x-ratelimit')) {
							response.headers.set(key, value);
						}
					});
				}

				// Add security headers (skip CSP for streaming routes - they need flexible origins)
				if (isStreamingRoute) {
					// Apply base security headers even for streaming routes
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

				// Log completed request
				const duration = Math.round(performance.now() - startTime);
				requestLogger.debug({ status: response.status, durationMs: duration }, 'Request completed');

				return response;
			} catch (error) {
				// Streaming routes handle their own errors - re-throw to let SvelteKit handle
				if (isStreamingRoute) {
					requestLogger.error({ err: error, logDomain: 'streams' }, 'Streaming route error');
					// Return plain text error for streaming routes (media players expect this)
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

				// Log unhandled errors
				requestLogger.error({ err: error }, 'Unhandled error in request');

				// Handle AppError instances with consistent formatting
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

				// For non-AppError exceptions, return generic 500 error
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

/**
 * Export sequenced handlers
 * authHandler runs first, then customHandler for non-auth routes
 */
export const handle = sequence(localeHandler, authHandler, customHandler);

/**
 * Global error handler for uncaught exceptions.
 * This catches errors that weren't handled in the request handler.
 */
export const handleError: HandleServerError = ({ error, event }) => {
	const correlationId = event.locals.requestId ?? event.locals.correlationId ?? 'unknown';
	const supportId = event.locals.supportId ?? createSupportId();
	const requestLogger = event.locals.logger ?? logger;

	requestLogger.error(
		{
			err: error,
			requestId: correlationId,
			correlationId,
			supportId,
			logDomain: 'http',
			method: event.request.method,
			path: event.url.pathname
		},
		'Uncaught exception'
	);

	// Return safe error message to client
	if (isAppError(error)) {
		return {
			message: error.message,
			code: error.code,
			supportId
		};
	}

	return {
		message: error instanceof Error ? error.message : 'An unexpected error occurred',
		code: 'INTERNAL_ERROR',
		supportId
	};
};

/**
 * Graceful shutdown handlers
 * Ensure all background services are properly cleaned up on exit
 */
let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
	if (isShuttingDown) {
		logger.info('Shutdown already in progress, waiting...');
		return;
	}

	isShuttingDown = true;
	logger.info(`Received ${signal}, starting graceful shutdown...`);

	try {
		const serviceManager = getServiceManager();
		// Set a timeout to force exit if graceful shutdown hangs
		const timeout = setTimeout(() => {
			logger.error('Graceful shutdown timed out after 30s, forcing exit');
			process.exit(1);
		}, 30000);

		getImportService().stop();
		await serviceManager.stopAll();
		clearTimeout(timeout);

		logger.info('All services stopped successfully');
		process.exit(0);
	} catch (error) {
		logger.error('Error during graceful shutdown', error);
		process.exit(1);
	}
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
