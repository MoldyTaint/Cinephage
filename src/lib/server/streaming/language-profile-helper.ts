/**
 * Language Profile Helper for Streaming
 *
 * Resolves the effective audio language preference for media items to pass to
 * stream extraction. Looks up movies/series by TMDB ID and reads their
 * effective language profile's v2 `audio` object.
 */

import { db } from '$lib/server/db';
import { movies, series } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { getLanguageProfileService } from '$lib/server/subtitles/services/LanguageProfileService';
import { logger } from '$lib/logging';
import { normalizeLanguageCode } from '$lib/shared/languages';
import {
	DEFAULT_EFFECTIVE_AUDIO_PREFERENCE,
	type EffectiveAudioPreference
} from './language-utils';
import type { PlaybackMediaType } from './types';

const streamLog = { logDomain: 'streams' as const };

/**
 * Resolve the effective audio preference for a movie or series.
 *
 * - `preferOriginal` / `languages` come straight from the profile's v2
 *   `audio` object. When no profile exists, `preferOriginal` defaults to true
 *   with no fallback languages.
 * - `originalLanguage` is read from the persisted `movies.original_language` /
 *   `series.original_language` column (null when the media is not in the
 *   library or the column is unset).
 * - Tags are canonicalized via `normalizeLanguageCode` and deduped so the
 *   returned object is a stable, comparable snapshot.
 * - Never throws: any lookup failure logs and returns
 *   `DEFAULT_EFFECTIVE_AUDIO_PREFERENCE`.
 *
 * `season`/`episode` are accepted for signature stability; profiles attach to
 * the series, so all episodes of a series share one resolved preference.
 */
export async function getAudioPreferenceFor(
	mediaType: PlaybackMediaType,
	tmdbId: number,
	season?: number,
	episode?: number
): Promise<EffectiveAudioPreference> {
	try {
		const mediaRow =
			mediaType === 'movie'
				? (
						await db
							.select({ id: movies.id, originalLanguage: movies.originalLanguage })
							.from(movies)
							.where(eq(movies.tmdbId, tmdbId))
							.limit(1)
					)[0]
				: (
						await db
							.select({ id: series.id, originalLanguage: series.originalLanguage })
							.from(series)
							.where(eq(series.tmdbId, tmdbId))
							.limit(1)
					)[0];

		if (!mediaRow) {
			// Media not in the library — no language preference known.
			return { ...DEFAULT_EFFECTIVE_AUDIO_PREFERENCE };
		}

		const profileService = getLanguageProfileService();
		const profile =
			mediaType === 'movie'
				? await profileService.getProfileForMovie(mediaRow.id)
				: await profileService.getProfileForSeries(mediaRow.id);

		// v2 audio object directly off the parsed profile (rowToProfile already
		// coerces malformed JSON to the default audio shape).
		const audio = profile?.audio ?? {
			preferOriginal: DEFAULT_EFFECTIVE_AUDIO_PREFERENCE.preferOriginal,
			languages: [...DEFAULT_EFFECTIVE_AUDIO_PREFERENCE.languages]
		};

		const seen = new Set<string>();
		const languages = audio.languages
			.map((tag) => normalizeLanguageCode(tag))
			.filter((tag) => {
				if (tag === '' || seen.has(tag)) return false;
				seen.add(tag);
				return true;
			});

		const rawOriginal = mediaRow.originalLanguage?.trim();
		const preference: EffectiveAudioPreference = {
			preferOriginal: audio.preferOriginal,
			languages,
			originalLanguage: rawOriginal ? normalizeLanguageCode(rawOriginal) : null
		};

		logger.debug(
			{
				tmdbId,
				mediaType,
				season,
				episode,
				profileName: profile?.name,
				...preference,
				...streamLog
			},
			'Resolved audio preference'
		);

		return preference;
	} catch (error) {
		logger.warn(
			{
				tmdbId,
				mediaType,
				season,
				episode,
				error: error instanceof Error ? error.message : String(error),
				...streamLog
			},
			'Failed to resolve audio preference; using defaults'
		);
		return { ...DEFAULT_EFFECTIVE_AUDIO_PREFERENCE };
	}
}

/**
 * Resolve the ordered subtitle language preferences for a movie or episode,
 * from the item's effective subtitle requirements (episode override → series
 * override → library → instance default; requirement order preserved).
 *
 * Used by playback to mark the DEFAULT subtitle track in HLS playlists: the
 * first provider track satisfying the highest-priority language wins.
 * Returns an empty array when nothing is resolvable (media not in the
 * library, no requirements) so callers fall back to positional defaulting.
 * Never throws.
 */
export async function getPreferredSubtitleLanguagesFor(
	mediaType: PlaybackMediaType,
	tmdbId: number,
	season?: number,
	episode?: number
): Promise<string[]> {
	try {
		const profileService = getLanguageProfileService();

		if (mediaType === 'movie') {
			const movie = (
				await db
					.select({ id: movies.id })
					.from(movies)
					.where(eq(movies.tmdbId, tmdbId))
					.limit(1)
			)[0];
			if (!movie) return [];
			const effective = await profileService.getEffectiveSubtitleRequirements({
				movieId: movie.id
			});
			return normalizePreferred(effective?.requirements ?? []);
		}

		const show = (
			await db
				.select({ id: series.id })
				.from(series)
				.where(eq(series.tmdbId, tmdbId))
				.limit(1)
		)[0];
		if (!show || season === undefined || episode === undefined) return [];

		const { episodes } = await import('$lib/server/db/schema');
		const episodeRow = (
			await db
				.select({ id: episodes.id })
				.from(episodes)
				.where(
					and(
						eq(episodes.seriesId, show.id),
						eq(episodes.seasonNumber, season),
						eq(episodes.episodeNumber, episode)
					)
				)
				.limit(1)
		)[0];
		if (!episodeRow) return [];

		const effective = await profileService.getEffectiveSubtitleRequirements({
			episodeId: episodeRow.id
		});
		return normalizePreferred(effective?.requirements ?? []);
	} catch (error) {
		logger.warn(
			{ tmdbId, mediaType, season, episode, ...streamLog, error: error instanceof Error ? error.message : String(error) },
			'Failed to resolve preferred subtitle languages; using positional defaulting'
		);
		return [];
	}
}

/** Canonicalize + dedupe requirement tags, preserving requirement order. */
function normalizePreferred(
	requirements: Array<{ tag: string }>
): string[] {
	const seen = new Set<string>();
	const languages: string[] = [];
	for (const requirement of requirements) {
		const tag = normalizeLanguageCode(requirement.tag);
		if (tag === '' || seen.has(tag)) continue;
		seen.add(tag);
		languages.push(tag);
	}
	return languages;
}
