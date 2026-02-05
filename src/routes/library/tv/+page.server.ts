import { db } from '$lib/server/db/index.js';
import { series, rootFolders, scoringProfiles, episodeFiles } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import type { LibrarySeries, EpisodeFile } from '$lib/types/library';
import { logger } from '$lib/logging';
import { DEFAULT_PROFILES } from '$lib/server/scoring/profiles.js';

export interface QualityProfileSummary {
	id: string;
	name: string;
	description: string;
	isBuiltIn: boolean;
	isDefault: boolean;
}

export const load: PageServerLoad = async ({ url }) => {
	// Parse URL params for sorting and filtering
	const sort = url.searchParams.get('sort') || 'title-asc';
	const monitored = url.searchParams.get('monitored') || 'all';
	const status = url.searchParams.get('status') || 'all';
	const progress = url.searchParams.get('progress') || 'all';
	const qualityProfile = url.searchParams.get('qualityProfile') || 'all';
	const resolution = url.searchParams.get('resolution') || 'all';
	const videoCodec = url.searchParams.get('videoCodec') || 'all';
	const hdrFormat = url.searchParams.get('hdrFormat') || 'all';

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
				rootFolderMediaType: rootFolders.mediaType,
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
			missingRootFolder: !s.rootFolderId || !s.rootFolderPath || s.rootFolderMediaType !== 'tv',
			percentComplete:
				s.episodeCount && s.episodeCount > 0
					? Math.round(((s.episodeFileCount || 0) / s.episodeCount) * 100)
					: 0
		})) as LibrarySeries[];

		// Fetch all episode files for file-type filtering and size aggregation
		const allEpisodeFiles = await db
			.select({
				seriesId: episodeFiles.seriesId,
				size: episodeFiles.size,
				quality: episodeFiles.quality,
				mediaInfo: episodeFiles.mediaInfo
			})
			.from(episodeFiles);

		// Build seriesId -> total size map for sort-by-size
		const seriesTotalSizeMap = new Map<string, number>();
		for (const file of allEpisodeFiles) {
			seriesTotalSizeMap.set(
				file.seriesId,
				(seriesTotalSizeMap.get(file.seriesId) ?? 0) + (file.size ?? 0)
			);
		}

		// Extract unique file attribute values for filter dropdowns
		const uniqueResolutions = new Set<string>();
		const uniqueCodecs = new Set<string>();
		const uniqueHdrFormats = new Set<string>();

		for (const file of allEpisodeFiles) {
			const quality = file.quality as EpisodeFile['quality'];
			const mediaInfo = file.mediaInfo as EpisodeFile['mediaInfo'];
			if (quality?.resolution) uniqueResolutions.add(quality.resolution);
			if (mediaInfo?.videoCodec) uniqueCodecs.add(mediaInfo.videoCodec);
			if (mediaInfo?.hdrFormat) uniqueHdrFormats.add(mediaInfo.hdrFormat);
		}

		// Build sets of series IDs that have matching files (for filtering)
		const seriesWithResolution = new Set<string>();
		const seriesWithCodec = new Set<string>();
		const seriesWithHdr = new Set<string>();
		const seriesWithSdr = new Set<string>();

		for (const file of allEpisodeFiles) {
			const quality = file.quality as EpisodeFile['quality'];
			const mediaInfo = file.mediaInfo as EpisodeFile['mediaInfo'];

			if (resolution !== 'all' && quality?.resolution === resolution) {
				seriesWithResolution.add(file.seriesId);
			}
			if (videoCodec !== 'all' && mediaInfo?.videoCodec === videoCodec) {
				seriesWithCodec.add(file.seriesId);
			}
			if (!mediaInfo?.hdrFormat) {
				seriesWithSdr.add(file.seriesId);
			}
			if (hdrFormat !== 'all' && hdrFormat !== 'sdr' && mediaInfo?.hdrFormat === hdrFormat) {
				seriesWithHdr.add(file.seriesId);
			}
		}

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

		// Filter by quality profile
		if (qualityProfile === 'default') {
			filteredSeries = filteredSeries.filter((s) => s.scoringProfileId === null);
		} else if (qualityProfile !== 'all') {
			filteredSeries = filteredSeries.filter((s) => s.scoringProfileId === qualityProfile);
		}

		// Filter by resolution
		if (resolution !== 'all') {
			filteredSeries = filteredSeries.filter((s) => seriesWithResolution.has(s.id));
		}

		// Filter by video codec
		if (videoCodec !== 'all') {
			filteredSeries = filteredSeries.filter((s) => seriesWithCodec.has(s.id));
		}

		// Filter by HDR format
		if (hdrFormat === 'sdr') {
			filteredSeries = filteredSeries.filter((s) => seriesWithSdr.has(s.id));
		} else if (hdrFormat !== 'all') {
			filteredSeries = filteredSeries.filter((s) => seriesWithHdr.has(s.id));
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
				case 'size':
					comparison = (seriesTotalSizeMap.get(a.id) ?? 0) - (seriesTotalSizeMap.get(b.id) ?? 0);
					break;
				default:
					comparison = (a.title || '').localeCompare(b.title || '');
			}

			return sortDir === 'desc' ? -comparison : comparison;
		});

		// Fetch quality profiles
		const dbProfiles = await db
			.select({
				id: scoringProfiles.id,
				name: scoringProfiles.name,
				description: scoringProfiles.description,
				isDefault: scoringProfiles.isDefault
			})
			.from(scoringProfiles);

		const BUILT_IN_IDS = DEFAULT_PROFILES.map((p) => p.id);
		const dbIds = new Set(dbProfiles.map((p) => p.id));
		const hasDbDefault = dbProfiles.some((p) => Boolean(p.isDefault));

		const qualityProfiles: QualityProfileSummary[] = [
			...DEFAULT_PROFILES.filter((p) => !dbIds.has(p.id)).map((p) => ({
				id: p.id,
				name: p.name,
				description: p.description,
				isBuiltIn: true,
				isDefault: !hasDbDefault && p.id === 'efficient'
			})),
			...dbProfiles.map((p) => ({
				id: p.id,
				name: p.name,
				description: p.description ?? '',
				isBuiltIn: BUILT_IN_IDS.includes(p.id),
				isDefault: Boolean(p.isDefault)
			}))
		];

		// Sort unique values for consistent dropdown ordering
		const resolutionOrder = ['2160p', '1080p', '720p', '576p', '480p'];
		const sortedResolutions = [...uniqueResolutions].sort(
			(a, b) =>
				(resolutionOrder.indexOf(a) === -1 ? 999 : resolutionOrder.indexOf(a)) -
				(resolutionOrder.indexOf(b) === -1 ? 999 : resolutionOrder.indexOf(b))
		);

		return {
			series: filteredSeries,
			total: filteredSeries.length,
			totalUnfiltered: seriesWithStats.length,
			filters: {
				sort,
				monitored,
				status,
				progress,
				qualityProfile,
				resolution,
				videoCodec,
				hdrFormat
			},
			qualityProfiles,
			uniqueResolutions: sortedResolutions,
			uniqueCodecs: [...uniqueCodecs].sort(),
			uniqueHdrFormats: [...uniqueHdrFormats].sort()
		};
	} catch (error) {
		logger.error('[TV Page] Error loading series', error instanceof Error ? error : undefined);
		const emptySeries: LibrarySeries[] = [];
		const emptyProfiles: QualityProfileSummary[] = [];
		const emptyStrings: string[] = [];
		return {
			series: emptySeries,
			total: 0,
			totalUnfiltered: 0,
			filters: {
				sort,
				monitored,
				status,
				progress,
				qualityProfile,
				resolution,
				videoCodec,
				hdrFormat
			},
			qualityProfiles: emptyProfiles,
			uniqueResolutions: emptyStrings,
			uniqueCodecs: emptyStrings,
			uniqueHdrFormats: emptyStrings,
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
			logger.error(
				'[TV] Failed to toggle all monitored',
				error instanceof Error ? error : undefined
			);
			return { success: false, error: 'Failed to update series' };
		}
	}
};
