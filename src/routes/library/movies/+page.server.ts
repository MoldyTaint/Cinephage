import { db } from '$lib/server/db/index.js';
import {
	movies,
	movieFiles,
	rootFolders,
	scoringProfiles,
	profileSizeLimits
} from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import type { LibraryMovie, MovieFile } from '$lib/types/library';
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
	const fileStatus = url.searchParams.get('fileStatus') || 'all';
	const qualityProfile = url.searchParams.get('qualityProfile') || 'all';
	const resolution = url.searchParams.get('resolution') || 'all';
	const videoCodec = url.searchParams.get('videoCodec') || 'all';
	const hdrFormat = url.searchParams.get('hdrFormat') || 'all';

	try {
		// Fetch all movies with their root folder info
		const allMovies = await db
			.select({
				id: movies.id,
				tmdbId: movies.tmdbId,
				imdbId: movies.imdbId,
				title: movies.title,
				originalTitle: movies.originalTitle,
				year: movies.year,
				overview: movies.overview,
				posterPath: movies.posterPath,
				backdropPath: movies.backdropPath,
				runtime: movies.runtime,
				genres: movies.genres,
				path: movies.path,
				rootFolderId: movies.rootFolderId,
				rootFolderPath: rootFolders.path,
				rootFolderMediaType: rootFolders.mediaType,
				scoringProfileId: movies.scoringProfileId,
				monitored: movies.monitored,
				minimumAvailability: movies.minimumAvailability,
				wantsSubtitles: movies.wantsSubtitles,
				added: movies.added,
				hasFile: movies.hasFile
			})
			.from(movies)
			.leftJoin(rootFolders, eq(movies.rootFolderId, rootFolders.id));

		// Get file info for each movie
		const moviesWithFiles: LibraryMovie[] = await Promise.all(
			allMovies.map(async (movie) => {
				const files = await db.select().from(movieFiles).where(eq(movieFiles.movieId, movie.id));

				return {
					...movie,
					missingRootFolder:
						!movie.rootFolderId || !movie.rootFolderPath || movie.rootFolderMediaType !== 'movie',
					files: files.map((f) => ({
						id: f.id,
						relativePath: f.relativePath,
						size: f.size,
						dateAdded: f.dateAdded,
						quality: f.quality as MovieFile['quality'],
						mediaInfo: f.mediaInfo as MovieFile['mediaInfo'],
						releaseGroup: f.releaseGroup,
						edition: f.edition
					}))
				} as LibraryMovie;
			})
		);

		// Extract unique file attribute values for filter dropdowns
		const uniqueResolutions = new Set<string>();
		const uniqueCodecs = new Set<string>();
		const uniqueHdrFormats = new Set<string>();

		for (const movie of moviesWithFiles) {
			for (const file of movie.files) {
				if (file.quality?.resolution) uniqueResolutions.add(file.quality.resolution);
				if (file.mediaInfo?.videoCodec) uniqueCodecs.add(file.mediaInfo.videoCodec);
				if (file.mediaInfo?.hdrFormat) uniqueHdrFormats.add(file.mediaInfo.hdrFormat);
			}
		}

		// Apply filters
		let filteredMovies = moviesWithFiles;

		// Filter by monitored status
		if (monitored === 'monitored') {
			filteredMovies = filteredMovies.filter((m) => m.monitored);
		} else if (monitored === 'unmonitored') {
			filteredMovies = filteredMovies.filter((m) => !m.monitored);
		}

		// Filter by file status
		if (fileStatus === 'hasFile') {
			filteredMovies = filteredMovies.filter((m) => m.hasFile);
		} else if (fileStatus === 'missingFile') {
			filteredMovies = filteredMovies.filter((m) => !m.hasFile);
		}

		// Filter by quality profile
		if (qualityProfile === 'default') {
			filteredMovies = filteredMovies.filter((m) => m.scoringProfileId === null);
		} else if (qualityProfile !== 'all') {
			filteredMovies = filteredMovies.filter((m) => m.scoringProfileId === qualityProfile);
		}

		// Filter by resolution
		if (resolution !== 'all') {
			filteredMovies = filteredMovies.filter((m) =>
				m.files.some((f) => f.quality?.resolution === resolution)
			);
		}

		// Filter by video codec
		if (videoCodec !== 'all') {
			filteredMovies = filteredMovies.filter((m) =>
				m.files.some((f) => f.mediaInfo?.videoCodec === videoCodec)
			);
		}

		// Filter by HDR format
		if (hdrFormat === 'sdr') {
			filteredMovies = filteredMovies.filter((m) => m.files.some((f) => !f.mediaInfo?.hdrFormat));
		} else if (hdrFormat !== 'all') {
			filteredMovies = filteredMovies.filter((m) =>
				m.files.some((f) => f.mediaInfo?.hdrFormat === hdrFormat)
			);
		}

		// Apply sorting
		const [sortField, sortDir] = sort.split('-') as [string, 'asc' | 'desc'];
		filteredMovies.sort((a, b) => {
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
				case 'size':
					comparison =
						a.files.reduce((s, f) => s + (f.size ?? 0), 0) -
						b.files.reduce((s, f) => s + (f.size ?? 0), 0);
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

		const defaultBuiltInOverride = await db
			.select({ profileId: profileSizeLimits.profileId })
			.from(profileSizeLimits)
			.where(eq(profileSizeLimits.isDefault, true))
			.limit(1);

		const BUILT_IN_IDS = DEFAULT_PROFILES.map((p) => p.id);
		const dbIds = new Set(dbProfiles.map((p) => p.id));
		const customDefaultId = dbProfiles.find(
			(p) => !BUILT_IN_IDS.includes(p.id) && Boolean(p.isDefault)
		)?.id;
		const builtInDefaultId = defaultBuiltInOverride[0]?.profileId;
		const resolvedDefaultId = customDefaultId ?? builtInDefaultId ?? 'balanced';

		const qualityProfiles: QualityProfileSummary[] = [
			...DEFAULT_PROFILES.filter((p) => !dbIds.has(p.id)).map((p) => ({
				id: p.id,
				name: p.name,
				description: p.description,
				isBuiltIn: true,
				isDefault: p.id === resolvedDefaultId
			})),
			...dbProfiles.map((p) => ({
				id: p.id,
				name: p.name,
				description: p.description ?? '',
				isBuiltIn: BUILT_IN_IDS.includes(p.id),
				isDefault: p.id === resolvedDefaultId
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
			movies: filteredMovies,
			total: filteredMovies.length,
			totalUnfiltered: moviesWithFiles.length,
			filters: {
				sort,
				monitored,
				fileStatus,
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
		logger.error('[Movies Page] Error loading movies', error instanceof Error ? error : undefined);
		const emptyMovies: LibraryMovie[] = [];
		const emptyProfiles: QualityProfileSummary[] = [];
		const emptyStrings: string[] = [];
		return {
			movies: emptyMovies,
			total: 0,
			totalUnfiltered: 0,
			filters: {
				sort,
				monitored,
				fileStatus,
				qualityProfile,
				resolution,
				videoCodec,
				hdrFormat
			},
			qualityProfiles: emptyProfiles,
			uniqueResolutions: emptyStrings,
			uniqueCodecs: emptyStrings,
			uniqueHdrFormats: emptyStrings,
			error: 'Failed to load movies'
		};
	}
};

export const actions = {
	toggleAllMonitored: async ({ request }) => {
		const formData = await request.formData();
		const monitored = formData.get('monitored') === 'true';

		try {
			await db.update(movies).set({ monitored });
			return { success: true };
		} catch (error) {
			logger.error(
				'[Movies] Failed to toggle all monitored',
				error instanceof Error ? error : undefined
			);
			return { success: false, error: 'Failed to update movies' };
		}
	}
};
