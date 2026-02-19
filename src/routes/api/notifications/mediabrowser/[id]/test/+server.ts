/**
 * POST /api/notifications/mediabrowser/:id/test - Test a saved server's connection
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getMediaBrowserManager } from '$lib/server/notifications/mediabrowser';

/**
 * POST /api/notifications/mediabrowser/:id/test
 * Test connection for an existing MediaBrowser server.
 * Accepts optional JSON overrides (host/apiKey/serverType).
 * Persists health status by default unless `persist: false` is provided.
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const manager = getMediaBrowserManager();
	let overrides:
		| {
				host?: string;
				apiKey?: string;
				serverType?: 'jellyfin' | 'emby';
				persist?: boolean;
		  }
		| undefined;

	try {
		// Optional JSON body allows edit-modal tests to validate entered values
		// without saving them yet.
		const contentType = request.headers.get('content-type') ?? '';
		if (contentType.includes('application/json')) {
			const body = await request.json();
			if (body && typeof body === 'object') {
				const candidate = body as Record<string, unknown>;
				overrides = {};
				if (typeof candidate.host === 'string') overrides.host = candidate.host;
				if (typeof candidate.apiKey === 'string') overrides.apiKey = candidate.apiKey;
				if (candidate.serverType === 'jellyfin' || candidate.serverType === 'emby') {
					overrides.serverType = candidate.serverType;
				}
				if (typeof candidate.persist === 'boolean') overrides.persist = candidate.persist;
			}
		}
	} catch {
		return json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
	}

	try {
		const testResult = await manager.testServer(params.id, overrides);
		return json(testResult);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json({ success: false, error: message });
	}
};
