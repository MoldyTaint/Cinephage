import { db } from '$lib/server/db/index.js';
import { movies, series } from '$lib/server/db/schema.js';
import { inArray } from 'drizzle-orm';

/**
 * Library status for a single TMDB item
 */
export interface LibraryStatus {
	inLibrary: boolean;
	hasFile: boolean;
	mediaType: 'movie' | 'tv' | null;
	/** Internal library ID if in library */
	libraryId?: string;
}

/**
 * Response map: tmdbId -> LibraryStatus
 */
export type LibraryStatusMap = Record<number, LibraryStatus>;

/**
 * Batch lookup library status for multiple TMDB IDs.
 * This is the server-side implementation used by both page loaders and API endpoints.
 *
 * @param tmdbIds - Array of TMDB IDs to look up
 * @param mediaType - Optional filter: 'movie', 'tv', or 'all' (default)
 * @returns Map of tmdbId -> LibraryStatus
 */
export async function getLibraryStatus(
	tmdbIds: number[],
	mediaType: 'movie' | 'tv' | 'all' = 'all'
): Promise<LibraryStatusMap> {
	if (!Array.isArray(tmdbIds) || tmdbIds.length === 0) {
		return {};
	}

	// Deduplicate and limit to prevent abuse
	const uniqueIds = [...new Set(tmdbIds)].slice(0, 500);

	// Initialize result map with all IDs as not in library
	const statusMap: LibraryStatusMap = {};
	for (const id of uniqueIds) {
		statusMap[id] = {
			inLibrary: false,
			hasFile: false,
			mediaType: null
		};
	}

	// Query movies if needed
	if (mediaType === 'all' || mediaType === 'movie') {
		const libraryMovies = await db
			.select({
				id: movies.id,
				tmdbId: movies.tmdbId,
				hasFile: movies.hasFile
			})
			.from(movies)
			.where(inArray(movies.tmdbId, uniqueIds));

		for (const movie of libraryMovies) {
			statusMap[movie.tmdbId] = {
				inLibrary: true,
				hasFile: movie.hasFile ?? false,
				mediaType: 'movie',
				libraryId: movie.id
			};
		}
	}

	// Query series if needed
	if (mediaType === 'all' || mediaType === 'tv') {
		const librarySeries = await db
			.select({
				id: series.id,
				tmdbId: series.tmdbId,
				episodeFileCount: series.episodeFileCount
			})
			.from(series)
			.where(inArray(series.tmdbId, uniqueIds));

		for (const show of librarySeries) {
			// For series, hasFile means at least one episode file exists
			const hasFile = (show.episodeFileCount ?? 0) > 0;
			statusMap[show.tmdbId] = {
				inLibrary: true,
				hasFile,
				mediaType: 'tv',
				libraryId: show.id
			};
		}
	}

	return statusMap;
}

/**
 * Enrich TMDB media items with library status.
 * Adds `inLibrary`, `hasFile`, and `libraryId` properties to each item.
 *
 * @param items - Array of TMDB media items (must have `id` property)
 * @param mediaType - Optional filter for lookup
 * @returns Same array with library status properties added
 */
export async function enrichWithLibraryStatus<T extends { id: number }>(
	items: T[],
	mediaType: 'movie' | 'tv' | 'all' = 'all'
): Promise<(T & { inLibrary: boolean; hasFile: boolean; libraryId?: string })[]> {
	if (!items || items.length === 0) {
		return [];
	}

	const tmdbIds = items.map((item) => item.id);
	const statusMap = await getLibraryStatus(tmdbIds, mediaType);

	return items.map((item) => {
		const status = statusMap[item.id];
		return {
			...item,
			inLibrary: status?.inLibrary ?? false,
			hasFile: status?.hasFile ?? false,
			libraryId: status?.libraryId
		};
	});
}

/**
 * Filter out items already in library.
 * Generic utility to remove code duplication across discover views.
 *
 * @param items - Array of items with library status
 * @param exclude - Whether to exclude items in library (true = filter them out)
 * @returns Filtered array
 */
export function filterInLibrary<T extends { inLibrary?: boolean }>(
	items: T[],
	exclude: boolean
): T[] {
	if (!exclude) return items;
	return items.filter((item) => !item.inLibrary);
}
