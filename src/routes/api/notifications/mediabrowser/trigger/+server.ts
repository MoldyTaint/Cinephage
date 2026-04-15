/**
 * POST /api/notifications/mediabrowser/trigger - Trigger a manual library refresh
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getMediaBrowserManager } from '$lib/server/notifications/mediabrowser';
import { requireAdmin } from '$lib/server/auth/authorization.js';

/**
 * POST /api/notifications/mediabrowser/trigger
 * Trigger a full library refresh on all enabled MediaBrowser servers.
 * Use this for manual refresh when automatic notifications are not sufficient.
 */
export const POST: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	const manager = getMediaBrowserManager();

	try {
		const enabledClients = await manager.getEnabledClients();

		if (enabledClients.length === 0) {
			return json({ success: false, error: 'No enabled servers configured' });
		}

		const results = await Promise.all(
			enabledClients.map(async ({ server, client }) => {
				try {
					await client.refreshLibrary();
					return { serverId: server.id, name: server.name, success: true };
				} catch (error) {
					const message = error instanceof Error ? error.message : 'Unknown error';
					return { serverId: server.id, name: server.name, success: false, error: message };
				}
			})
		);

		const successCount = results.filter((r) => r.success).length;
		return json({
			success: successCount > 0,
			triggeredCount: successCount,
			totalCount: results.length,
			results
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json({ success: false, error: message }, { status: 500 });
	}
};
