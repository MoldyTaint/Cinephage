import { db } from '$lib/server/db/index.js';
import { delayProfileService } from '$lib/server/monitoring/specifications/DelaySpecification.js';
import {
	movies,
	movieFiles,
	rootFolders,
	scoringProfiles,
	downloadQueue,
	subtitles,
	libraries
} from '$lib/server/db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { LibraryMovie, MovieFile, QualityProfileSummary } from '$lib/types/library';
import type { MovieDetails } from '$lib/types/tmdb';
import { tmdb } from '$lib/server/tmdb.js';
import { logger } from '$lib/logging';
import { isMovieSearching } from '$lib/server/library/ActiveSearchTracker.js';
import { ACTIVE_DOWNLOAD_STATUSES } from '$lib/types/queue';
import { resolveMissingAnimeProviderRefs } from '$lib/server/metadata/provider-ref-resolver.js';
import { getMetadataProviderConfig } from '$lib/server/metadata/provider-settings.js';

export interface QueueItemInfo {
	id: string;
	title: string;
	status: string;
	progress: number | null;
}

export interface LibraryMoviePageData {
	movie: LibraryMovie;
	librarySlug: string | null;
	libraryName: string | null;
	tmdbDetails: MovieDetails | null;
	qualityProfiles: QualityProfileSummary[];
	delayProfiles: Array<{
		id: string;
		name: string;
		torrentDelay: number;
		usenetDelay: number;
		enabled: boolean | null;
		preferredProtocol: string | null;
		bypassIfHighestQuality: boolean | null;
		bypassIfAboveScore: number | null;
	}>;
	rootFolders: Array<{
		id: string;
		name: string;
		path: string;
		mediaType: string;
		mediaSubType: string | null;
		freeSpaceBytes: number | null;
	}>;
	queueItem: QueueItemInfo | null;
	isSearching: boolean;
	configuredMetadataProviders: {
		anilist: boolean;
		mal: boolean;
	};
	collectionMovies: {
		id: string;
		title: string;
		year: number | null;
		posterPath: string | null;
		hasFile: boolean | null;
		monitored: boolean | null;
	}[];
}

function isAnimeMovieSignal(input: {
	rootFolderPath: string | null;
	genres: string[] | null;
	title: string;
}): boolean {
	const path = (input.rootFolderPath ?? '').toLowerCase();
	if (path.includes('/anime/')) return true;
	const genres = input.genres ?? [];
	if (genres.some((genre) => genre.toLowerCase() === 'animation')) return true;
	return /\banime\b/i.test(input.title);
}

