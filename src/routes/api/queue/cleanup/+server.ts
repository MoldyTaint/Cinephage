/**
 * Queue Cleanup API
 *
 * POST /api/queue/cleanup - Clean up orphaned completed torrents from download clients
 *
 * Query params:
 *   dryRun=true - Preview what would be removed without actually removing
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { downloadMonitor } from '$lib/server/downloadClients/monitoring';
import { logger } from '$lib/logging';

export const POST: RequestHandler = async ({ url }) => {
	const dryRun = url.searchParams.get('dryRun') === 'true';

	logger.info({ dryRun }, 'Queue cleanup requested');

	try {
		const result = await downloadMonitor.cleanupOrphanedDownloads(dryRun);

		return json({
			success: true,
			dryRun,
			summary: {
				removed: result.removed.length,
				skipped: result.skipped.length,
				errors: result.errors.length
			},
			removed: result.removed,
			skipped: result.skipped,
			errors: result.errors
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		logger.error({ error: message }, 'Queue cleanup failed');

		return json(
			{
				success: false,
				error: message
			},
			{ status: 500 }
		);
	}
};
