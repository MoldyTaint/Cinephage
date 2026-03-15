import type { PageServerLoad } from './$types';
import { logger } from '$lib/logging';
import { activityService } from '$lib/server/activity';
import {
	getDashboardStats,
	getRecentlyAdded,
	getMissingEpisodes
} from '$lib/server/dashboard/queries';

export const load: PageServerLoad = async ({ setHeaders }) => {
	try {
		// Fetch critical stats immediately (blocks SSR)
		const stats = await getDashboardStats();

		// Stream non-critical data using SvelteKit's streaming
		const recentlyAddedPromise = getRecentlyAdded().catch((error) => {
			logger.error('[Dashboard] Error fetching recently added', {
				error: error instanceof Error ? error.message : String(error)
			});
			return { movies: [], series: [] };
		});

		const missingEpisodesPromise = getMissingEpisodes().catch((error) => {
			logger.error('[Dashboard] Error fetching missing episodes', {
				error: error instanceof Error ? error.message : String(error)
			});
			return [];
		});

		const activityPromise = activityService
			.getActivities(
				{ status: 'all', mediaType: 'all', protocol: 'all' },
				{ field: 'time', direction: 'desc' },
				{ limit: 18, offset: 0 },
				'history'
			)
			.then((result) => result.activities)
			.catch((error) => {
				logger.error('[Dashboard] Error fetching activity', {
					error: error instanceof Error ? error.message : String(error)
				});
				return [];
			});

		return {
			stats,
			recentlyAdded: recentlyAddedPromise,
			missingEpisodes: missingEpisodesPromise,
			recentActivity: activityPromise
		};
	} catch (error) {
		logger.error(
			'[Dashboard] Error loading dashboard data',
			error instanceof Error ? error : undefined
		);
		return {
			stats: {
				movies: {
					total: 0,
					withFile: 0,
					missing: 0,
					unreleased: 0,
					unmonitoredMissing: 0,
					monitored: 0
				},
				series: { total: 0, monitored: 0 },
				episodes: {
					total: 0,
					withFile: 0,
					missing: 0,
					unaired: 0,
					unmonitoredMissing: 0,
					monitored: 0
				},
				activeDownloads: 0,
				queuedDownloads: 0,
				downloadSpeedBytes: 0,
				downloadAvgProgress: 0,
				movingDownloads: 0,
				completedDownloadsLast24h: 0,
				unmatchedFiles: 0,
				missingRootFolders: 0,
				storage: {
					movieBytes: 0,
					tvBytes: 0,
					totalBytes: 0
				}
			},
			recentlyAdded: { movies: [], series: [] },
			missingEpisodes: [],
			recentActivity: []
		};
	}
};
