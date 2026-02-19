/**
 * Subtitle Upgrade Task
 *
 * Searches for better-scoring subtitles for existing ones when the language profile
 * allows upgrades. Runs periodically (default: daily) to improve subtitle quality.
 */

import { db } from '$lib/server/db/index.js';
import {
	movies,
	series,
	episodes,
	subtitles,
	subtitleHistory,
	monitoringHistory
} from '$lib/server/db/schema.js';
import { eq, and, isNotNull } from 'drizzle-orm';
import { getSubtitleSearchService } from '$lib/server/subtitles/services/SubtitleSearchService.js';
import { getSubtitleDownloadService } from '$lib/server/subtitles/services/SubtitleDownloadService.js';
import { LanguageProfileService } from '$lib/server/subtitles/services/LanguageProfileService.js';
import { logger } from '$lib/logging/index.js';
import { normalizeLanguageCode } from '$lib/shared/languages';
import type { TaskResult } from '../MonitoringScheduler.js';
import type { TaskExecutionContext } from '$lib/server/tasks/TaskExecutionContext.js';
import { isMovieMonitored } from '$lib/server/monitoring/specifications/MonitoredSpecification.js';

/**
 * Maximum subtitles to process per run to prevent overwhelming providers
 */
const MAX_SUBTITLES_PER_RUN = 50;

/**
 * Maximum concurrent searches
 */
const MAX_CONCURRENT_SEARCHES = 3;

/**
 * Minimum score improvement required to trigger an upgrade
 */
const MIN_SCORE_IMPROVEMENT = 10;

/**
 * Execute subtitle upgrade task
 * @param ctx - Execution context for cancellation support and activity tracking
 */
export async function executeSubtitleUpgradeTask(
	ctx: TaskExecutionContext | null
): Promise<TaskResult> {
	const executedAt = new Date();
	const taskHistoryId = ctx?.historyId;
	logger.info('[SubtitleUpgradeTask] Starting subtitle upgrade search', { taskHistoryId });

	let itemsProcessed = 0;
	let itemsGrabbed = 0;
	let errors = 0;

	const searchService = getSubtitleSearchService();
	const downloadService = getSubtitleDownloadService();
	const profileService = LanguageProfileService.getInstance();

	try {
		// Check for cancellation before starting
		ctx?.checkCancelled();

		// Process movie subtitle upgrades
		logger.info('[SubtitleUpgradeTask] Searching for movie subtitle upgrades');
		const movieResults = await searchMovieSubtitleUpgrades(
			searchService,
			downloadService,
			profileService,
			executedAt,
			taskHistoryId,
			ctx
		);

		itemsProcessed += movieResults.processed;
		itemsGrabbed += movieResults.upgraded;
		errors += movieResults.errors;

		logger.info('[SubtitleUpgradeTask] Movie subtitle upgrades completed', {
			processed: movieResults.processed,
			upgraded: movieResults.upgraded,
			errors: movieResults.errors
		});

		// Check for cancellation before episode upgrades
		ctx?.checkCancelled();

		// Process episode subtitle upgrades
		logger.info('[SubtitleUpgradeTask] Searching for episode subtitle upgrades');
		const episodeResults = await searchEpisodeSubtitleUpgrades(
			searchService,
			downloadService,
			profileService,
			executedAt,
			taskHistoryId,
			ctx
		);

		itemsProcessed += episodeResults.processed;
		itemsGrabbed += episodeResults.upgraded;
		errors += episodeResults.errors;

		logger.info('[SubtitleUpgradeTask] Episode subtitle upgrades completed', {
			processed: episodeResults.processed,
			upgraded: episodeResults.upgraded,
			errors: episodeResults.errors
		});

		logger.info('[SubtitleUpgradeTask] Task completed', {
			totalProcessed: itemsProcessed,
			totalUpgraded: itemsGrabbed,
			totalErrors: errors
		});

		return {
			taskType: 'subtitleUpgrade',
			itemsProcessed,
			itemsGrabbed,
			errors,
			executedAt
		};
	} catch (error) {
		logger.error('[SubtitleUpgradeTask] Task failed', error);
		throw error;
	}
}

