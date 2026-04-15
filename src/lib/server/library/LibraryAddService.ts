/**
 * Library Add Service
 *
 * Shared logic for adding movies and series to the library.
 * Handles common operations:
 * - Root folder validation
 * - Scoring profile assignment
 * - Language profile assignment
 * - Search-on-add triggering
 */

import { db } from '$lib/server/db/index.js';
import { rootFolders, languageProfiles, scoringProfiles } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { tmdb } from '$lib/server/tmdb.js';
import { qualityFilter } from '$lib/server/quality/index.js';
import { searchOnAdd } from './searchOnAdd.js';
import { SearchWorker, workerManager } from '$lib/server/workers/index.js';
import { ValidationError, NotFoundError, ExternalServiceError } from '$lib/errors';
import { createChildLogger } from '$lib/logging';
import { getEffectiveAnimeRootFolderEnforcement } from './anime-root-enforcement-settings.js';

const logger = createChildLogger({ logDomain: 'scans' as const });

export type MediaType = 'movie' | 'tv';

export interface RootFolderInfo {
	id: string;
	path: string;
	mediaType: string;
	mediaSubType: string;
}

export interface RootFolderValidationOptions {
	enforceAnimeSubtype?: boolean;
	isAnimeMedia?: boolean;
	mediaTitle?: string;
}

export interface ExternalIds {
	imdbId: string | null;
	tvdbId: number | null;
}

export interface SearchOnAddResult {
	triggered: boolean;
}

/**
 * Validate that a root folder exists and is for the correct media type
 */
export async function validateRootFolder(
	rootFolderId: string,
	expectedMediaType: MediaType,
	options: RootFolderValidationOptions = {}
): Promise<RootFolderInfo> {
	const [folder] = await db
		.select()
		.from(rootFolders)
		.where(eq(rootFolders.id, rootFolderId))
		.limit(1);

	if (!folder) {
		throw new NotFoundError('Root folder', rootFolderId);
	}

	if (folder.mediaType !== expectedMediaType) {
		const typeLabel = expectedMediaType === 'movie' ? 'Movies' : 'TV shows';
		throw new ValidationError(`Root folder is not configured for ${typeLabel}`, {
			mediaType: folder.mediaType,
			expected: expectedMediaType
		});
	}

	const mediaSubType = folder.mediaSubType ?? 'standard';
	if (options.enforceAnimeSubtype && typeof options.isAnimeMedia === 'boolean') {
		const expectedMediaSubType = options.isAnimeMedia ? 'anime' : 'standard';
		if (mediaSubType !== expectedMediaSubType) {
			const mediaLabel = options.isAnimeMedia ? 'Anime' : 'Standard';
			const expectedLabel = expectedMediaSubType === 'anime' ? 'Anime' : 'Standard';
			throw new ValidationError(
				`${mediaLabel} media can only be added to a ${expectedLabel} root folder while anime enforcement is enabled`,
				{
					rootFolderId: folder.id,
					rootFolderName: folder.name,
					mediaSubType,
					expectedMediaSubType,
					isAnimeMedia: options.isAnimeMedia,
					title: options.mediaTitle
				}
			);
		}
	}

	return {
		id: folder.id,
		path: folder.path,
		mediaType: folder.mediaType,
		mediaSubType
	};
}

export async function getAnimeSubtypeEnforcement(): Promise<boolean> {
	return getEffectiveAnimeRootFolderEnforcement();
}

/**
 * Get the effective scoring profile ID (provided or default)
 */
export async function getEffectiveScoringProfileId(providedProfileId?: string): Promise<string> {
	// Ensure built-in profiles exist as valid FK targets before resolving the final profile ID.
	await qualityFilter.seedDefaultScoringProfiles();

	if (providedProfileId) {
		const existingProfile = await db
			.select({ id: scoringProfiles.id })
			.from(scoringProfiles)
			.where(eq(scoringProfiles.id, providedProfileId))
			.limit(1)
			.get();

		if (!existingProfile) {
			throw new ValidationError(
				'Selected quality profile is no longer valid. Refresh and try again.',
				{
					scoringProfileId: providedProfileId
				}
			);
		}

		return providedProfileId;
	}

	const defaultProfile = await qualityFilter.getDefaultScoringProfile();
	return defaultProfile.id;
}

/**
 * Get the default language profile ID if subtitles are wanted
 */
export async function getLanguageProfileId(
	wantsSubtitles: boolean,
	tmdbId: number
): Promise<string | null> {
	if (!wantsSubtitles) {
		return null;
	}

	const [defaultLanguageProfile] = await db
		.select()
		.from(languageProfiles)
		.where(eq(languageProfiles.isDefault, true))
		.limit(1);

	if (!defaultLanguageProfile) {
		logger.warn(
			{
				tmdbId
			},
			'[LibraryAddService] No default language profile found for subtitle preferences'
		);
		return null;
	}

	return defaultLanguageProfile.id;
}

