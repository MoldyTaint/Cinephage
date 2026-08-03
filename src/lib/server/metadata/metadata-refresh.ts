import { db } from '$lib/server/db/index.js';
import { movies, series, episodes } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { tmdb } from '$lib/server/tmdb.js';
import { createChildLogger } from '$lib/logging';

const logger = createChildLogger({ logDomain: 'system' as const });

export function resolveLanguageForFetch(
	metadataLanguage: string | null,
	originalLanguage: string | null
): string | null {
	if (metadataLanguage === null) return null;
	if (metadataLanguage === 'original') return originalLanguage || null;
	return metadataLanguage || null;
}

async function resolveLanguage(
	metaLanguage: string | null,
	tmdbId: number,
	endpoint: string
): Promise<string | null> {
	if (metaLanguage === 'original') {
		try {
			const details = await tmdb.fetch(endpoint);
			const d = details as Record<string, unknown>;
			return (d.original_language as string) || null;
		} catch {
			return null;
		}
	}
	return metaLanguage || null;
}

export async function refreshMovieMetadata(movieId: string): Promise<void> {
	const [movie] = await db
		.select({ tmdbId: movies.tmdbId, metadataLanguage: movies.metadataLanguage })
		.from(movies)
		.where(eq(movies.id, movieId));

	if (!movie) return;

	const metaLang = movie.metadataLanguage ?? null;
	const lang = await resolveLanguage(metaLang, movie.tmdbId, `/movie/${movie.tmdbId}`);
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
		.select({ tmdbId: series.tmdbId, metadataLanguage: series.metadataLanguage })
		.from(series)
		.where(eq(series.id, seriesId));

	if (!s) return;

	const metaLang = s.metadataLanguage ?? null;
	const lang = await resolveLanguage(metaLang, s.tmdbId, `/tv/${s.tmdbId}`);
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
			if (typeof ed.name === 'string') epUpdate.title = ed.name;
			if (typeof ed.overview === 'string') epUpdate.overview = ed.overview;

			if (Object.keys(epUpdate).length > 0) {
				await db.update(episodes).set(epUpdate).where(eq(episodes.id, ep.id));
			}
		} catch {
			// skip individual episode failures
		}
	}

	logger.info({ seriesId, episodeCount: epList.length }, 'Refreshed episode metadata');
}
