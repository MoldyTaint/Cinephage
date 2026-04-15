/**
 * Language Profile Helper for Streaming
 *
 * Retrieves language preferences for media items to pass to stream extraction.
 * Looks up movies/series by TMDB ID and returns their language profile preferences.
 */

import { db } from '$lib/server/db';
import { movies, series } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { getLanguageProfileService } from '$lib/server/subtitles/services/LanguageProfileService';
import { logger } from '$lib/logging';

const streamLog = { logDomain: 'streams' as const };

/**
 * Get preferred languages for a movie by TMDB ID
 * Returns an empty array if movie not found or no profile assigned
 */
export async function getPreferredLanguagesForMovie(tmdbId: number): Promise<string[]> {
	try {
		const movie = await db
			.select({ id: movies.id })
			.from(movies)
			.where(eq(movies.tmdbId, tmdbId))
			.limit(1);

		if (!movie[0]) {
			// Movie not in library - no language preference
			return [];
		}

		const profileService = getLanguageProfileService();
		const profile = await profileService.getProfileForMovie(movie[0].id);

		if (!profile) {
			return [];
		}

		// Extract language codes in order of preference
		const languages = profile.languages.map((lang) => lang.code);

		logger.debug(
			{
				tmdbId,
				languages,
				profileName: profile.name,
				...streamLog
			},
			'Got language preferences for movie'
		);

		return languages;
	} catch (error) {
		logger.debug(
			{
				tmdbId,
				error: error instanceof Error ? error.message : String(error),
				...streamLog
			},
			'Failed to get language preferences for movie'
		);
		return [];
	}
}

/**
 * Get preferred languages for a series by TMDB ID
 * Returns an empty array if series not found or no profile assigned
 */
export async function getPreferredLanguagesForSeries(tmdbId: number): Promise<string[]> {
	try {
		const show = await db
			.select({ id: series.id })
			.from(series)
			.where(eq(series.tmdbId, tmdbId))
			.limit(1);

		if (!show[0]) {
			// Series not in library - no language preference
			return [];
		}

		const profileService = getLanguageProfileService();
		const profile = await profileService.getProfileForSeries(show[0].id);

		if (!profile) {
			return [];
		}

		// Extract language codes in order of preference
		const languages = profile.languages.map((lang) => lang.code);

		logger.debug(
			{
				tmdbId,
				languages,
				profileName: profile.name,
				...streamLog
			},
			'Got language preferences for series'
		);

		return languages;
	} catch (error) {
		logger.debug(
			{
				tmdbId,
				error: error instanceof Error ? error.message : String(error),
				...streamLog
			},
			'Failed to get language preferences for series'
		);
		return [];
	}
}
