import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { monitoringScheduler } from '$lib/server/monitoring/MonitoringScheduler.js';
import { monitoringSearchService } from '$lib/server/monitoring/search/MonitoringSearchService.js';
import { logger } from '$lib/logging';
import { requireAdmin } from '$lib/server/auth/authorization.js';

/**
 * POST /api/monitoring/search/upgrade
 * Manually trigger upgrade search
 *
 * Query params:
 * - dryRun=true: Simulate the search without grabbing. Logs what would happen and returns detailed upgrade decisions.
 */
export const POST: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	const { url } = event;
	const dryRun = url.searchParams.get('dryRun') === 'true';

	try {
		if (dryRun) {
			// Dry-run mode: simulate the search without grabbing
			logger.info('[API] Starting upgrade search dry-run');

			const results = await monitoringSearchService.searchForUpgrades({
				cutoffUnmetOnly: false,
				dryRun: true
			});

			return json({
				success: true,
				message: 'Upgrade search dry-run completed (no grabs performed)',
				dryRun: true,
				summary: results.summary,
				items: results.items,
				upgradeDetails: results.upgradeDetails
			});
		}

		// Normal mode: actually grab upgrades
		const result = await monitoringScheduler.runUpgradeSearch();

		return json({
			success: true,
			message: 'Upgrade search completed',
			result
		});
	} catch (error) {
		logger.error('[API] Failed to run upgrade search', error instanceof Error ? error : undefined);
		return json(
			{
				success: false,
				error: 'Failed to run upgrade search',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
