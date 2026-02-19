/**
 * EPG Sync API
 *
 * POST /api/livetv/epg/sync - Trigger EPG sync for all accounts (non-blocking)
 * POST /api/livetv/epg/sync?accountId=xxx - Trigger EPG sync for specific account (non-blocking)
 *
 * Returns immediately while sync runs in background.
 * Use GET /api/livetv/epg/status to check sync progress.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEpgService } from '$lib/server/livetv/epg';
import { liveTvEvents } from '$lib/server/livetv/LiveTvEvents';
import { logger } from '$lib/logging';

export const POST: RequestHandler = async ({ url }) => {
	const accountId = url.searchParams.get('accountId');

	// Fire-and-forget: start sync in background, return immediately
	setImmediate(async () => {
		try {
			const epgService = getEpgService();

			if (accountId) {
				logger.info('[EPG] Starting background sync for account', { accountId });
				liveTvEvents.emitEpgSyncStarted(accountId);
				try {
					await epgService.syncAccount(accountId);
					liveTvEvents.emitEpgSyncCompleted(accountId);
					logger.info('[EPG] Background sync complete for account', { accountId });
				} catch (err) {
					liveTvEvents.emitEpgSyncFailed(
						accountId,
						err instanceof Error ? err.message : 'Unknown error'
					);
					throw err;
				}
			} else {
				logger.info('[EPG] Starting background sync for all accounts');
				liveTvEvents.emitEpgSyncStarted();
				try {
					const results = await epgService.syncAll();
					liveTvEvents.emitEpgSyncCompleted();
					const successful = results.filter((r) => r.success).length;
					const totalAdded = results.reduce((sum, r) => sum + r.programsAdded, 0);
					logger.info('[EPG] Background sync complete', {
						accounts: results.length,
						successful,
						totalAdded
					});
				} catch (err) {
					liveTvEvents.emitEpgSyncFailed(
						undefined,
						err instanceof Error ? err.message : 'Unknown error'
					);
					throw err;
				}
			}
		} catch (error) {
			logger.error('[EPG] Background sync failed', {
				accountId,
				error: error instanceof Error ? error.message : 'Unknown error'
			});
		}
	});

	return json({
		success: true,
		started: true,
		message: accountId
			? `EPG sync started for account ${accountId}`
			: 'EPG sync started for all accounts'
	});
};
