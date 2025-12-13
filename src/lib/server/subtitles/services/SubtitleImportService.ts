/**
 * Subtitle Import Service
 *
 * Handles immediate subtitle searches triggered by media imports.
 * This is NOT a scheduled task - it runs once when triggered by ImportService
 * or MediaMatcher after new media is added to the library.
 */

import { db } from '$lib/server/db';
import { movies, series, episodes, subtitleHistory } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { getSubtitleSearchService } from './SubtitleSearchService.js';
import { getSubtitleDownloadService } from './SubtitleDownloadService.js';
import { LanguageProfileService } from './LanguageProfileService.js';
import { logger } from '$lib/logging';

/**
 * Default minimum score for auto-download (used if profile doesn't specify)
 */
const DEFAULT_MIN_SCORE = 80;

/**
 * Result of an import-triggered subtitle search
 */
export interface ImportSearchResult {
	downloaded: number;
	errors: string[];
}

/**
 * Search for subtitles immediately after media import.
 *
 * Called by:
 * - ImportService after movie/episode imports complete
 * - MediaMatcher after TMDB metadata matching
 * - SubtitleSearchWorker for background manual searches
 *
 * @param mediaType - 'movie' or 'episode'
 * @param mediaId - The ID of the movie or episode
 * @returns Download count and any errors encountered
 */
export async function searchSubtitlesForNewMedia(
	mediaType: 'movie' | 'episode',
	mediaId: string
): Promise<ImportSearchResult> {
	const result: ImportSearchResult = { downloaded: 0, errors: [] };

	const searchService = getSubtitleSearchService();
	const downloadService = getSubtitleDownloadService();
	const profileService = LanguageProfileService.getInstance();

	try {
		if (mediaType === 'movie') {
			const movieResult = await searchForMovie(
				mediaId,
				searchService,
				downloadService,
				profileService
			);
			result.downloaded = movieResult.downloaded;
			result.errors = movieResult.errors;
		} else {
			const episodeResult = await searchForEpisode(
				mediaId,
				searchService,
				downloadService,
				profileService
			);
			result.downloaded = episodeResult.downloaded;
			result.errors = episodeResult.errors;
		}
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		result.errors.push(errorMsg);
		logger.error('[SubtitleImportService] Search failed', {
			mediaType,
			mediaId,
			error: errorMsg
		});
	}

	return result;
}

/**
 * Search for subtitles for a newly imported movie
 */
async function searchForMovie(
	movieId: string,
	searchService: ReturnType<typeof getSubtitleSearchService>,
	downloadService: ReturnType<typeof getSubtitleDownloadService>,
	profileService: LanguageProfileService
): Promise<ImportSearchResult> {
	const result: ImportSearchResult = { downloaded: 0, errors: [] };

	const movie = await db.query.movies.findFirst({
		where: eq(movies.id, movieId)
	});

	// Skip if movie doesn't exist, doesn't want subtitles, or has no language profile
	if (!movie) {
		logger.debug('[SubtitleImportService] Movie not found', { movieId });
		return result;
	}

	if (!movie.languageProfileId || movie.wantsSubtitles === false) {
		logger.debug('[SubtitleImportService] Movie does not want subtitles or has no profile', {
			movieId,
			title: movie.title,
			wantsSubtitles: movie.wantsSubtitles,
			hasProfile: !!movie.languageProfileId
		});
		return result;
	}

	const profile = await profileService.getProfile(movie.languageProfileId);
	if (!profile) {
		logger.warn('[SubtitleImportService] Language profile not found', {
			movieId,
			profileId: movie.languageProfileId
		});
		return result;
	}

	const languages = profile.languages.map((l) => l.code);
	if (languages.length === 0) {
		return result;
	}

	// Check which subtitles are missing
	const status = await profileService.getMovieSubtitleStatus(movieId);
	if (status.satisfied || status.missing.length === 0) {
		logger.debug('[SubtitleImportService] Movie already has required subtitles', {
			movieId,
			title: movie.title
		});
		return result;
	}

	// Search for subtitles
	const searchResults = await searchService.searchForMovie(movieId, languages);
	const minScore = profile.minimumScore ?? DEFAULT_MIN_SCORE;

	logger.info('[SubtitleImportService] Searching subtitles for movie', {
		movieId,
		title: movie.title,
		missingLanguages: status.missing.map((m) => m.code),
		resultsFound: searchResults.results.length,
		minScore
	});

	// Download best match for each missing language
	for (const missing of status.missing) {
		// Get all results for this language that meet minimum score
		const languageResults = searchResults.results.filter((r) => r.language === missing.code);
		const matches = languageResults
			.filter((r) => r.matchScore >= minScore)
			.sort((a, b) => b.matchScore - a.matchScore);
		const bestMatch = matches[0];

		// Log when we have results but none meet minimum score
		if (!bestMatch && languageResults.length > 0) {
			const bestScore = Math.max(...languageResults.map((r) => r.matchScore));
			logger.debug('[SubtitleImportService] No match meets minimum score for movie', {
				movieId,
				title: movie.title,
				language: missing.code,
				resultsFound: languageResults.length,
				bestScore,
				minScore
			});
		}

		if (bestMatch) {
			try {
				await downloadService.downloadForMovie(movieId, bestMatch);
				result.downloaded++;

				// Record in subtitle history
				await db.insert(subtitleHistory).values({
					movieId,
					action: 'downloaded',
					language: bestMatch.language,
					providerId: bestMatch.providerId,
					providerName: bestMatch.providerName,
					providerSubtitleId: bestMatch.providerSubtitleId,
					matchScore: bestMatch.matchScore,
					wasHashMatch: bestMatch.isHashMatch ?? false
				});

				logger.info('[SubtitleImportService] Downloaded subtitle for movie', {
					movieId,
					title: movie.title,
					language: bestMatch.language,
					provider: bestMatch.providerName,
					score: bestMatch.matchScore
				});
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : String(error);
				result.errors.push(errorMsg);
				logger.warn('[SubtitleImportService] Failed to download subtitle for movie', {
					movieId,
					title: movie.title,
					language: missing.code,
					error: errorMsg
				});
			}
		}
	}

	return result;
}

