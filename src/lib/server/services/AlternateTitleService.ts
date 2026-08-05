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
 * Maps ISO 639-1 language codes to the ISO 3166-1 country codes where that
 * language is the primary language. Used to rank TMDB alternate titles by
 * relevance when a preferred language is known.
 *
 * TMDB alternate titles only carry country codes (not language codes), so
 * this mapping is the best proxy available without a TMDB API change.
 */
const LANGUAGE_COUNTRIES: Record<string, Set<string>> = {
	en: new Set(['US', 'GB', 'AU', 'CA', 'NZ', 'IE', 'ZA']),
	fr: new Set(['FR', 'BE', 'CH', 'CA', 'LU', 'MC']),
	de: new Set(['DE', 'AT', 'CH', 'LI', 'LU']),
	es: new Set([
		'ES',
		'MX',
		'AR',
		'CO',
		'CL',
		'PE',
		'VE',
		'EC',
		'BO',
		'PY',
		'UY',
		'CR',
		'GT',
		'HN',
		'NI',
		'PA',
		'SV',
		'DO',
		'CU',
		'PR'
	]),
	pt: new Set(['PT', 'BR', 'AO', 'MZ']),
	it: new Set(['IT', 'SM', 'VA', 'CH']),
	ru: new Set(['RU', 'BY', 'KZ', 'KG']),
	ja: new Set(['JP']),
	ko: new Set(['KR']),
	zh: new Set(['CN', 'TW', 'HK', 'MO', 'SG']),
	nl: new Set(['NL', 'BE', 'SR']),
	pl: new Set(['PL']),
	sv: new Set(['SE']),
	no: new Set(['NO']),
	da: new Set(['DK']),
	fi: new Set(['FI']),
	tr: new Set(['TR']),
	ar: new Set([
		'SA',
		'AE',
		'EG',
		'DZ',
		'MA',
		'TN',
		'LY',
		'IQ',
		'SY',
		'JO',
		'LB',
		'KW',
		'QA',
		'BH',
		'OM',
		'YE'
	]),
	hi: new Set(['IN']),
	th: new Set(['TH'])
};

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

	// Remove accents/diacritics BEFORE punctuation replacement
	// This ensures Unicode letters like ű are properly handled
	clean = clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

	// Replace non-letter/number with space while preserving non-Latin scripts
	clean = clean.replace(/[^\p{L}\p{N}\s]/gu, ' ');

	// Collapse multiple spaces and trim
	clean = clean.replace(/\s+/g, ' ').trim();

	return clean;
}

function _pushUniqueSearchTitle(
	titles: string[],
	seen: Set<string>,
	title: string | null | undefined
): void {
	if (!title) return;

	const trimmed = title.trim();
	if (!trimmed) return;

	const normalized = cleanTitle(trimmed);
	if (!normalized || seen.has(normalized)) return;

	seen.add(normalized);
	titles.push(trimmed);
}

function containsCjk(text: string): boolean {
	// CJK Unified Ideographs, Hiragana, Katakana, Bopomofo, Hangul, etc.
	return /[⺀-鿿豈-﫿︰-﹏＀-￯]/u.test(text);
}

/**
 * Reorder a list of alternate titles so romanized (Latin-script) titles appear
 * before CJK-script (Japanese/Chinese/Korean) titles.
 * Order within each group is preserved.
 */
function sortTitlesByScript(titles: string[]): string[] {
	const latin: string[] = [];
	const cjk: string[] = [];
	for (const t of titles) {
		if (containsCjk(t)) {
			cjk.push(t);
		} else {
			latin.push(t);
		}
	}
	return [...latin, ...cjk];
}

/**
 * Whether a title uses a non-Latin script (Cyrillic, CJK, Hangul, Greek…).
 * These are the scripts regional trackers (RuTracker, Kinozal, Nyaa…) search in,
 * so at least one such title must be available as a search/match candidate.
 */
export function containsNonLatinScript(text: string): boolean {
	// Cyrillic, Cyrillic Supplement, Hiragana, Katakana, CJK ideographs,
	// CJK extension A, Hangul, Greek
	return /[\u0400-\u052F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\u0370-\u03FF]/u.test(
		text
	);
}

/**
 * Cap the search-title list while guaranteeing at least one non-Latin
 * (native-script) title survives. The language-preference ordering can otherwise
 * push every Cyrillic/CJK alternate past the cap, leaving regional trackers
 * without a title they can search for or match against.
 */
export function selectSearchTitles(
	displayTitle: string,
	remaining: string[],
	maxTitles = 5
): string[] {
	const titles = [displayTitle, ...remaining];
	const capped = titles.slice(0, maxTitles);
	if (capped.length < titles.length) {
		const uncapped = titles.slice(maxTitles);
		const firstNonLatin = uncapped.find((t) => containsNonLatinScript(t));
		if (firstNonLatin && !capped.some((t) => containsNonLatinScript(t))) {
			capped[capped.length - 1] = firstNonLatin;
		}
	}
	return capped;
}

/**
 * Get all search titles for a movie (primary + original + alternates).
 *
 * Order of precedence:
 * 1. Display title (user's preferred language)
 * 2. Original title (if different - covers non-English originals)
 * 3. TMDB alternates from countries matching the preferred language
 * 4. Remaining TMDB alternates (last-resort fallback for regional trackers)
 *
 * The early-exit in SearchOrchestrator means later entries are only tried
 * when the primary titles return nothing, so the ordering matters more than the count.
 */
