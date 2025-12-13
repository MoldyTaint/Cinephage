/**
 * Missing Subtitles Task
 *
 * Searches for subtitles on monitored media that have files but lack required
 * subtitles per their language profile. Runs periodically (default: every 6 hours).
 */

import { db } from '$lib/server/db/index.js';
import { movies, series, episodes, subtitleHistory } from '$lib/server/db/schema.js';
import { eq, and, isNotNull } from 'drizzle-orm';
import { getSubtitleSearchService } from '$lib/server/subtitles/services/SubtitleSearchService.js';
import { getSubtitleDownloadService } from '$lib/server/subtitles/services/SubtitleDownloadService.js';
import { getSubtitleProviderManager } from '$lib/server/subtitles/services/SubtitleProviderManager.js';
import { LanguageProfileService } from '$lib/server/subtitles/services/LanguageProfileService.js';
import { logger } from '$lib/logging/index.js';
import type { TaskResult } from '../MonitoringScheduler.js';

/**
 * Default minimum score for auto-download (used if profile doesn't specify)
 */
const DEFAULT_MIN_SCORE = 80;

/**
 * Maximum concurrent subtitle searches to avoid overwhelming providers
 */
const MAX_CONCURRENT_SEARCHES = 3;

/**
 * Delay in milliseconds between search batches to prevent rate limiting
 */
const BATCH_DELAY_MS = 1000;

/**
 * Delay in milliseconds between individual searches within a batch
 */
const SEARCH_DELAY_MS = 200;

/**
 * Sleep utility
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Execute missing subtitles search task
 */
export async function executeMissingSubtitlesTask(): Promise<TaskResult> {
	const executedAt = new Date();
	logger.info('[MissingSubtitlesTask] Starting missing subtitles search');

	// Check provider health status
	const providerManager = getSubtitleProviderManager();
	const healthStatus = await providerManager.getHealthStatus();
	const throttledProviders = healthStatus.filter((h) => h.isThrottled);
	const unhealthyProviders = healthStatus.filter((h) => !h.isHealthy && !h.isThrottled);

	// Log provider health for observability
	if (throttledProviders.length > 0) {
		logger.info('[MissingSubtitlesTask] Throttled providers', {
			count: throttledProviders.length,
			providers: throttledProviders.map((p) => ({
				name: p.providerName,
				until: p.throttledUntil,
				error: p.throttleErrorType
			}))
		});
	}

	if (unhealthyProviders.length > 0) {
		logger.info('[MissingSubtitlesTask] Unhealthy providers', {
			count: unhealthyProviders.length,
			providers: unhealthyProviders.map((p) => ({
				name: p.providerName,
				failures: p.consecutiveFailures,
				lastError: p.lastError
			}))
		});
	}

	const availableProviders = await providerManager.getEnabledProviders();

	if (availableProviders.length === 0) {
		logger.warn('[MissingSubtitlesTask] No subtitle providers available (all throttled or disabled), skipping search');
		return {
			taskType: 'missingSubtitles',
			itemsProcessed: 0,
			itemsGrabbed: 0,
			errors: 0,
			executedAt
		};
	}

	logger.info('[MissingSubtitlesTask] Available providers', {
		count: availableProviders.length,
		providers: availableProviders.map((p) => p.name),
		totalConfigured: healthStatus.length
	});

	let itemsProcessed = 0;
	let itemsGrabbed = 0;
	let errors = 0;

	const searchService = getSubtitleSearchService();
	const downloadService = getSubtitleDownloadService();
	const profileService = LanguageProfileService.getInstance();

	try {
		// Search for missing subtitles on movies
		logger.info('[MissingSubtitlesTask] Searching for missing movie subtitles');
		const movieResults = await searchMissingMovieSubtitles(
			searchService,
			downloadService,
			profileService,
			executedAt
		);

		itemsProcessed += movieResults.processed;
		itemsGrabbed += movieResults.downloaded;
		errors += movieResults.errors;

		logger.info('[MissingSubtitlesTask] Missing movie subtitles search completed', {
			processed: movieResults.processed,
			downloaded: movieResults.downloaded,
			errors: movieResults.errors
		});

		// Search for missing subtitles on episodes
		logger.info('[MissingSubtitlesTask] Searching for missing episode subtitles');
		const episodeResults = await searchMissingEpisodeSubtitles(
			searchService,
			downloadService,
			profileService,
			executedAt
		);

		itemsProcessed += episodeResults.processed;
		itemsGrabbed += episodeResults.downloaded;
		errors += episodeResults.errors;

		logger.info('[MissingSubtitlesTask] Missing episode subtitles search completed', {
			processed: episodeResults.processed,
			downloaded: episodeResults.downloaded,
			errors: episodeResults.errors
		});

		logger.info('[MissingSubtitlesTask] Task completed', {
			totalProcessed: itemsProcessed,
			totalDownloaded: itemsGrabbed,
			totalErrors: errors
		});

		return {
			taskType: 'missingSubtitles',
			itemsProcessed,
			itemsGrabbed,
			errors,
			executedAt
		};
	} catch (error) {
		logger.error('[MissingSubtitlesTask] Task failed', error);
		throw error;
	}
}

