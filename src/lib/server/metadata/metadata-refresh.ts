import { db } from '$lib/server/db/index.js';
import { movies, series, episodes } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { tmdb } from '$lib/server/tmdb.js';
import { isGeneratedEpisodeTitle } from './episode-title.js';
import { createChildLogger } from '$lib/logging';

const logger = createChildLogger({ logDomain: 'system' as const });

/** Per-item metadata language override mode (mirrors the DB column). */
export type MetadataLanguageMode = 'inherit' | 'original' | 'explicit';

/**
 * Resolve the TMDB request language from the v2 mode/value pair when the
 * original language is already known (row already loaded).
 * - 'explicit' → the stored locale
 * - 'original' → the item's original_language
 * - 'inherit'/null → null (global default)
 */
export function resolveLanguageForFetch(
	mode: string | null | undefined,
	value: string | null | undefined,
	originalLanguage: string | null
): string | null {
	if (mode === 'explicit') return value || null;
	if (mode === 'original') return originalLanguage || null;
	return null;
}

/**
 * Resolve the TMDB request language from the v2 mode/value pair, fetching the
 * item's original_language from TMDB when the mode is 'original'. 'explicit'
 * uses the stored value; 'inherit'/null returns null (global default).
 */
export async function resolveLanguage(
	mode: string | null | undefined,
	value: string | null | undefined,
	tmdbId: number,
	endpoint: string
): Promise<string | null> {
	if (mode === 'explicit') return value || null;
	if (mode === 'original') {
		try {
			const details = await tmdb.fetch(endpoint);
			const d = details as Record<string, unknown>;
			return (d.original_language as string) || null;
		} catch {
			return null;
		}
	}
	return null;
}

/**
 * Derive the deprecated single-string `metadataLanguage` view from the v2 pair
 * (kept one release for old clients): explicit → value, original → 'original',
 * inherit/null → null.
 */
export function metadataLanguageToLegacy(
	mode: string | null | undefined,
	value: string | null | undefined
): string | null {
	if (mode === 'explicit') return value ?? null;
	if (mode === 'original') return 'original';
	return null;
}

let legacyMetadataLanguageWarned = false;

/** Log once per process that the legacy single-string override is deprecated. */
export function warnLegacyMetadataLanguage(source: string): void {
	if (legacyMetadataLanguageWarned) return;
	legacyMetadataLanguageWarned = true;
	logger.warn(
		{ source },
		'metadataLanguage is deprecated; use metadataLanguageMode/metadataLanguageValue'
	);
}

export async function refreshMovieMetadata(movieId: string): Promise<void> {
	const [movie] = await db
		.select({
			tmdbId: movies.tmdbId,
			metadataLanguageMode: movies.metadataLanguageMode,
			metadataLanguageValue: movies.metadataLanguageValue
		})
		.from(movies)
		.where(eq(movies.id, movieId));

	if (!movie) return;

	const lang = await resolveLanguage(
		movie.metadataLanguageMode,
		movie.metadataLanguageValue,
		movie.tmdbId,
		`/movie/${movie.tmdbId}`
	);
	const fetchLang = lang ? `&language=${lang}` : '';

	try {
		const details = await tmdb.fetch(
			`/movie/${movie.tmdbId}?append_to_response=credits,videos,images,recommendations,similar,watch/providers,release_dates,keywords&include_image_language=null,en${fetchLang}`
		);

		const d = details as Record<string, unknown>;
		const updateData: Record<string, unknown> = {};

		if (typeof d.title === 'string') updateData.title = d.title;
		if (typeof d.original_title === 'string') updateData.originalTitle = d.original_title;
		if (typeof d.overview === 'string') updateData.overview = d.overview;
		if (typeof d.poster_path === 'string') updateData.posterPath = d.poster_path;
		if (typeof d.backdrop_path === 'string') updateData.backdropPath = d.backdrop_path;
		if (typeof d.runtime === 'number') updateData.runtime = d.runtime;
		if (typeof d.release_date === 'string') updateData.releaseDate = d.release_date;

		const rawYear = d.release_date as string | undefined;
		if (rawYear) {
			const year = parseInt(rawYear.substring(0, 4), 10);
			if (!isNaN(year)) updateData.year = year;
		}

		const genres = d.genres as Array<{ name?: string }> | undefined;
		if (genres) {
			updateData.genres = genres.map((g) => g.name).filter(Boolean);
		}

		const adult = d.adult as boolean | undefined;
		if (typeof adult === 'boolean') updateData.adult = adult;

		const belongsToCollection = d.belongs_to_collection as
			{ id: number; name: string } | null | undefined;
		if (belongsToCollection !== undefined) {
			updateData.tmdbCollectionId = belongsToCollection?.id ?? null;
			updateData.collectionName = belongsToCollection?.name ?? null;
		}

		if (Object.keys(updateData).length > 0) {
			await db.update(movies).set(updateData).where(eq(movies.id, movieId));
			logger.info({ movieId, fields: Object.keys(updateData) }, 'Refreshed movie metadata');
		}
	} catch (err) {
		logger.error({ movieId, err }, 'Failed to refresh movie metadata');
	}
}

