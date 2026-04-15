import { db } from '$lib/server/db/index.js';
import {
	movies,
	movieFiles,
	rootFolders,
	libraries,
	scoringProfiles,
	profileSizeLimits,
	downloadQueue
} from '$lib/server/db/schema.js';
import { eq, and, inArray, isNotNull } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import type { LibraryMovie, MovieFile } from '$lib/types/library';
import { logger } from '$lib/logging';
import { DEFAULT_PROFILES } from '$lib/server/scoring/profiles.js';
import { getLibraryEntityService } from '$lib/server/library/LibraryEntityService.js';

const ACTIVE_DOWNLOAD_STATUSES = [
	'queued',
	'downloading',
	'stalled',
	'paused',
	'completed',
	'postprocessing',
	'importing',
	'seeding',
	'seeding-imported'
] as const;

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
	const requestedLibraryScope = url.searchParams.get('library')?.trim() || '';

	try {
		const availableLibraries = await getLibraryEntityService().listLibraries({
			mediaType: 'movie'
		});
		const defaultLibrary =
			availableLibraries.find((library) => library.isDefault) ?? availableLibraries[0] ?? null;
		const selectedLibrary =
			availableLibraries.find(
				(library) => library.slug === requestedLibraryScope || library.id === requestedLibraryScope
			) ?? defaultLibrary;
		const hasSubLibraries = availableLibraries.some((library) => !library.isDefault);
		const isSubLibraryScope = Boolean(selectedLibrary && !selectedLibrary.isDefault);

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
				libraryId: movies.libraryId,
				rootFolderPath: rootFolders.path,
				rootFolderMediaType: rootFolders.mediaType,
				rootFolderMediaSubType: rootFolders.mediaSubType,
				librarySlug: libraries.slug,
				libraryName: libraries.name,
				libraryMediaSubType: libraries.mediaSubType,
				libraryIsDefault: libraries.isDefault,
				scoringProfileId: movies.scoringProfileId,
				monitored: movies.monitored,
				minimumAvailability: movies.minimumAvailability,
				wantsSubtitles: movies.wantsSubtitles,
				added: movies.added,
				hasFile: movies.hasFile
			})
			.from(movies)
			.leftJoin(rootFolders, eq(movies.rootFolderId, rootFolders.id))
			.leftJoin(libraries, eq(movies.libraryId, libraries.id));

		// Fetch active queue movie IDs (including paused/seeding states)
		const activeQueueMovies = await db
			.select({ movieId: downloadQueue.movieId })
			.from(downloadQueue)
			.where(
				and(
					isNotNull(downloadQueue.movieId),
					inArray(downloadQueue.status, [...ACTIVE_DOWNLOAD_STATUSES])
				)
			);
		const downloadingMovieIds = new Set(activeQueueMovies.map((q) => q.movieId!));

		// Batch-fetch all movie files in a single query instead of N+1
		const allMovieIds = allMovies.map((m) => m.id);
		const allFiles =
			allMovieIds.length > 0
				? await db.select().from(movieFiles).where(inArray(movieFiles.movieId, allMovieIds))
				: [];

		// Group files by movieId
		const filesByMovieId = new Map<string, typeof allFiles>();
		for (const f of allFiles) {
			let bucket = filesByMovieId.get(f.movieId);
			if (!bucket) {
				bucket = [];
				filesByMovieId.set(f.movieId, bucket);
			}
			bucket.push(f);
		}

		const moviesWithFiles: (LibraryMovie & {
			libraryId?: string | null;
			rootFolderMediaSubType?: string | null;
			libraryMediaSubType?: string | null;
		})[] = allMovies.map((movie) => {
			const files = filesByMovieId.get(movie.id) ?? [];
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
				})),
				libraryId: movie.libraryId ?? null
			} as LibraryMovie & {
				libraryId?: string | null;
				rootFolderMediaSubType?: string | null;
				libraryMediaSubType?: string | null;
			};
		});

		const inferLegacySubtype = (movie: {
			rootFolderMediaSubType?: string | null;
			libraryMediaSubType?: string | null;
		}): 'standard' | 'anime' => {
			const candidate = movie.rootFolderMediaSubType ?? movie.libraryMediaSubType;
			return candidate === 'anime' ? 'anime' : 'standard';
		};

		const belongsToScope = (
			movie: {
				libraryId?: string | null;
				rootFolderMediaSubType?: string | null;
				libraryMediaSubType?: string | null;
			},
			scopeLibraryId: string,
			scopeMediaSubType: string
		): boolean => {
			if (movie.libraryId) {
				return movie.libraryId === scopeLibraryId;
			}
			const inferredSubtype = inferLegacySubtype(movie);
			if (scopeMediaSubType === 'anime') return inferredSubtype === 'anime';
			if (scopeMediaSubType === 'standard') return inferredSubtype === 'standard';
			return false;
		};

		const moviesInSelectedLibrary = selectedLibrary
			? moviesWithFiles.filter((movie) =>
					belongsToScope(movie, selectedLibrary.id, selectedLibrary.mediaSubType)
				)
			: moviesWithFiles;

		const libraryScopeOptions = availableLibraries.map((library) => ({
			id: library.id,
			slug: library.slug,
			name: library.name,
			isDefault: library.isDefault,
			mediaSubType: library.mediaSubType,
			count: moviesWithFiles.filter((movie) =>
				belongsToScope(movie, library.id, library.mediaSubType)
			).length
		}));

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

		// Fetch quality profiles and resolve the effective default profile ID
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
		const effectiveQualityProfileFilter =
			qualityProfile === 'default' ? resolvedDefaultId : qualityProfile;

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

		// Apply filters (within selected library scope)
		let filteredMovies = moviesInSelectedLibrary;

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

		// Filter by quality profile (treat null as "uses resolved default profile")
		if (effectiveQualityProfileFilter !== 'all') {
			filteredMovies = filteredMovies.filter(
				(m) => (m.scoringProfileId ?? resolvedDefaultId) === effectiveQualityProfileFilter
			);
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
			let comparison: number;

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
			totalUnfiltered: moviesInSelectedLibrary.length,
			downloadingMovieIds: [...downloadingMovieIds],
			filters: {
				sort,
				library: selectedLibrary?.slug ?? '',
				monitored,
				fileStatus,
				qualityProfile: effectiveQualityProfileFilter,
				resolution,
				videoCodec,
				hdrFormat
			},
			libraryScope: {
				selected: selectedLibrary
					? {
							id: selectedLibrary.id,
							slug: selectedLibrary.slug,
							name: selectedLibrary.name,
							isDefault: selectedLibrary.isDefault,
							mediaSubType: selectedLibrary.mediaSubType
						}
					: null,
				options: libraryScopeOptions,
				hasSubLibraries,
				isSubLibraryScope
			},
			qualityProfiles,
			uniqueResolutions: sortedResolutions,
			uniqueCodecs: [...uniqueCodecs].sort(),
			uniqueHdrFormats: [...uniqueHdrFormats].sort()
		};
	} catch (error) {
		logger.error({ err: error }, '[Movies Page] Error loading movies');
		const emptyMovies: LibraryMovie[] = [];
		const emptyProfiles: QualityProfileSummary[] = [];
		const emptyStrings: string[] = [];
		return {
			movies: emptyMovies,
			total: 0,
			totalUnfiltered: 0,
			downloadingMovieIds: [] as string[],
			filters: {
				sort,
				library: '',
				monitored,
				fileStatus,
				qualityProfile,
				resolution,
				videoCodec,
				hdrFormat
			},
			libraryScope: {
				selected: null,
				options: [],
				hasSubLibraries: false,
				isSubLibraryScope: false
			},
			qualityProfiles: emptyProfiles,
			uniqueResolutions: emptyStrings,
			uniqueCodecs: emptyStrings,
			uniqueHdrFormats: emptyStrings,
			error: 'Failed to load movies'
		};
	}
};

export const actions: Actions = {
	toggleAllMonitored: async ({ request }) => {
		const formData = await request.formData();
		const monitored = formData.get('monitored') === 'true';

		try {
			await db.update(movies).set({ monitored });
			return { success: true };
		} catch (error) {
			logger.error({ err: error }, '[Movies] Failed to toggle all monitored');
			return { success: false, error: 'Failed to update movies' };
		}
	}
};
