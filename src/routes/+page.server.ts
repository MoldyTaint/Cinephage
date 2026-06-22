import type { PageServerLoad } from './$types';
import { logger } from '$lib/logging';
import { activityService } from '$lib/server/activity';
import {
	getDashboardStats,
	getRecentlyAdded,
	getMissingEpisodes
} from '$lib/server/dashboard/queries';
import { getUpcomingItems } from '$lib/server/calendar/queries.js';
import { getCalendarPreferences } from '$lib/server/settings/calendar-preferences.js';
import type { DashboardStats } from '$lib/types/dashboard.js';

export const load: PageServerLoad = async () => {
	try {
		// Fetch critical stats immediately (blocks SSR)
		const stats = await getDashboardStats();

		// Stream non-critical data using SvelteKit's streaming
		const recentlyAddedPromise = getRecentlyAdded().catch((error) => {
			logger.error(
				{ err: error, component: 'DashboardPage' },
				'[Dashboard] Error fetching recently added'
			);
			return { movies: [], series: [] };
		});

		const missingEpisodesPromise = getMissingEpisodes().catch((error) => {
			logger.error(
				{ err: error, component: 'DashboardPage' },
				'[Dashboard] Error fetching missing episodes'
			);
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
				logger.error(
					{ err: error, component: 'DashboardPage' },
					'[Dashboard] Error fetching activity'
				);
				return [];
			});

		const upcomingPromise = getCalendarPreferences()
			.catch(() => ({
				upcomingShowNonLibrary: true,
				excludeAdult: false,
				certifications: [] as string[]
			}))
			.then((prefs) =>
				getUpcomingItems(7, prefs.upcomingShowNonLibrary, prefs.excludeAdult, prefs.certifications)
			)
			.catch((error) => {
				logger.error(
					{ err: error, component: 'DashboardPage' },
					'[Dashboard] Error fetching upcoming items'
				);
				return [];
			});

		return {
			stats,
			recentlyAdded: recentlyAddedPromise,
			missingEpisodes: missingEpisodesPromise,
			recentActivity: activityPromise,
			upcoming: upcomingPromise
		};
	} catch (error) {
		logger.error(
			{ err: error, component: 'DashboardPage' },
			'[Dashboard] Error loading dashboard data'
		);
		return {
			stats: {
				movies: {
					total: 0,
					withFile: 0,
					missing: 0,
					inCinemas: 0,
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
				stalledDownloads: 0,
				pausedDownloads: 0,
				downloadSpeedBytes: 0,
				downloadAvgProgress: 0,
				movingDownloads: 0,
				completedDownloadsLast24h: 0,
				unmatchedFiles: 0,
				missingRootFolders: 0,
				storage: {
					movieBytes: 0,
					tvBytes: 0,
					totalBytes: 0,
					freeBytes: 0
				},
				config: {
					indexerCount: 0,
					downloadClientCount: 0,
					rootFolderCount: 0,
					tmdbConfigured: false
				}
			} satisfies DashboardStats,
			recentlyAdded: { movies: [], series: [] },
			missingEpisodes: [],
			recentActivity: [],
			upcoming: []
		};
	}
};
