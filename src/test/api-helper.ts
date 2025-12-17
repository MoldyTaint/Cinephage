/**
 * API Test Helper
 *
 * Provides utilities for testing SvelteKit API endpoints directly.
 * Creates mock Request objects and parses Response objects for assertions.
 */

import type { RequestEvent } from '@sveltejs/kit';

/**
 * Create a mock Request object for testing
 */
export function createRequest(
	method: string,
	body?: unknown,
	options?: {
		url?: string;
		headers?: Record<string, string>;
	}
): Request {
	const url = options?.url ?? 'http://localhost/api/test';
	const headers = new Headers({
		'Content-Type': 'application/json',
		...options?.headers
	});

	const requestInit: RequestInit = {
		method,
		headers
	};

	if (body !== undefined && method !== 'GET') {
		requestInit.body = JSON.stringify(body);
	}

	return new Request(url, requestInit);
}

/**
 * Create a minimal RequestEvent for testing handlers
 */
export function createRequestEvent(
	request: Request,
	params: Record<string, string> = {}
): Partial<RequestEvent> {
	return {
		request,
		params,
		url: new URL(request.url),
		locals: {} as App.Locals,
		platform: undefined,
		cookies: {
			get: () => undefined,
			getAll: () => [],
			set: () => {},
			delete: () => {},
			serialize: () => ''
		} as RequestEvent['cookies'],
		fetch: globalThis.fetch,
		getClientAddress: () => '127.0.0.1',
		setHeaders: () => {},
		isDataRequest: false,
		isSubRequest: false
	};
}

/**
 * Helper to call an API handler and get parsed response
 */
export async function callHandler<T = unknown>(
	handler: (event: RequestEvent) => Promise<Response>,
	method: string,
	body?: unknown,
	options?: {
		url?: string;
		params?: Record<string, string>;
		headers?: Record<string, string>;
	}
): Promise<{ status: number; data: T }> {
	const request = createRequest(method, body, options);
	const event = createRequestEvent(request, options?.params);

	const response = await handler(event as RequestEvent);
	const data = (await response.json()) as T;

	return { status: response.status, data };
}

/**
 * Shorthand helpers for common HTTP methods
 */
export const api = {
	async get<T = unknown>(
		handler: (event: RequestEvent) => Promise<Response>,
		options?: { url?: string; params?: Record<string, string> }
	): Promise<{ status: number; data: T }> {
		return callHandler<T>(handler, 'GET', undefined, options);
	},

	async post<T = unknown>(
		handler: (event: RequestEvent) => Promise<Response>,
		body: unknown,
		options?: { url?: string; params?: Record<string, string> }
	): Promise<{ status: number; data: T }> {
		return callHandler<T>(handler, 'POST', body, options);
	},

	async put<T = unknown>(
		handler: (event: RequestEvent) => Promise<Response>,
		body: unknown,
		options?: { url?: string; params?: Record<string, string> }
	): Promise<{ status: number; data: T }> {
		return callHandler<T>(handler, 'PUT', body, options);
	},

	async delete<T = unknown>(
		handler: (event: RequestEvent) => Promise<Response>,
		body: unknown,
		options?: { url?: string; params?: Record<string, string> }
	): Promise<{ status: number; data: T }> {
		return callHandler<T>(handler, 'DELETE', body, options);
	}
};

/**
 * Type helpers for common API response shapes
 */
export interface ProfilesListResponse {
	profiles: Array<{
		id: string;
		name: string;
		description?: string;
		isBuiltIn: boolean;
		isDefault: boolean;
		formatScores?: Record<string, number>;
		movieMinSizeGb?: number | null;
		movieMaxSizeGb?: number | null;
		episodeMinSizeMb?: number | null;
		episodeMaxSizeMb?: number | null;
	}>;
	count: number;
	defaultProfileId: string;
}

export interface ProfileResponse {
	id: string;
	name: string;
	description?: string;
	formatScores?: Record<string, number>;
	isDefault?: boolean;
}

export interface ErrorResponse {
	error: string;
	details?: unknown;
}

export interface DeleteResponse {
	success: boolean;
	deleted: unknown;
}