/**
 * Search for subtitles for a newly imported episode
 */
async function searchForEpisode(
	episodeId: string,
	searchService: ReturnType<typeof getSubtitleSearchService>,
	downloadService: ReturnType<typeof getSubtitleDownloadService>,
	profileService: LanguageProfileService
): Promise<ImportSearchResult> {
	const result: ImportSearchResult = { downloaded: 0, errors: [] };

	const episode = await db.query.episodes.findFirst({
		where: eq(episodes.id, episodeId)
	});

	if (!episode) {
		logger.debug('[SubtitleImportService] Episode not found', { episodeId });
		return result;
	}

	// Check if episode has explicitly disabled subtitles
	if (episode.wantsSubtitlesOverride === false) {
		logger.debug('[SubtitleImportService] Episode has subtitles disabled', {
			episodeId,
			title: episode.title
		});
		return result;
	}

	const seriesData = await db.query.series.findFirst({
		where: eq(series.id, episode.seriesId)
	});

	// Skip if series doesn't exist, doesn't want subtitles, or has no language profile
	if (!seriesData) {
		logger.debug('[SubtitleImportService] Series not found for episode', {
			episodeId,
			seriesId: episode.seriesId
		});
		return result;
	}

	if (!seriesData.languageProfileId || seriesData.wantsSubtitles === false) {
		logger.debug('[SubtitleImportService] Series does not want subtitles or has no profile', {
			episodeId,
			seriesId: seriesData.id,
			seriesTitle: seriesData.title,
			wantsSubtitles: seriesData.wantsSubtitles,
			hasProfile: !!seriesData.languageProfileId
		});
		return result;
	}

	const profile = await profileService.getProfile(seriesData.languageProfileId);
	if (!profile) {
		logger.warn('[SubtitleImportService] Language profile not found for series', {
			episodeId,
			seriesId: seriesData.id,
			profileId: seriesData.languageProfileId
		});
		return result;
	}

	const languages = profile.languages.map((l) => l.code);
	if (languages.length === 0) {
		return result;
	}

	// Check which subtitles are missing
	const status = await profileService.getEpisodeSubtitleStatus(episodeId);
	if (status.satisfied || status.missing.length === 0) {
		logger.debug('[SubtitleImportService] Episode already has required subtitles', {
			episodeId,
			seriesTitle: seriesData.title,
			season: episode.seasonNumber,
			episode: episode.episodeNumber
		});
		return result;
	}

	// Search for subtitles
	const searchResults = await searchService.searchForEpisode(episodeId, languages);
	const minScore = profile.minimumScore ?? DEFAULT_MIN_SCORE;

	logger.info('[SubtitleImportService] Searching subtitles for episode', {
		episodeId,
		seriesTitle: seriesData.title,
		season: episode.seasonNumber,
		episode: episode.episodeNumber,
		missingLanguages: status.missing.map((m) => m.code),
		resultsFound: searchResults.results.length,
		minScore
	});

	// Download best match for each missing language
	for (const missing of status.missing) {
		// Get all results for this language that meet minimum score
		const languageResults = searchResults.results.filter((r) => r.language === missing.code);
		const matches = languageResults
			.filter((r) => r.matchScore >= minScore)
			.sort((a, b) => b.matchScore - a.matchScore);
		const bestMatch = matches[0];

		// Log when we have results but none meet minimum score
		if (!bestMatch && languageResults.length > 0) {
			const bestScore = Math.max(...languageResults.map((r) => r.matchScore));
			logger.debug('[SubtitleImportService] No match meets minimum score for episode', {
				episodeId,
				seriesTitle: seriesData.title,
				season: episode.seasonNumber,
				episode: episode.episodeNumber,
				language: missing.code,
				resultsFound: languageResults.length,
				bestScore,
				minScore
			});
		}

		if (bestMatch) {
			try {
				await downloadService.downloadForEpisode(episodeId, bestMatch);
				result.downloaded++;

				// Record in subtitle history
				await db.insert(subtitleHistory).values({
					episodeId,
					action: 'downloaded',
					language: bestMatch.language,
					providerId: bestMatch.providerId,
					providerName: bestMatch.providerName,
					providerSubtitleId: bestMatch.providerSubtitleId,
					matchScore: bestMatch.matchScore,
					wasHashMatch: bestMatch.isHashMatch ?? false
				});

				logger.info('[SubtitleImportService] Downloaded subtitle for episode', {
					episodeId,
					seriesTitle: seriesData.title,
					season: episode.seasonNumber,
					episode: episode.episodeNumber,
					language: bestMatch.language,
					provider: bestMatch.providerName,
					score: bestMatch.matchScore
				});
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : String(error);
				result.errors.push(errorMsg);
				logger.warn('[SubtitleImportService] Failed to download subtitle for episode', {
					episodeId,
					seriesTitle: seriesData.title,
					season: episode.seasonNumber,
					episode: episode.episodeNumber,
					language: missing.code,
					error: errorMsg
				});
			}
		}
	}

	return result;
}

