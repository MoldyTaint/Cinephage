/**
 * POST /api/usenet/servers/sync - Sync NNTP servers from download clients
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getNntpServerService } from '$lib/server/streaming/nzb/NntpServerService';
import { requireAdmin } from '$lib/server/auth/authorization.js';

/**
 * POST /api/usenet/servers/sync
 * Sync NNTP servers from all configured Usenet download clients.
 * Creates new servers for ones not already present in the database.
 */
export const POST: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;
	const service = getNntpServerService();

	try {
		const result = await service.syncFromDownloadClients();

		return json({
			success: true,
			synced: result.synced,
			skipped: result.skipped,
			errors: result.errors
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json({ error: message }, { status: 500 });
	}
};