export async function refreshSeriesMetadata(seriesId: string): Promise<void> {
	const [s] = await db
		.select({
			tmdbId: series.tmdbId,
			metadataLanguageMode: series.metadataLanguageMode,
			metadataLanguageValue: series.metadataLanguageValue
		})
		.from(series)
		.where(eq(series.id, seriesId));

	if (!s) return;

	const lang = await resolveLanguage(
		s.metadataLanguageMode,
		s.metadataLanguageValue,
		s.tmdbId,
		`/tv/${s.tmdbId}`
	);
	const fetchLang = lang ? `&language=${lang}` : '';

	try {
		const details = await tmdb.fetch(
			`/tv/${s.tmdbId}?append_to_response=credits,videos,images,recommendations,similar,watch/providers,content_ratings,keywords&include_image_language=null,en${fetchLang}`
		);

		const d = details as Record<string, unknown>;
		const updateData: Record<string, unknown> = {};

		if (typeof d.name === 'string') updateData.title = d.name;
		if (typeof d.original_name === 'string') updateData.originalTitle = d.original_name;
		if (typeof d.overview === 'string') updateData.overview = d.overview;
		if (typeof d.poster_path === 'string') updateData.posterPath = d.poster_path;
		if (typeof d.backdrop_path === 'string') updateData.backdropPath = d.backdrop_path;
		if (typeof d.status === 'string') updateData.status = d.status;

		const networks = d.networks as Array<{ name?: string }> | undefined;
		if (networks) {
			updateData.network =
				networks
					.map((n) => n.name)
					.filter(Boolean)
					.join(', ') || null;
		}

		const rawYear = d.first_air_date as string | undefined;
		if (rawYear) {
			const year = parseInt(rawYear.substring(0, 4), 10);
			if (!isNaN(year)) updateData.year = year;
		}
		if (typeof d.first_air_date === 'string') updateData.firstAirDate = d.first_air_date;

		const genres = d.genres as Array<{ name?: string }> | undefined;
		if (genres) {
			updateData.genres = genres.map((g) => g.name).filter(Boolean);
		}

		const adult = d.adult as boolean | undefined;
		if (typeof adult === 'boolean') updateData.adult = adult;

		if (Object.keys(updateData).length > 0) {
			await db.update(series).set(updateData).where(eq(series.id, seriesId));
			logger.info({ seriesId, fields: Object.keys(updateData) }, 'Refreshed series metadata');
		}

		await refreshEpisodeMetadata(seriesId, s.tmdbId, lang);
	} catch (err) {
		logger.error({ seriesId, err }, 'Failed to refresh series metadata');
	}
}

async function refreshEpisodeMetadata(
	seriesId: string,
	tmdbId: number,
	language: string | null
): Promise<void> {
	const epList = await db
		.select({
			id: episodes.id,
			seasonNumber: episodes.seasonNumber,
			episodeNumber: episodes.episodeNumber
		})
		.from(episodes)
		.where(eq(episodes.seriesId, seriesId));

	for (const ep of epList) {
		const fetchLang = language ? `&language=${language}` : '';
		try {
			const epDetails = await tmdb.fetch(
				`/tv/${tmdbId}/season/${ep.seasonNumber}/episode/${ep.episodeNumber}${fetchLang ? `?language=${language}` : ''}`
			);
			const ed = epDetails as Record<string, unknown>;
			const epUpdate: Record<string, unknown> = {};

			let name = typeof ed.name === 'string' ? ed.name : undefined;
			let overview = typeof ed.overview === 'string' ? ed.overview.trim() : '';

			// TMDB synthesizes "Episode N"-style names in the requested language
			// when no real translation exists (e.g. German "Folge 4"). Those are
			// not translations — fall back to the original-language data rather
			// than clobbering the real title.
			const needsFallback =
				language !== null && (name === undefined || isGeneratedEpisodeTitle(name));
			if (needsFallback) {
				try {
					const original = (await tmdb.fetch(
						`/tv/${tmdbId}/season/${ep.seasonNumber}/episode/${ep.episodeNumber}`
					)) as Record<string, unknown>;
					const originalName = typeof original.name === 'string' ? original.name : undefined;
					if (originalName && !isGeneratedEpisodeTitle(originalName)) {
						name = originalName;
						if (!overview && typeof original.overview === 'string') {
							overview = original.overview.trim();
						}
					}
				} catch {
					// keep localized data if the fallback request fails
				}
			}

			if (name !== undefined && !isGeneratedEpisodeTitle(name)) epUpdate.title = name;
			if (overview) epUpdate.overview = overview;

			if (Object.keys(epUpdate).length > 0) {
				await db.update(episodes).set(epUpdate).where(eq(episodes.id, ep.id));
			}
		} catch {
			// skip individual episode failures
		}
	}

	logger.info({ seriesId, episodeCount: epList.length }, 'Refreshed episode metadata');
}