/**
 * Batch search result
 */
export interface BatchSearchResult {
	processed: number;
	downloaded: number;
	errors: number;
}

/**
 * Search for subtitles for multiple media items with rate limiting.
 *
 * Used when:
 * - User enables subtitle monitoring on a series (search all episodes)
 * - User bulk-assigns a language profile to multiple items
 *
 * Runs in background (fire-and-forget) to avoid blocking the API response.
 *
 * @param items - Array of media items to search
 * @param options - Rate limiting options
 */
export async function searchSubtitlesForMediaBatch(
	items: Array<{ mediaType: 'movie' | 'episode'; mediaId: string }>,
	options?: { delayMs?: number; maxItems?: number }
): Promise<BatchSearchResult> {
	const { delayMs = 1000, maxItems = 50 } = options ?? {};

	const result: BatchSearchResult = {
		processed: 0,
		downloaded: 0,
		errors: 0
	};

	// Limit batch size to avoid overwhelming providers
	const itemsToProcess = items.slice(0, maxItems);

	logger.info('[SubtitleImportService] Starting batch subtitle search', {
		totalItems: items.length,
		processingItems: itemsToProcess.length,
		delayMs
	});

	for (const item of itemsToProcess) {
		try {
			const searchResult = await searchSubtitlesForNewMedia(item.mediaType, item.mediaId);
			result.processed++;
			result.downloaded += searchResult.downloaded;
			result.errors += searchResult.errors.length;
		} catch (error) {
			result.processed++;
			result.errors++;
			logger.warn('[SubtitleImportService] Batch search item failed', {
				mediaType: item.mediaType,
				mediaId: item.mediaId,
				error: error instanceof Error ? error.message : String(error)
			});
		}

		// Rate limit: delay between searches
		if (result.processed < itemsToProcess.length) {
			await new Promise((resolve) => setTimeout(resolve, delayMs));
		}
	}

	logger.info('[SubtitleImportService] Batch subtitle search completed', {
		processed: result.processed,
		downloaded: result.downloaded,
		errors: result.errors
	});

	return result;
}
