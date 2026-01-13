/**
 * Alternate Title Service
 *
 * Manages alternate/translated titles for movies and TV series.
 * Used for multi-title search to improve results on regional trackers.
 *
 * Features:
 * - Fetch and store alternate titles from TMDB
 * - Query alternate titles for search
 * - User-defined custom titles
 * - Title normalization for matching
 */

import { db } from '$lib/server/db/index.js';
import { alternateTitles, movies, series } from '$lib/server/db/schema.js';
import { eq, and } from 'drizzle-orm';
import { tmdb } from '$lib/server/tmdb.js';
import { logger } from '$lib/logging/index.js';

/**
 * Normalize a title for matching (like Radarr's CleanTitle)
 * Removes special characters, accents, and normalizes whitespace
 */
export function cleanTitle(title: string): string {
	if (!title) return '';

	let clean = title.toLowerCase();

	// Remove "the " prefix
	clean = clean.replace(/^the\s+/i, '');

	// Replace & with and
	clean = clean.replace(/&/g, 'and');

	// Remove special characters (quotes, apostrophes, etc.)
	clean = clean.replace(/[''`´""]/g, '');

	// Replace non-alphanumeric with space
	clean = clean.replace(/[^\w\s]/g, ' ');

	// Remove accents/diacritics
	clean = clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

	// Collapse multiple spaces and trim
	clean = clean.replace(/\s+/g, ' ').trim();

	return clean;
}

/**
 * Get all search titles for a movie (primary + original + alternates)
 * Returns deduplicated list with primary title first
 */
export async function getMovieSearchTitles(movieId: string): Promise<string[]> {
	// Get the movie's primary and original titles
	const movie = await db.query.movies.findFirst({
		where: eq(movies.id, movieId),
		columns: { title: true, originalTitle: true }
	});

	if (!movie) return [];

	const titles: string[] = [movie.title];

	// Add original title if different
	if (movie.originalTitle && movie.originalTitle !== movie.title) {
		titles.push(movie.originalTitle);
	}

	// Get alternate titles from database
	const alternates = await db.query.alternateTitles.findMany({
		where: and(eq(alternateTitles.mediaType, 'movie'), eq(alternateTitles.mediaId, movieId)),
		columns: { title: true }
	});

	for (const alt of alternates) {
		if (!titles.includes(alt.title)) {
			titles.push(alt.title);
		}
	}

	// Limit to prevent excessive searches
	return titles.slice(0, 5);
}

/**
 * Get all search titles for a series (primary + original + alternates)
 * Returns deduplicated list with primary title first
 */
export async function getSeriesSearchTitles(seriesId: string): Promise<string[]> {
	// Get the series' primary and original titles
	const show = await db.query.series.findFirst({
		where: eq(series.id, seriesId),
		columns: { title: true, originalTitle: true }
	});

	if (!show) return [];

	const titles: string[] = [show.title];

	// Add original title if different
	if (show.originalTitle && show.originalTitle !== show.title) {
		titles.push(show.originalTitle);
	}

	// Get alternate titles from database
	const alternates = await db.query.alternateTitles.findMany({
		where: and(eq(alternateTitles.mediaType, 'series'), eq(alternateTitles.mediaId, seriesId)),
		columns: { title: true }
	});

	for (const alt of alternates) {
		if (!titles.includes(alt.title)) {
			titles.push(alt.title);
		}
	}

	// Limit to prevent excessive searches
	return titles.slice(0, 5);
}

/**
 * Fetch and store alternate titles from TMDB for a movie
 */
export async function fetchAndStoreMovieAlternateTitles(
	movieId: string,
	tmdbId: number
): Promise<number> {
	try {
		const response = await tmdb.getMovieAlternateTitles(tmdbId);

		if (!response.titles || response.titles.length === 0) {
			return 0;
		}

		// Get existing TMDB titles for this movie to avoid duplicates
		const existing = await db.query.alternateTitles.findMany({
			where: and(
				eq(alternateTitles.mediaType, 'movie'),
				eq(alternateTitles.mediaId, movieId),
				eq(alternateTitles.source, 'tmdb')
			),
			columns: { title: true }
		});
		const existingTitles = new Set(existing.map((e) => e.title));

		// Insert new titles
		let inserted = 0;
		for (const alt of response.titles) {
			if (!alt.title || existingTitles.has(alt.title)) continue;

			await db.insert(alternateTitles).values({
				mediaType: 'movie',
				mediaId: movieId,
				title: alt.title,
				cleanTitle: cleanTitle(alt.title),
				source: 'tmdb',
				country: alt.iso_3166_1 || null
			});
			inserted++;
		}

		if (inserted > 0) {
			logger.debug(`Stored ${inserted} alternate titles for movie`, { movieId, tmdbId });
		}

		return inserted;
	} catch (error) {
		logger.warn('Failed to fetch movie alternate titles', {
			movieId,
			tmdbId,
			error: error instanceof Error ? error.message : String(error)
		});
		return 0;
	}
}

/**
 * Fetch and store alternate titles from TMDB for a TV series
 */
export async function fetchAndStoreSeriesAlternateTitles(
	seriesId: string,
	tmdbId: number
): Promise<number> {
	try {
		const response = await tmdb.getTvAlternateTitles(tmdbId);

		if (!response.results || response.results.length === 0) {
			return 0;
		}

		// Get existing TMDB titles for this series to avoid duplicates
		const existing = await db.query.alternateTitles.findMany({
			where: and(
				eq(alternateTitles.mediaType, 'series'),
				eq(alternateTitles.mediaId, seriesId),
				eq(alternateTitles.source, 'tmdb')
			),
			columns: { title: true }
		});
		const existingTitles = new Set(existing.map((e) => e.title));

		// Insert new titles
		let inserted = 0;
		for (const alt of response.results) {
			if (!alt.title || existingTitles.has(alt.title)) continue;

			await db.insert(alternateTitles).values({
				mediaType: 'series',
				mediaId: seriesId,
				title: alt.title,
				cleanTitle: cleanTitle(alt.title),
				source: 'tmdb',
				country: alt.iso_3166_1 || null
			});
			inserted++;
		}

		if (inserted > 0) {
			logger.debug(`Stored ${inserted} alternate titles for series`, { seriesId, tmdbId });
		}

		return inserted;
	} catch (error) {
		logger.warn('Failed to fetch series alternate titles', {
			seriesId,
			tmdbId,
			error: error instanceof Error ? error.message : String(error)
		});
		return 0;
	}
}

/**
 * Add a user-defined alternate title
 * Returns the newly created title record, or null if it already exists
 */
export async function addUserAlternateTitle(
	mediaType: 'movie' | 'series',
	mediaId: string,
	title: string
): Promise<{ id: number; title: string; source: string } | null> {
	try {
		// Check if title already exists
		const existing = await db.query.alternateTitles.findFirst({
			where: and(
				eq(alternateTitles.mediaType, mediaType),
				eq(alternateTitles.mediaId, mediaId),
				eq(alternateTitles.title, title)
			)
		});

		if (existing) {
			return null; // Already exists
		}

		const [inserted] = await db
			.insert(alternateTitles)
			.values({
				mediaType,
				mediaId,
				title,
				cleanTitle: cleanTitle(title),
				source: 'user'
			})
			.returning();

		logger.info(`Added user alternate title`, { mediaType, mediaId, title });
		return { id: inserted.id, title: inserted.title, source: inserted.source };
	} catch (error) {
		logger.error('Failed to add user alternate title', {
			mediaType,
			mediaId,
			title,
			error: error instanceof Error ? error.message : String(error)
		});
		throw error;
	}
}

/**
 * Remove an alternate title (user titles only)
 * Can identify by id or by title text
 */
export async function removeAlternateTitle(
	mediaType: 'movie' | 'series',
	mediaId: string,
	id?: number,
	title?: string
): Promise<boolean> {
	try {
		// Find the title to remove
		let titleRecord;
		if (id) {
			titleRecord = await db.query.alternateTitles.findFirst({
				where: and(
					eq(alternateTitles.mediaType, mediaType),
					eq(alternateTitles.mediaId, mediaId),
					eq(alternateTitles.id, id)
				)
			});
		} else if (title) {
			titleRecord = await db.query.alternateTitles.findFirst({
				where: and(
					eq(alternateTitles.mediaType, mediaType),
					eq(alternateTitles.mediaId, mediaId),
					eq(alternateTitles.title, title)
				)
			});
		} else {
			return false;
		}

		if (!titleRecord || titleRecord.source !== 'user') {
			return false; // Not found or not user-added
		}

		await db.delete(alternateTitles).where(eq(alternateTitles.id, titleRecord.id));
		logger.info(`Removed user alternate title`, { mediaType, mediaId, id: titleRecord.id });
		return true;
	} catch (error) {
		logger.error('Failed to remove alternate title', {
			mediaType,
			mediaId,
			id,
			title,
			error: error instanceof Error ? error.message : String(error)
		});
		return false;
	}
}

/**
 * Get all alternate titles for a media item
 */
export async function getAlternateTitles(mediaType: 'movie' | 'series', mediaId: string) {
	return db.query.alternateTitles.findMany({
		where: and(eq(alternateTitles.mediaType, mediaType), eq(alternateTitles.mediaId, mediaId)),
		orderBy: (table, { asc }) => [asc(table.source), asc(table.title)]
	});
}

/**
 * Delete all alternate titles for a media item (used when media is removed)
 */
export async function deleteAllAlternateTitles(
	mediaType: 'movie' | 'series',
	mediaId: string
): Promise<void> {
	await db
		.delete(alternateTitles)
		.where(and(eq(alternateTitles.mediaType, mediaType), eq(alternateTitles.mediaId, mediaId)));
}
