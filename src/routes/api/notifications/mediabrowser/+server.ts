/**
 * GET /api/notifications/mediabrowser - List all MediaBrowser servers
 * POST /api/notifications/mediabrowser - Create a new server
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getMediaBrowserManager } from '$lib/server/notifications/mediabrowser';
import { mediaBrowserServerCreateSchema } from '$lib/validation/schemas';

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
export const POST: RequestHandler = async ({ request }) => {
	let data: unknown;
	try {
		data = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const result = mediaBrowserServerCreateSchema.safeParse(data);

	if (!result.success) {
		return json(
			{
				error: 'Validation failed',
				details: result.error.flatten()
			},
			{ status: 400 }
		);
	}

	const manager = getMediaBrowserManager();

	try {
		const shouldValidateConnection = result.data.enabled ?? true;
		if (shouldValidateConnection) {
			const testResult = await manager.testServerConfig({
				host: result.data.host,
				apiKey: result.data.apiKey,
				serverType: result.data.serverType
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

		const created = await manager.createServer(result.data);
		return json({ success: true, server: created });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json({ error: message }, { status: 500 });
	}
};