/**
 * Search for subtitle upgrades on movies
 */
async function searchMovieSubtitleUpgrades(
	searchService: ReturnType<typeof getSubtitleSearchService>,
	downloadService: ReturnType<typeof getSubtitleDownloadService>,
	profileService: LanguageProfileService,
	executedAt: Date,
	taskHistoryId?: string,
	ctx?: TaskExecutionContext | null
): Promise<{ processed: number; upgraded: number; errors: number }> {
	let processed = 0;
	let upgraded = 0;
	let errorCount = 0;

	// Get all movie subtitles with scores (we'll filter by profile settings below)
	const movieSubtitles = await db
		.select({
			subtitle: subtitles,
			movie: movies
		})
		.from(subtitles)
		.innerJoin(movies, eq(subtitles.movieId, movies.id))
		.where(
			and(
				isNotNull(subtitles.movieId),
				isNotNull(subtitles.matchScore),
				isNotNull(movies.languageProfileId),
				eq(movies.monitored, true)
			)
		)
		.limit(MAX_SUBTITLES_PER_RUN);

	logger.debug('[SubtitleUpgradeTask] Found movie subtitles to evaluate', {
		count: movieSubtitles.length
	});

	// Group by movie to avoid duplicate searches
	const movieMap = new Map<
		string,
		{ movie: typeof movies.$inferSelect; subtitles: (typeof subtitles.$inferSelect)[] }
	>();

	for (const row of movieSubtitles) {
		const existing = movieMap.get(row.movie.id);
		if (existing) {
			existing.subtitles.push(row.subtitle);
		} else {
			movieMap.set(row.movie.id, { movie: row.movie, subtitles: [row.subtitle] });
		}
	}

	// Process movies
	const movieEntries = Array.from(movieMap.values());
	for (let i = 0; i < movieEntries.length; i += MAX_CONCURRENT_SEARCHES) {
		// Check for cancellation between batches
		ctx?.checkCancelled();

		const batch = movieEntries.slice(i, i + MAX_CONCURRENT_SEARCHES);

		await Promise.all(
			batch.map(async ({ movie, subtitles: movieSubs }) => {
				if (!movie.languageProfileId) return;

				const isMonitored = await isMovieMonitored({ movie });
				if (!isMonitored) return;

				let movieUpgraded = 0;
				let movieError: string | undefined;
				let oldScore: number | undefined;
				let newScore: number | undefined;

				try {
					// Get profile and check if upgrades are allowed
					const profile = await profileService.getProfile(movie.languageProfileId);
					if (!profile || !profile.upgradesAllowed) {
						return;
					}

					processed++;

					const languages = profile.languages.map((l) => l.code);
					if (languages.length === 0) return;

					// Search for subtitles
					const results = await searchService.searchForMovie(movie.id, languages);

					// Check each existing subtitle for upgrades
					for (const existingSub of movieSubs) {
						const currentScore = existingSub.matchScore ?? 0;
						const normalizedExisting = normalizeLanguageCode(existingSub.language);

						// Find a better match for this language
						const betterMatch = results.results.find(
							(r) =>
								normalizeLanguageCode(r.language) === normalizedExisting &&
								r.matchScore > currentScore + MIN_SCORE_IMPROVEMENT
						);

						if (betterMatch) {
							try {
								oldScore = currentScore;
								newScore = betterMatch.matchScore;
								await downloadService.downloadForMovie(movie.id, betterMatch);
								upgraded++;
								movieUpgraded++;

								// Record upgrade in subtitle history
								const normalizedLanguage = normalizeLanguageCode(betterMatch.language);
								await db.insert(subtitleHistory).values({
									movieId: movie.id,
									action: 'upgraded',
									language: normalizedLanguage,
									providerId: betterMatch.providerId,
									providerName: betterMatch.providerName,
									providerSubtitleId: betterMatch.providerSubtitleId,
									matchScore: betterMatch.matchScore,
									wasHashMatch: betterMatch.isHashMatch ?? false,
									replacedSubtitleId: existingSub.id
								});

								logger.info('[SubtitleUpgradeTask] Upgraded movie subtitle', {
									movieId: movie.id,
									language: normalizedLanguage,
									oldScore,
									newScore: betterMatch.matchScore
								});
							} catch (downloadError) {
								errorCount++;
								movieError =
									downloadError instanceof Error ? downloadError.message : String(downloadError);
								logger.warn('[SubtitleUpgradeTask] Failed to download upgraded subtitle', {
									movieId: movie.id,
									language: normalizedExisting,
									error: movieError
								});
							}
						}
					}

					// Record to monitoring history for activity tracking
					await db.insert(monitoringHistory).values({
						taskHistoryId,
						taskType: 'subtitleUpgrade',
						movieId: movie.id,
						status: movieUpgraded > 0 ? 'grabbed' : movieError ? 'error' : 'no_results',
						releasesFound: movieSubs.length, // Number of existing subtitles evaluated
						releaseGrabbed: movieUpgraded > 0 ? `${movieUpgraded} upgrade(s)` : undefined,
						isUpgrade: true,
						oldScore,
						newScore,
						errorMessage: movieError,
						executedAt: executedAt.toISOString()
					});
				} catch (error) {
					errorCount++;
					const errorMsg = error instanceof Error ? error.message : String(error);
					logger.warn('[SubtitleUpgradeTask] Error processing movie subtitles', {
						movieId: movie.id,
						error: errorMsg
					});

					// Record error to monitoring history
					await db.insert(monitoringHistory).values({
						taskHistoryId,
						taskType: 'subtitleUpgrade',
						movieId: movie.id,
						status: 'error',
						releasesFound: 0,
						isUpgrade: true,
						errorMessage: errorMsg,
						executedAt: executedAt.toISOString()
					});
				}
			})
		);
	}

	return { processed, upgraded, errors: errorCount };
}