/**
 * Search for missing subtitles on movies
 */
async function searchMissingMovieSubtitles(
	searchService: ReturnType<typeof getSubtitleSearchService>,
	downloadService: ReturnType<typeof getSubtitleDownloadService>,
	profileService: LanguageProfileService,
	executedAt: Date
): Promise<{ processed: number; downloaded: number; errors: number }> {
	let processed = 0;
	let downloaded = 0;
	let errorCount = 0;

	// Get movies with files that want subtitles and have a language profile
	const moviesWithProfiles = await db
		.select()
		.from(movies)
		.where(
			and(
				eq(movies.hasFile, true),
				eq(movies.wantsSubtitles, true),
				isNotNull(movies.languageProfileId)
			)
		);

	logger.debug('[MissingSubtitlesTask] Found movies to process', {
		count: moviesWithProfiles.length
	});

	// Process movies in batches to limit concurrency
	for (let i = 0; i < moviesWithProfiles.length; i += MAX_CONCURRENT_SEARCHES) {
		const batch = moviesWithProfiles.slice(i, i + MAX_CONCURRENT_SEARCHES);

		// Add delay between batches to prevent rate limiting (skip first batch)
		if (i > 0) {
			await sleep(BATCH_DELAY_MS);
		}

		await Promise.all(
			batch.map(async (movie, batchIndex) => {
				if (!movie.languageProfileId) return;

				// Stagger searches within batch
				if (batchIndex > 0) {
					await sleep(SEARCH_DELAY_MS * batchIndex);
				}

				try {
					// Check if subtitles are missing
					const status = await profileService.getMovieSubtitleStatus(movie.id);

					if (status.satisfied || status.missing.length === 0) {
						// Already has all required subtitles
						return;
					}

					processed++;

					// Get profile for minimum score
					const profile = await profileService.getProfile(movie.languageProfileId);
					const minScore = profile?.minimumScore ?? DEFAULT_MIN_SCORE;
					const languages = profile?.languages.map((l) => l.code) ?? [];

					if (languages.length === 0) return;

					// Search for subtitles
					const results = await searchService.searchForMovie(movie.id, languages);

					// Download best match for each missing language
					for (const missing of status.missing) {
						// Get all results for this language
						const languageResults = results.results.filter((r) => r.language === missing.code);

						// Filter for minimum score, then sort by score descending
						const matches = languageResults
							.filter((r) => r.matchScore >= minScore)
							.sort((a, b) => b.matchScore - a.matchScore);
						const bestMatch = matches[0];

						// Log when we have results but none meet minimum score
						if (!bestMatch && languageResults.length > 0) {
							const bestScore = Math.max(...languageResults.map((r) => r.matchScore));
							logger.debug('[MissingSubtitlesTask] No match meets minimum score for movie', {
								movieId: movie.id,
								title: movie.title,
								language: missing.code,
								resultsFound: languageResults.length,
								bestScore,
								minScore
							});
						}

						if (bestMatch) {
							try {
								await downloadService.downloadForMovie(movie.id, bestMatch);
								downloaded++;

								// Record success in history
								await db.insert(subtitleHistory).values({
									movieId: movie.id,
									action: 'downloaded',
									language: bestMatch.language,
									providerId: bestMatch.providerId,
									providerName: bestMatch.providerName,
									providerSubtitleId: bestMatch.providerSubtitleId,
									matchScore: bestMatch.matchScore,
									wasHashMatch: bestMatch.isHashMatch ?? false
								});

								logger.debug('[MissingSubtitlesTask] Downloaded subtitle for movie', {
									movieId: movie.id,
									language: bestMatch.language,
									score: bestMatch.matchScore
								});
							} catch (downloadError) {
								errorCount++;
								logger.warn('[MissingSubtitlesTask] Failed to download subtitle for movie', {
									movieId: movie.id,
									language: missing.code,
									error: downloadError instanceof Error ? downloadError.message : String(downloadError)
								});
							}
						}
					}
				} catch (error) {
					errorCount++;
					logger.warn('[MissingSubtitlesTask] Error processing movie', {
						movieId: movie.id,
						error: error instanceof Error ? error.message : String(error)
					});
				}
			})
		);
	}

	return { processed, downloaded, errors: errorCount };
}

