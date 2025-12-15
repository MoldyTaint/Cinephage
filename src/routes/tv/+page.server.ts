import { db } from '$lib/server/db/index.js';
import { series, rootFolders } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import type { LibrarySeries } from '$lib/types/library';
import { logger } from '$lib/logging';

export const load: PageServerLoad = async ({ url }) => {
	// Parse URL params for sorting and filtering
	const sort = url.searchParams.get('sort') || 'title-asc';
	const monitored = url.searchParams.get('monitored') || 'all';
	const status = url.searchParams.get('status') || 'all';
	const progress = url.searchParams.get('progress') || 'all';

	try {
		// Fetch all series with their root folder info
		const allSeries = await db
			.select({
				id: series.id,
				tmdbId: series.tmdbId,
				tvdbId: series.tvdbId,
				imdbId: series.imdbId,
				title: series.title,
				originalTitle: series.originalTitle,
				year: series.year,
				overview: series.overview,
				posterPath: series.posterPath,
				backdropPath: series.backdropPath,
				status: series.status,
				network: series.network,
				genres: series.genres,
				path: series.path,
				rootFolderId: series.rootFolderId,
				rootFolderPath: rootFolders.path,
				qualityPresetId: series.qualityPresetId,
				scoringProfileId: series.scoringProfileId,
				monitored: series.monitored,
				seasonFolder: series.seasonFolder,
				wantsSubtitles: series.wantsSubtitles,
				added: series.added,
				episodeCount: series.episodeCount,
				episodeFileCount: series.episodeFileCount
			})
			.from(series)
			.leftJoin(rootFolders, eq(series.rootFolderId, rootFolders.id));

		// Calculate percentages and format data
		const seriesWithStats: LibrarySeries[] = allSeries.map((s) => ({
			...s,
			percentComplete:
				s.episodeCount && s.episodeCount > 0
					? Math.round(((s.episodeFileCount || 0) / s.episodeCount) * 100)
					: 0
		})) as LibrarySeries[];

		// Apply filters
		let filteredSeries = seriesWithStats;

		// Filter by monitored status
		if (monitored === 'monitored') {
			filteredSeries = filteredSeries.filter((s) => s.monitored);
		} else if (monitored === 'unmonitored') {
			filteredSeries = filteredSeries.filter((s) => !s.monitored);
		}

		// Filter by series status
		if (status === 'continuing') {
			filteredSeries = filteredSeries.filter(
				(s) =>
					s.status?.toLowerCase() === 'returning series' ||
					s.status?.toLowerCase() === 'in production'
			);
		} else if (status === 'ended') {
			filteredSeries = filteredSeries.filter(
				(s) => s.status?.toLowerCase() === 'ended' || s.status?.toLowerCase() === 'canceled'
			);
		}

		// Filter by progress
		if (progress === 'complete') {
			filteredSeries = filteredSeries.filter((s) => s.percentComplete === 100);
		} else if (progress === 'inProgress') {
			filteredSeries = filteredSeries.filter(
				(s) => s.percentComplete > 0 && s.percentComplete < 100
			);
		} else if (progress === 'notStarted') {
			filteredSeries = filteredSeries.filter((s) => s.percentComplete === 0);
		}

		// Apply sorting
		const [sortField, sortDir] = sort.split('-') as [string, 'asc' | 'desc'];
		filteredSeries.sort((a, b) => {
			let comparison = 0;

			switch (sortField) {
				case 'title':
					comparison = (a.title || '').localeCompare(b.title || '');
					break;
				case 'added':
					comparison = new Date(a.added).getTime() - new Date(b.added).getTime();
					break;
				case 'year':
					comparison = (a.year || 0) - (b.year || 0);
					break;
				case 'progress':
					comparison = a.percentComplete - b.percentComplete;
					break;
				default:
					comparison = (a.title || '').localeCompare(b.title || '');
			}

			return sortDir === 'desc' ? -comparison : comparison;
		});

		return {
			series: filteredSeries,
			total: filteredSeries.length,
			totalUnfiltered: seriesWithStats.length,
			filters: {
				sort,
				monitored,
				status,
				progress
			}
		};
	} catch (error) {
		logger.error('[TV Page] Error loading series', error instanceof Error ? error : undefined);
		return {
			series: [],
			total: 0,
			totalUnfiltered: 0,
			filters: {
				sort,
				monitored,
				status,
				progress
			},
			error: 'Failed to load TV shows'
		};
	}
};

export const actions = {
	toggleAllMonitored: async ({ request }) => {
		const formData = await request.formData();
		const monitored = formData.get('monitored') === 'true';

		try {
			await db.update(series).set({ monitored });
			return { success: true };
		} catch (error) {
			logger.error('[TV] Failed to toggle all monitored', error instanceof Error ? error : undefined);
			return { success: false, error: 'Failed to update series' };
		}
	}
};