export async function getMovieSearchTitles(
	movieId: string,
	preferredLanguage?: string
): Promise<string[]> {
	const movie = await db.query.movies.findFirst({
		where: eq(movies.id, movieId),
		columns: { title: true, originalTitle: true }
	});

	if (!movie) return [];

	const seen = new Set<string>();
	// Display title always goes first (user's preferred language, most likely to match standard trackers).
	const displayTitle = movie.title;
	seen.add(cleanTitle(displayTitle));
	const candidatesSeen = new Set<string>(seen);

	const alternates = await db.query.alternateTitles.findMany({
		where: and(eq(alternateTitles.mediaType, 'movie'), eq(alternateTitles.mediaId, movieId)),
		columns: { title: true, country: true }
	});

	// Split alternates: preferred-language countries first, others as fallback.
	const preferredCountries = preferredLanguage
		? (LANGUAGE_COUNTRIES[preferredLanguage.toLowerCase()] ?? null)
		: null;
	const [langAlts, otherAlts] = preferredCountries
		? [
				alternates.filter((a) => a.country && preferredCountries.has(a.country)),
				alternates.filter((a) => !a.country || !preferredCountries.has(a.country))
			]
		: [alternates, []];

	// Collect remaining candidates (original title + alternates), then sort so
	// romanized (Latin-script) titles appear before CJK-script titles.
	const remaining: string[] = [];
	const pushCandidate = (t: string | null | undefined) => {
		if (!t) return;
		const norm = cleanTitle(t.trim());
		if (!norm || candidatesSeen.has(norm)) return;
		candidatesSeen.add(norm);
		remaining.push(t.trim());
	};

	if (movie.originalTitle && movie.originalTitle !== displayTitle) {
		pushCandidate(movie.originalTitle);
	}
	for (const alt of [...langAlts, ...otherAlts]) {
		pushCandidate(alt.title);
	}

	const sorted = sortTitlesByScript(remaining);
	return selectSearchTitles(displayTitle, sorted);
}

/**
 * Get all search titles for a series (primary + original + alternates).
 * Same ordering strategy as getMovieSearchTitles.
 */
export async function getSeriesSearchTitles(
	seriesId: string,
	preferredLanguage?: string
): Promise<string[]> {
	const show = await db.query.series.findFirst({
		where: eq(series.id, seriesId),
		columns: { title: true, originalTitle: true }
	});

	if (!show) return [];

	const candidatesSeen = new Set<string>();
	// Display title always goes first (user's preferred language).
	const displayTitle = show.title;
	candidatesSeen.add(cleanTitle(displayTitle));

	const alternates = await db.query.alternateTitles.findMany({
		where: and(eq(alternateTitles.mediaType, 'series'), eq(alternateTitles.mediaId, seriesId)),
		columns: { title: true, country: true }
	});

	const preferredCountries = preferredLanguage
		? (LANGUAGE_COUNTRIES[preferredLanguage.toLowerCase()] ?? null)
		: null;
	const [langAlts, otherAlts] = preferredCountries
		? [
				alternates.filter((a) => a.country && preferredCountries.has(a.country)),
				alternates.filter((a) => !a.country || !preferredCountries.has(a.country))
			]
		: [alternates, []];

	// Collect remaining candidates, then sort so romanized (Latin-script) titles
	// appear before CJK-script titles. This puts romaji before kanji/kana.
	const remaining: string[] = [];
	const pushCandidate = (t: string | null | undefined) => {
		if (!t) return;
		const norm = cleanTitle(t.trim());
		if (!norm || candidatesSeen.has(norm)) return;
		candidatesSeen.add(norm);
		remaining.push(t.trim());
	};

	if (show.originalTitle && show.originalTitle !== displayTitle) {
		pushCandidate(show.originalTitle);
	}
	for (const alt of [...langAlts, ...otherAlts]) {
		pushCandidate(alt.title);
	}

	const sorted = sortTitlesByScript(remaining);
	return selectSearchTitles(displayTitle, sorted);
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
			logger.debug({ movieId, tmdbId }, `Stored ${inserted} alternate titles for movie`);
		}

		return inserted;
	} catch (error) {
		logger.warn(
			{
				movieId,
				tmdbId,
				error: error instanceof Error ? error.message : String(error)
			},
			'Failed to fetch movie alternate titles'
		);
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
			logger.debug({ seriesId, tmdbId }, `Stored ${inserted} alternate titles for series`);
		}

		return inserted;
	} catch (error) {
		logger.warn(
			{
				seriesId,
				tmdbId,
				error: error instanceof Error ? error.message : String(error)
			},
			'Failed to fetch series alternate titles'
		);
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

		logger.info({ mediaType, mediaId, title }, `Added user alternate title`);
		return { id: inserted.id, title: inserted.title, source: inserted.source };
	} catch (error) {
		logger.error(
			{
				mediaType,
				mediaId,
				title,
				error: error instanceof Error ? error.message : String(error)
			},
			'Failed to add user alternate title'
		);
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
		logger.info({ mediaType, mediaId, id: titleRecord.id }, `Removed user alternate title`);
		return true;
	} catch (error) {
		logger.error(
			{
				mediaType,
				mediaId,
				id,
				title,
				error: error instanceof Error ? error.message : String(error)
			},
			'Failed to remove alternate title'
		);
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