/**
 * Fetch external IDs for a movie from TMDB
 */
export async function fetchMovieExternalIds(tmdbId: number): Promise<ExternalIds> {
	try {
		const externalIds = await tmdb.getMovieExternalIds(tmdbId);
		return {
			imdbId: externalIds.imdb_id,
			tvdbId: null
		};
	} catch {
		logger.warn({ tmdbId }, '[LibraryAddService] Failed to fetch external IDs for movie');
		return { imdbId: null, tvdbId: null };
	}
}

/**
 * Fetch external IDs for a TV series from TMDB
 */
export async function fetchSeriesExternalIds(tmdbId: number): Promise<ExternalIds> {
	try {
		const externalIds = await tmdb.getTvExternalIds(tmdbId);
		return {
			imdbId: externalIds.imdb_id,
			tvdbId: externalIds.tvdb_id
		};
	} catch {
		logger.warn({ tmdbId }, '[LibraryAddService] Failed to fetch external IDs for series');
		return { imdbId: null, tvdbId: null };
	}
}

/**
 * Fetch movie details from TMDB with proper error handling
 */
export async function fetchMovieDetails(tmdbId: number) {
	try {
		return await tmdb.getMovie(tmdbId);
	} catch (error) {
		throw new ExternalServiceError(
			'TMDB',
			error instanceof Error ? error.message : 'Failed to fetch movie details'
		);
	}
}

/**
 * Fetch TV series details from TMDB with proper error handling
 */
export async function fetchSeriesDetails(tmdbId: number) {
	try {
		return await tmdb.getTVShow(tmdbId);
	} catch (error) {
		throw new ExternalServiceError(
			'TMDB',
			error instanceof Error ? error.message : 'Failed to fetch series details'
		);
	}
}

/**
 * Trigger search-on-add for a movie with worker fallback
 */
export async function triggerMovieSearch(params: {
	movieId: string;
	tmdbId: number;
	imdbId: string | null;
	title: string;
	year?: number;
	scoringProfileId?: string;
}): Promise<SearchOnAddResult> {
	const { movieId, tmdbId, imdbId, title, year, scoringProfileId } = params;

	const worker = new SearchWorker({
		mediaType: 'movie',
		mediaId: movieId,
		title,
		tmdbId,
		searchFn: async () => {
			const result = await searchOnAdd.searchForMovie({
				movieId,
				tmdbId,
				imdbId,
				title,
				year,
				scoringProfileId
			});
			return {
				searched: 1,
				found: result.success ? 1 : 0,
				grabbed: result.success ? 1 : 0
			};
		}
	});

	try {
		workerManager.spawnInBackground(worker);
		return { triggered: true };
	} catch (error) {
		// Concurrency limit reached - fall back to fire and forget
		logger.warn(
			{
				movieId,
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			'[LibraryAddService] Could not create search worker, running directly'
		);

		searchOnAdd
			.searchForMovie({
				movieId,
				tmdbId,
				imdbId,
				title,
				year,
				scoringProfileId
			})
			.catch((err) => {
				logger.warn(
					{
						movieId,
						error: err instanceof Error ? err.message : 'Unknown error'
					},
					'[LibraryAddService] Background search failed for movie'
				);
			});

		return { triggered: true };
	}
}

/**
 * Trigger search-on-add for a series with worker fallback
 */
export async function triggerSeriesSearch(params: {
	seriesId: string;
	tmdbId: number;
	title: string;
}): Promise<SearchOnAddResult> {
	const { seriesId, tmdbId, title } = params;

	const worker = new SearchWorker({
		mediaType: 'series',
		mediaId: seriesId,
		title,
		tmdbId,
		searchFn: async () => {
			const result = await searchOnAdd.searchForMissingEpisodes(seriesId);
			return {
				searched: result.summary.searched,
				found: result.summary.found,
				grabbed: result.summary.grabbed
			};
		}
	});

	try {
		workerManager.spawnInBackground(worker);
		return { triggered: true };
	} catch (error) {
		// Concurrency limit reached - fall back to fire and forget
		logger.warn(
			{
				seriesId,
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			'[LibraryAddService] Could not create search worker, running directly'
		);

		searchOnAdd.searchForMissingEpisodes(seriesId).catch((err) => {
			logger.warn(
				{
					seriesId,
					error: err instanceof Error ? err.message : 'Unknown error'
				},
				'[LibraryAddService] Background search failed for series'
			);
		});

		return { triggered: true };
	}
}
