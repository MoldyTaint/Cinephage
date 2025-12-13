import type { PageServerLoad } from './$types.js';
import { monitoringScheduler } from '$lib/server/monitoring/MonitoringScheduler.js';
import { db } from '$lib/server/db/index.js';
import { monitoringHistory } from '$lib/server/db/schema.js';
import { desc } from 'drizzle-orm';
import { logger } from '$lib/logging';

/**
 * Load monitoring status and recent history
 */
export const load: PageServerLoad = async () => {
	try {
		// Get current monitoring status (includes subtitle task intervals)
		const status = await monitoringScheduler.getStatus();

		// Get recent history (last 50 items) with related movie/series/episode data
		const recentHistory = await db.query.monitoringHistory.findMany({
			orderBy: [desc(monitoringHistory.executedAt)],
			limit: 50,
			with: {
				movie: { columns: { title: true } },
				series: { columns: { title: true } },
				episode: {
					columns: { episodeNumber: true, seasonNumber: true, title: true },
					with: {
						series: { columns: { title: true } }
					}
				}
			}
		});

		return {
			status,
			recentHistory
		};
	} catch (error) {
		logger.error(
			'[Monitoring Page] Error loading data',
			error instanceof Error ? error : undefined
		);
		return {
			status: null,
			recentHistory: [],
			error: error instanceof Error ? error.message : 'Failed to load monitoring data'
		};
	}
};