export const load: PageServerLoad = async ({ params }): Promise<LibraryMoviePageData> => {
	const { id } = params;

	// Fetch the movie with root folder info
	const movieResult = await db
		.select({
			id: movies.id,
			tmdbId: movies.tmdbId,
			imdbId: movies.imdbId,
			providerRefs: movies.providerRefs,
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
			scoringProfileId: movies.scoringProfileId,
			monitored: movies.monitored,
			minimumAvailability: movies.minimumAvailability,
			wantsSubtitles: movies.wantsSubtitles,
			added: movies.added,
			hasFile: movies.hasFile,
			tmdbCollectionId: movies.tmdbCollectionId,
			releaseDate: movies.releaseDate,
			digitalReleaseDate: movies.digitalReleaseDate,
			physicalReleaseDate: movies.physicalReleaseDate,
			availabilityDelay: movies.availabilityDelay,
			downloadReleaseDate: movies.downloadReleaseDate,
			downloadReleaseType: movies.downloadReleaseType,
			libraryId: movies.libraryId,
			librarySlug: libraries.slug,
			libraryName: libraries.name,
			libraryIsDefault: libraries.isDefault
		})
		.from(movies)
		.leftJoin(rootFolders, eq(movies.rootFolderId, rootFolders.id))
		.leftJoin(libraries, eq(movies.libraryId, libraries.id))
		.where(eq(movies.id, id));

	if (movieResult.length === 0) {
		error(404, 'Movie not found in library');
	}

	const movie = movieResult[0];

	const [files, movieSubtitles, releaseInfo, tmdbDetails] = await Promise.all([
		db.select().from(movieFiles).where(eq(movieFiles.movieId, id)),
		db
			.select({
				id: subtitles.id,
				language: subtitles.language,
				isForced: subtitles.isForced,
				isHearingImpaired: subtitles.isHearingImpaired,
				format: subtitles.format,
				matchScore: subtitles.matchScore,
				providerId: subtitles.providerId,
				dateAdded: subtitles.dateAdded,
				wasSynced: subtitles.wasSynced,
				syncOffset: subtitles.syncOffset
			})
			.from(subtitles)
			.where(eq(subtitles.movieId, id)),
		tmdb.getMovieReleaseInfo(movie.tmdbId).catch((err) => {
			logger.warn(
				{
					movieId: id,
					tmdbId: movie.tmdbId,
					error: err instanceof Error ? err.message : String(err)
				},
				'[LibraryMovie] Failed to fetch TMDB release info'
			);
			return null;
		}),
		tmdb.getMovie(movie.tmdbId).catch((err) => {
			logger.warn(
				{
					movieId: id,
					tmdbId: movie.tmdbId,
					error: err instanceof Error ? err.message : String(err)
				},
				'[LibraryMovie] Failed to fetch TMDB movie details'
			);
			return null;
		})
	]);

	const movieWithFiles: LibraryMovie = {
		...movie,
		tmdbStatus: releaseInfo?.status ?? null,
		releaseDate: releaseInfo?.release_date ?? null,
		// Ensure added is always a string
		added: movie.added ?? new Date().toISOString(),
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
		subtitles: movieSubtitles.map((s) => ({
			id: s.id,
			language: s.language,
			isForced: s.isForced ?? undefined,
			isHearingImpaired: s.isHearingImpaired ?? undefined,
			format: s.format ?? undefined,
			matchScore: s.matchScore,
			providerId: s.providerId,
			dateAdded: s.dateAdded,
			wasSynced: s.wasSynced ?? undefined,
			syncOffset: s.syncOffset
		}))
	};

	const dbProfiles = await db
		.select({
			id: scoringProfiles.id,
			name: scoringProfiles.name,
			description: scoringProfiles.description,
			isDefault: scoringProfiles.isDefault,
			isBuiltIn: scoringProfiles.isBuiltIn
		})
		.from(scoringProfiles);

	const resolvedDefaultId =
		dbProfiles.find((p) => !p.isBuiltIn && p.isDefault)?.id ??
		dbProfiles.find((p) => p.isBuiltIn && p.isDefault)?.id ??
		'balanced';

	const allQualityProfiles: QualityProfileSummary[] = dbProfiles.map((p) => ({
		id: p.id,
		name: p.name,
		description: p.description ?? '',
		isBuiltIn: !!p.isBuiltIn,
		isDefault: p.id === resolvedDefaultId
	}));

	// Fetch movie root folders for the edit modal
	const folders = await db
		.select({
			id: rootFolders.id,
			name: rootFolders.name,
			path: rootFolders.path,
			mediaType: rootFolders.mediaType,
			mediaSubType: rootFolders.mediaSubType,
			freeSpaceBytes: rootFolders.freeSpaceBytes
		})
		.from(rootFolders)
		.where(eq(rootFolders.mediaType, 'movie'));

	// Fetch active queue item for this movie
	const queueResults = await db
		.select({
			id: downloadQueue.id,
			title: downloadQueue.title,
			status: downloadQueue.status,
			progress: downloadQueue.progress
		})
		.from(downloadQueue)
		.where(
			and(
				eq(downloadQueue.movieId, id),
				inArray(downloadQueue.status, [...ACTIVE_DOWNLOAD_STATUSES])
			)
		);

	const queueItem: QueueItemInfo | null =
		queueResults.length > 0
			? {
					id: queueResults[0].id,
					title: queueResults[0].title,
					status: queueResults[0].status ?? 'queued',
					progress: queueResults[0].progress ? parseFloat(queueResults[0].progress) : null
				}
			: null;

	let collectionMovies: {
		id: string;
		title: string;
		year: number | null;
		posterPath: string | null;
		hasFile: boolean | null;
		monitored: boolean | null;
	}[] = [];
	if (movie.tmdbCollectionId) {
		collectionMovies = await db
			.select({
				id: movies.id,
				title: movies.title,
				year: movies.year,
				posterPath: movies.posterPath,
				hasFile: movies.hasFile,
				monitored: movies.monitored
			})
			.from(movies)
			.where(eq(movies.tmdbCollectionId, movie.tmdbCollectionId));
		collectionMovies = collectionMovies.filter((m) => m.id !== movie.id);
	}

	const isSearching = isMovieSearching(id);
	const providerConfig = await getMetadataProviderConfig();
	const configuredMetadataProviders = {
		anilist: providerConfig.animeEnrichmentEnabled,
		mal: providerConfig.animeEnrichmentEnabled
	};

	const enrichedProviderRefs = await resolveMissingAnimeProviderRefs({
		title: movieWithFiles.title,
		aliases: [movieWithFiles.originalTitle ?? ''],
		year: movieWithFiles.year,
		isAnime: isAnimeMovieSignal({
			rootFolderPath: movieWithFiles.rootFolderPath ?? null,
			genres: movieWithFiles.genres ?? null,
			title: movieWithFiles.title
		}),
		configured: configuredMetadataProviders,
		existingRefs:
			(movieWithFiles.providerRefs as Partial<Record<'tmdb' | 'anilist' | 'mal', string>> | null) ??
			undefined
	});
	movieWithFiles.providerRefs = enrichedProviderRefs;

	const librarySlug = movie.libraryIsDefault ? null : (movie.librarySlug ?? null);
	const libraryName = movie.libraryName ?? null;

	const delayProfiles = await delayProfileService.getProfiles();

	return {
		movie: movieWithFiles,
		librarySlug,
		libraryName,
		tmdbDetails,
		qualityProfiles: allQualityProfiles,
		delayProfiles,
		rootFolders: folders,
		queueItem,
		isSearching,
		configuredMetadataProviders,
		collectionMovies
	};
};
