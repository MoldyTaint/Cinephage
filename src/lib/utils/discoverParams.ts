/**
 * Shared URL parameter parsing for discover page.
 * Used by both server and client to ensure consistency.
 */

export interface DiscoverParams {
	type: string;
	page: string;
	sortBy: string;
	trending: string | null;
	withWatchProviders: string;
	watchRegion: string;
	withGenres: string;
	minDate: string | null;
	maxDate: string | null;
	minRating: string | null;
	excludeInLibrary: boolean;
}

/**
 * Parse discover URL search params into a typed object.
 */
export function parseDiscoverParams(searchParams: URLSearchParams): DiscoverParams {
	return {
		type: searchParams.get('type') || 'all',
		page: searchParams.get('page') || '1',
		sortBy: searchParams.get('sort_by') || 'popularity.desc',
		trending: searchParams.get('trending'),
		withWatchProviders: searchParams.get('with_watch_providers') || '',
		watchRegion: searchParams.get('watch_region') || 'US',
		withGenres: searchParams.get('with_genres') || '',
		minDate: searchParams.get('primary_release_date.gte') || null,
		maxDate: searchParams.get('primary_release_date.lte') || null,
		minRating: searchParams.get('vote_average.gte') || null,
		excludeInLibrary: searchParams.get('exclude_in_library') === 'true'
	};
}

/**
 * Check if the current params represent the default view (dashboard).
 */
export function isDefaultView(searchParams: URLSearchParams, params: DiscoverParams): boolean {
	return (
		!searchParams.has('trending') &&
		(!searchParams.has('type') || searchParams.get('type') === 'all') &&
		!searchParams.has('with_watch_providers') &&
		!searchParams.has('with_genres') &&
		!searchParams.has('primary_release_date.gte') &&
		!searchParams.has('primary_release_date.lte') &&
		!searchParams.has('vote_average.gte') &&
		(!searchParams.has('page') || searchParams.get('page') === '1') &&
		params.sortBy === 'popularity.desc'
	);
}

/**
 * Parse provider IDs from comma-separated string.
 */
export function parseProviderIds(value: string | null): number[] {
	if (!value) return [];
	return value
		.split(',')
		.filter(Boolean)
		.map(Number)
		.filter((n) => !isNaN(n));
}

/**
 * Parse genre IDs from comma-separated string.
 */
export function parseGenreIds(value: string | null): number[] {
	return parseProviderIds(value); // Same logic
}

/**
 * Extract year from date string (YYYY-MM-DD or YYYY).
 */
export function extractYear(dateString: string | null): string {
	if (!dateString) return '';
	return dateString.split('-')[0];
}