/**
 * Search for subtitle upgrades on episodes
 */
async function searchEpisodeSubtitleUpgrades(
	searchService: ReturnType<typeof getSubtitleSearchService>,
	downloadService: ReturnType<typeof getSubtitleDownloadService>,
	profileService: LanguageProfileService,
	executedAt: Date,
	taskHistoryId?: string,
	ctx?: TaskExecutionContext | null
): Promise<{ processed: number; upgraded: number; errors: number }> {
	let processed = 0;
	let upgraded = 0;
	let errorCount = 0;

	// Get all episode subtitles with scores
	const episodeSubtitles = await db
		.select({
			subtitle: subtitles,
			episode: episodes
		})
		.from(subtitles)
		.innerJoin(episodes, eq(subtitles.episodeId, episodes.id))
		.where(and(isNotNull(subtitles.episodeId), isNotNull(subtitles.matchScore)))
		.limit(MAX_SUBTITLES_PER_RUN);

	logger.debug('[SubtitleUpgradeTask] Found episode subtitles to evaluate', {
		count: episodeSubtitles.length
	});

	// Group by episode
	const episodeMap = new Map<
		string,
		{ episode: typeof episodes.$inferSelect; subtitles: (typeof subtitles.$inferSelect)[] }
	>();

	for (const row of episodeSubtitles) {
		const existing = episodeMap.get(row.episode.id);
		if (existing) {
			existing.subtitles.push(row.subtitle);
		} else {
			episodeMap.set(row.episode.id, { episode: row.episode, subtitles: [row.subtitle] });
		}
	}

	// Get series profiles for all episodes
	const _seriesIds = [...new Set(episodeSubtitles.map((r) => r.episode.seriesId))];
	const seriesData = await db
		.select()
		.from(series)
		.where(and(isNotNull(series.languageProfileId), eq(series.monitored, true)));

	const seriesMap = new Map(seriesData.map((s) => [s.id, s]));

	// Process episodes
	const episodeEntries = Array.from(episodeMap.values());
	for (let i = 0; i < episodeEntries.length; i += MAX_CONCURRENT_SEARCHES) {
		// Check for cancellation between batches
		ctx?.checkCancelled();

		const batch = episodeEntries.slice(i, i + MAX_CONCURRENT_SEARCHES);

		await Promise.all(
			batch.map(async ({ episode, subtitles: episodeSubs }) => {
				const seriesRow = seriesMap.get(episode.seriesId);
				if (!seriesRow?.languageProfileId) return;

				let episodeUpgraded = 0;
				let episodeError: string | undefined;
				let oldScore: number | undefined;
				let newScore: number | undefined;

				try {
					if (!episode.monitored) return;

					// Get profile and check if upgrades are allowed
					const profile = await profileService.getProfile(seriesRow.languageProfileId);
					if (!profile || !profile.upgradesAllowed) {
						return;
					}

					// Skip if episode has explicitly disabled subtitles
					if (episode.wantsSubtitlesOverride === false) {
						return;
					}

					processed++;

					const languages = profile.languages.map((l) => l.code);
					if (languages.length === 0) return;

					// Search for subtitles
					const results = await searchService.searchForEpisode(episode.id, languages);

					// Check each existing subtitle for upgrades
					for (const existingSub of episodeSubs) {
						const currentScore = existingSub.matchScore ?? 0;
						const normalizedExisting = normalizeLanguageCode(existingSub.language);

						// Find a better match for this language
						const betterMatch = results.results.find(
							(r) =>
								normalizeLanguageCode(r.language) === normalizedExisting &&
								r.matchScore > currentScore + MIN_SCORE_IMPROVEMENT
						);

						if (betterMatch) {
							try {
								oldScore = currentScore;
								newScore = betterMatch.matchScore;
								await downloadService.downloadForEpisode(episode.id, betterMatch);
								upgraded++;
								episodeUpgraded++;

								// Record upgrade in subtitle history
								const normalizedLanguage = normalizeLanguageCode(betterMatch.language);
								await db.insert(subtitleHistory).values({
									episodeId: episode.id,
									action: 'upgraded',
									language: normalizedLanguage,
									providerId: betterMatch.providerId,
									providerName: betterMatch.providerName,
									providerSubtitleId: betterMatch.providerSubtitleId,
									matchScore: betterMatch.matchScore,
									wasHashMatch: betterMatch.isHashMatch ?? false,
									replacedSubtitleId: existingSub.id
								});

								logger.info('[SubtitleUpgradeTask] Upgraded episode subtitle', {
									episodeId: episode.id,
									language: normalizedLanguage,
									oldScore,
									newScore: betterMatch.matchScore
								});
							} catch (downloadError) {
								errorCount++;
								episodeError =
									downloadError instanceof Error ? downloadError.message : String(downloadError);
								logger.warn('[SubtitleUpgradeTask] Failed to download upgraded subtitle', {
									episodeId: episode.id,
									language: normalizedExisting,
									error: episodeError
								});
							}
						}
					}

					// Record to monitoring history for activity tracking
					await db.insert(monitoringHistory).values({
						taskHistoryId,
						taskType: 'subtitleUpgrade',
						episodeId: episode.id,
						seriesId: episode.seriesId,
						status: episodeUpgraded > 0 ? 'grabbed' : episodeError ? 'error' : 'no_results',
						releasesFound: episodeSubs.length, // Number of existing subtitles evaluated
						releaseGrabbed: episodeUpgraded > 0 ? `${episodeUpgraded} upgrade(s)` : undefined,
						isUpgrade: true,
						oldScore,
						newScore,
						errorMessage: episodeError,
						executedAt: executedAt.toISOString()
					});
				} catch (error) {
					errorCount++;
					const errorMsg = error instanceof Error ? error.message : String(error);
					logger.warn('[SubtitleUpgradeTask] Error processing episode subtitles', {
						episodeId: episode.id,
						error: errorMsg
					});

					// Record error to monitoring history
					await db.insert(monitoringHistory).values({
						taskHistoryId,
						taskType: 'subtitleUpgrade',
						episodeId: episode.id,
						seriesId: episode.seriesId,
						status: 'error',
						releasesFound: 0,
						isUpgrade: true,
						errorMessage: errorMsg,
						executedAt: executedAt.toISOString()
					});
				}
			})
		);
	}

	return { processed, upgraded, errors: errorCount };
}
