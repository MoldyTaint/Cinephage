/**
 * Adaptive Subtitle Searching
 *
 * Inspired by Bazarr's adaptive_searching.py pattern.
 * After a configurable delay (default: 3 weeks) of failed subtitle searches,
 * reduces search frequency to once per configurable delta (default: 1 week).
 * This prevents wasting API quota on media that consistently has no subtitle results.
 *
 * When subtitles are found, the failed attempt counter is reset to 0.
 */

import { db } from '$lib/server/db/index.js';
import { movies, episodes } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { logger } from '$lib/logging/index.js';

/**
 * After this many days of failed searches, switch to extended (weekly) searching.
 * Bazarr default: 3 weeks (21 days).
 */
const ADAPTIVE_SEARCH_DELAY_DAYS = 21;

/**
 * Once in extended mode, only search again after this many days since last attempt.
 * Bazarr default: 1 week (7 days).
 */
const ADAPTIVE_SEARCH_DELTA_DAYS = 7;

/**
 * Check if a subtitle search should run for a given movie.
 * Returns true if the search should proceed, false if it should be skipped.
 */
export function isMovieSearchActive(movie: {
	id: string;
	title?: string | null;
	failedSubtitleAttempts?: number | null;
	firstSubtitleSearchAt?: string | null;
	lastSearchTime?: string | null;
}): boolean {
	return isSearchActive({
		mediaType: 'movie',
		mediaId: movie.id,
		mediaTitle: movie.title ?? movie.id,
		failedAttempts: movie.failedSubtitleAttempts ?? 0,
		firstSearchAt: movie.firstSubtitleSearchAt ?? null,
		lastSearchTime: movie.lastSearchTime ?? null
	});
}

/**
 * Check if a subtitle search should run for a given episode.
 * Returns true if the search should proceed, false if it should be skipped.
 */
export function isEpisodeSearchActive(episode: {
	id: string;
	title?: string | null;
	failedSubtitleAttempts?: number | null;
	firstSubtitleSearchAt?: string | null;
	lastSearchTime?: string | null;
}): boolean {
	return isSearchActive({
		mediaType: 'episode',
		mediaId: episode.id,
		mediaTitle: episode.title ?? episode.id,
		failedAttempts: episode.failedSubtitleAttempts ?? 0,
		firstSearchAt: episode.firstSubtitleSearchAt ?? null,
		lastSearchTime: episode.lastSearchTime ?? null
	});
}

/**
 * Record a failed subtitle search attempt for a movie.
 * Increments the counter and sets firstSubtitleSearchAt if not already set.
 */
export async function recordMovieSearchFailure(movieId: string): Promise<void> {
	const movie = await db.query.movies.findFirst({
		where: eq(movies.id, movieId),
		columns: { failedSubtitleAttempts: true, firstSubtitleSearchAt: true }
	});

	const now = new Date().toISOString();
	const currentAttempts = movie?.failedSubtitleAttempts ?? 0;

	await db
		.update(movies)
		.set({
			failedSubtitleAttempts: currentAttempts + 1,
			firstSubtitleSearchAt: movie?.firstSubtitleSearchAt ?? now,
			lastSearchTime: now
		})
		.where(eq(movies.id, movieId));
}

/**
 * Record a failed subtitle search attempt for an episode.
 */
export async function recordEpisodeSearchFailure(episodeId: string): Promise<void> {
	const episode = await db.query.episodes.findFirst({
		where: eq(episodes.id, episodeId),
		columns: { failedSubtitleAttempts: true, firstSubtitleSearchAt: true }
	});

	const now = new Date().toISOString();
	const currentAttempts = episode?.failedSubtitleAttempts ?? 0;

	await db
		.update(episodes)
		.set({
			failedSubtitleAttempts: currentAttempts + 1,
			firstSubtitleSearchAt: episode?.firstSubtitleSearchAt ?? now,
			lastSearchTime: now
		})
		.where(eq(episodes.id, episodeId));
}

/**
 * Reset adaptive searching counters for a movie (called when subtitles are found).
 */
export async function resetMovieSearchFailures(movieId: string): Promise<void> {
	await db
		.update(movies)
		.set({
			failedSubtitleAttempts: 0,
			firstSubtitleSearchAt: null,
			lastSearchTime: new Date().toISOString()
		})
		.where(eq(movies.id, movieId));
}

/**
 * Reset adaptive searching counters for an episode (called when subtitles are found).
 */
export async function resetEpisodeSearchFailures(episodeId: string): Promise<void> {
	await db
		.update(episodes)
		.set({
			failedSubtitleAttempts: 0,
			firstSubtitleSearchAt: null,
			lastSearchTime: new Date().toISOString()
		})
		.where(eq(episodes.id, episodeId));
}

/**
 * Core adaptive searching logic.
 *
 * - If no previous failures: always search
 * - If first search was less than ADAPTIVE_SEARCH_DELAY_DAYS ago: always search
 * - If first search was more than ADAPTIVE_SEARCH_DELAY_DAYS ago:
 *   only search if last search was more than ADAPTIVE_SEARCH_DELTA_DAYS ago
 */
function isSearchActive(params: {
	mediaType: 'movie' | 'episode';
	mediaId: string;
	mediaTitle: string;
	failedAttempts: number;
	firstSearchAt: string | null;
	lastSearchTime: string | null;
}): boolean {
	const { mediaType, mediaId, mediaTitle, failedAttempts, firstSearchAt, lastSearchTime } = params;

	// No failed attempts = always search
	if (failedAttempts === 0 || !firstSearchAt) {
		return true;
	}

	const now = Date.now();
	const firstSearchTimestamp = new Date(firstSearchAt).getTime();

	if (isNaN(firstSearchTimestamp)) {
		logger.debug(
			{ mediaType, mediaId },
			'[AdaptiveSearching] Cannot parse firstSubtitleSearchAt, allowing search'
		);
		return true;
	}

	const delayMs = ADAPTIVE_SEARCH_DELAY_DAYS * 24 * 60 * 60 * 1000;

	// Still within the initial search window - always search
	if (firstSearchTimestamp + delayMs > now) {
		return true;
	}

	// Past the initial window - check if enough time has passed since last search
	if (lastSearchTime) {
		const lastSearchTimestamp = new Date(lastSearchTime).getTime();

		if (isNaN(lastSearchTimestamp)) {
			logger.debug(
				{ mediaType, mediaId },
				'[AdaptiveSearching] Cannot parse lastSearchTime, allowing search'
			);
			return true;
		}

		const deltaMs = ADAPTIVE_SEARCH_DELTA_DAYS * 24 * 60 * 60 * 1000;

		if (lastSearchTimestamp + deltaMs > now) {
			logger.debug(
				{
					mediaType,
					mediaId,
					title: mediaTitle,
					failedAttempts,
					daysSinceFirst: Math.floor((now - firstSearchTimestamp) / (24 * 60 * 60 * 1000)),
					daysSinceLast: Math.floor((now - lastSearchTimestamp) / (24 * 60 * 60 * 1000)),
					nextSearchIn: Math.ceil((lastSearchTimestamp + deltaMs - now) / (24 * 60 * 60 * 1000))
				},
				'[AdaptiveSearching] Skipping search - in extended mode, not enough time since last attempt'
			);
			return false;
		}
	}

	return true;
}
