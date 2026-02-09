/**
 * API endpoint for managing a specific backup link
 * DELETE /api/livetv/lineup/[id]/backups/[backupId] - Remove a backup link
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { channelLineupService } from '$lib/server/livetv/lineup/ChannelLineupService';
import { logger } from '$lib/logging';

/**
 * Remove a backup link
 */
export const DELETE: RequestHandler = async ({ params }) => {
	const { id, backupId } = params;

	try {
		// Verify lineup item exists
		const item = await channelLineupService.getChannelById(id);
		if (!item) {
			return json(
				{
					success: false,
					error: 'Lineup item not found'
				},
				{ status: 404 }
			);
		}

		const success = await channelLineupService.removeBackup(backupId);

		if (!success) {
			return json(
				{
					success: false,
					error: 'Backup not found'
				},
				{ status: 404 }
			);
		}

		return json({
			success: true
		});
	} catch (error) {
		logger.error('[API] Failed to remove backup', error instanceof Error ? error : undefined);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to remove backup'
			},
			{ status: 500 }
		);
	}
};
