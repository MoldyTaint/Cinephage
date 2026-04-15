/**
 * GET /api/notifications/mediabrowser - List all MediaBrowser servers
 * POST /api/notifications/mediabrowser - Create a new server
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getMediaBrowserManager } from '$lib/server/notifications/mediabrowser';
import { mediaBrowserServerCreateSchema } from '$lib/validation/schemas';
import { requireAdmin } from '$lib/server/auth/authorization.js';
import { parseBody } from '$lib/server/api/validate.js';

/**
 * GET /api/notifications/mediabrowser
 * List all configured media servers (Jellyfin/Emby/Plex).
 */
export const GET: RequestHandler = async () => {
	const manager = getMediaBrowserManager();
	const servers = await manager.getServers();
	return json(servers);
};

/**
 * POST /api/notifications/mediabrowser
 * Create a new MediaBrowser server.
 */
export const POST: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	const { request } = event;
	const result = await parseBody(request, mediaBrowserServerCreateSchema);

	const manager = getMediaBrowserManager();

	const shouldValidateConnection = result.enabled ?? true;
	if (shouldValidateConnection) {
		const testResult = await manager.testServerConfig({
			host: result.host,
			apiKey: result.apiKey,
			serverType: result.serverType
		});

		if (!testResult.success) {
			return json(
				{
					error: testResult.error
						? `Connection test failed: ${testResult.error}`
						: 'Connection test failed'
				},
				{ status: 400 }
			);
		}
	}

	const created = await manager.createServer(result);
	return json({ success: true, server: created });
};