/**
 * Search for missing subtitles on episodes
 */
async function searchMissingEpisodeSubtitles(
	searchService: ReturnType<typeof getSubtitleSearchService>,
	downloadService: ReturnType<typeof getSubtitleDownloadService>,
	profileService: LanguageProfileService,
	executedAt: Date
): Promise<{ processed: number; downloaded: number; errors: number }> {
	let processed = 0;
	let downloaded = 0;
	let errorCount = 0;

	// Get series with language profiles that want subtitles
	const seriesWithProfiles = await db
		.select()
		.from(series)
		.where(and(eq(series.wantsSubtitles, true), isNotNull(series.languageProfileId)));

	logger.debug('[MissingSubtitlesTask] Found series to process', {
		count: seriesWithProfiles.length
	});

	for (const show of seriesWithProfiles) {
		if (!show.languageProfileId) continue;

		try {
			// Get profile for minimum score
			const profile = await profileService.getProfile(show.languageProfileId);
			if (!profile) continue;

			const minScore = profile.minimumScore ?? DEFAULT_MIN_SCORE;
			const languages = profile.languages.map((l) => l.code);

			if (languages.length === 0) continue;

			// Get episodes missing subtitles
			const episodesMissing = await profileService.getSeriesEpisodesMissingSubtitles(show.id);

			// Process episodes in batches
			for (let i = 0; i < episodesMissing.length; i += MAX_CONCURRENT_SEARCHES) {
				const batch = episodesMissing.slice(i, i + MAX_CONCURRENT_SEARCHES);

				// Add delay between batches to prevent rate limiting (skip first batch)
				if (i > 0) {
					await sleep(BATCH_DELAY_MS);
				}

				await Promise.all(
					batch.map(async (episodeId, batchIndex) => {
						// Stagger searches within batch
						if (batchIndex > 0) {
							await sleep(SEARCH_DELAY_MS * batchIndex);
						}

						try {
							// Check if episode has explicitly disabled subtitles
							const episodeData = await db.query.episodes.findFirst({
								where: eq(episodes.id, episodeId)
							});

							// Skip if episode doesn't have a file or has wantsSubtitlesOverride = false
							if (!episodeData?.hasFile || episodeData.wantsSubtitlesOverride === false) {
								return;
							}

							processed++;

							// Search for subtitles
							const results = await searchService.searchForEpisode(episodeId, languages);

							// Get status for this episode
							const status = await profileService.getEpisodeSubtitleStatus(episodeId);

							for (const missing of status.missing) {
								// Get all results for this language
								const languageResults = results.results.filter((r) => r.language === missing.code);

								// Filter for minimum score, then sort by score descending
								const matches = languageResults
									.filter((r) => r.matchScore >= minScore)
									.sort((a, b) => b.matchScore - a.matchScore);
								const bestMatch = matches[0];

								// Log when we have results but none meet minimum score
								if (!bestMatch && languageResults.length > 0) {
									const bestScore = Math.max(...languageResults.map((r) => r.matchScore));
									logger.debug('[MissingSubtitlesTask] No match meets minimum score for episode', {
										episodeId,
										language: missing.code,
										resultsFound: languageResults.length,
										bestScore,
										minScore
									});
								}

								if (bestMatch) {
									try {
										await downloadService.downloadForEpisode(episodeId, bestMatch);
										downloaded++;

										// Record success in history
										await db.insert(subtitleHistory).values({
											episodeId: episodeId,
											action: 'downloaded',
											language: bestMatch.language,
											providerId: bestMatch.providerId,
											providerName: bestMatch.providerName,
											providerSubtitleId: bestMatch.providerSubtitleId,
											matchScore: bestMatch.matchScore,
											wasHashMatch: bestMatch.isHashMatch ?? false
										});

										logger.debug('[MissingSubtitlesTask] Downloaded subtitle for episode', {
											episodeId,
											language: bestMatch.language,
											score: bestMatch.matchScore
										});
									} catch (downloadError) {
										errorCount++;
										logger.warn('[MissingSubtitlesTask] Failed to download subtitle for episode', {
											episodeId,
											language: missing.code,
											error:
												downloadError instanceof Error
													? downloadError.message
													: String(downloadError)
										});
									}
								}
							}
						} catch (error) {
							errorCount++;
							logger.warn('[MissingSubtitlesTask] Error processing episode', {
								episodeId,
								error: error instanceof Error ? error.message : String(error)
							});
						}
					})
				);
			}
		} catch (error) {
			errorCount++;
			logger.warn('[MissingSubtitlesTask] Error processing series', {
				seriesId: show.id,
				error: error instanceof Error ? error.message : String(error)
			});
		}
	}

	return { processed, downloaded, errors: errorCount };
}
