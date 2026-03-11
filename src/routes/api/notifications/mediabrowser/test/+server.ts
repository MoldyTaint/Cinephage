/**
 * POST /api/notifications/mediabrowser/test - Test server configuration before saving
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getMediaBrowserManager } from '$lib/server/notifications/mediabrowser';
import { mediaBrowserServerTestSchema } from '$lib/validation/schemas';

/**
 * POST /api/notifications/mediabrowser/test
 * Test media server (Jellyfin/Emby/Plex) connection with provided credentials.
 * Use this to validate credentials before creating/updating a server.
 */
export const POST: RequestHandler = async ({ request }) => {
	let data: unknown;
	try {
		data = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const result = mediaBrowserServerTestSchema.safeParse(data);

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
		const testResult = await manager.testServerConfig(result.data);
		return json(testResult);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json({ success: false, error: message });
	}
};
