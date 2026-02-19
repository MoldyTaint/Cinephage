import { tmdb } from '$lib/server/tmdb';
import type { Movie, TVShow, PaginatedResponse } from '$lib/types/tmdb';
import { GENRE_MAPPINGS, SEARCH } from '$lib/config/constants';

/**
 * Maps movie genre IDs to TV genre IDs or vice versa.
 * Uses centralized mappings from config/constants.ts.
 */
const MOVIE_TO_TV_GENRES: Record<string, string> = GENRE_MAPPINGS.MOVIE_TO_TV;

/**
 * Maps TV genre IDs to movie genre IDs.
 * Note: Some TV genres map to multiple movie genres (pipe-separated).
 */
const TV_TO_MOVIE_GENRES: Record<string, string> = {
	'10759': '28|12', // Action & Adventure -> Action | Adventure
	'10765': '14|878', // Sci-Fi & Fantasy -> Fantasy | Sci-Fi
	'10768': '10752' // War & Politics -> War
};

function mapGenres(genres: string, targetType: 'movie' | 'tv'): string {
	if (!genres) return '';
	const ids = genres.split(',');
	const mapped = ids.map((id) => {
		if (targetType === 'tv') {
			return MOVIE_TO_TV_GENRES[id] || id;
		} else {
			return TV_TO_MOVIE_GENRES[id] || id;
		}
	});
	return Array.from(new Set(mapped)).join(',');
}

export interface DiscoverParams {
	type: string;
	page: string;
	sortBy: string;
	trending?: string | null;
	withWatchProviders: string;
	watchRegion: string;
	withGenres: string;
	minDate: string | null;
	maxDate: string | null;
	minRating: string | null;
}

export async function getDiscoverResults(params: DiscoverParams) {
	const {
		type,
		page,
		sortBy,
		trending = null,
		withWatchProviders,
		watchRegion,
		withGenres,
		minDate,
		maxDate,
		minRating
	} = params;

	const fetchOptions = (endpoint: string, p: string = page) => {
		const queryParams = new URLSearchParams();
		queryParams.set('page', p);

		// Handle Sort Mapping for TV
		let sort = sortBy;
		if (endpoint.includes('tv')) {
			if (sort === 'primary_release_date.desc') sort = 'first_air_date.desc';
			if (sort === 'primary_release_date.asc') sort = 'first_air_date.asc';
			if (sort === 'revenue.desc') sort = 'popularity.desc'; // TV doesn't have revenue sort
		}
		queryParams.set('sort_by', sort);

		if (withWatchProviders) {
			queryParams.set('with_watch_providers', withWatchProviders);
			queryParams.set('watch_region', watchRegion);
		}

		if (withGenres) {
			if (endpoint.includes('movie')) {
				queryParams.set('with_genres', mapGenres(withGenres, 'movie'));
			} else if (endpoint.includes('tv')) {
				queryParams.set('with_genres', mapGenres(withGenres, 'tv'));
			} else {
				queryParams.set('with_genres', withGenres);
			}
		}

		if (minDate) {
			if (endpoint.includes('movie')) queryParams.set('primary_release_date.gte', minDate);
			if (endpoint.includes('tv')) queryParams.set('first_air_date.gte', minDate);
		}
		if (maxDate) {
			if (endpoint.includes('movie')) queryParams.set('primary_release_date.lte', maxDate);
			if (endpoint.includes('tv')) queryParams.set('first_air_date.lte', maxDate);
		}
		if (minRating) {
			queryParams.set('vote_average.gte', minRating);
			queryParams.set('vote_count.gte', String(SEARCH.MIN_VOTE_COUNT));
		}

		return `${endpoint}?${queryParams.toString()}`;
	};

	const fetchMovies = () => tmdb.fetch(fetchOptions('/discover/movie'));
	const fetchTV = () => tmdb.fetch(fetchOptions('/discover/tv'));

	let results: (Movie | TVShow)[];
	let totalPages: number;
	let totalResults: number;

	if (trending === 'day' || trending === 'week') {
		const trendingEndpoint = `/trending/all/${trending}`;
		const url = `${trendingEndpoint}?page=${encodeURIComponent(page)}`;
		const data = (await tmdb.fetch(url)) as PaginatedResponse<Movie | TVShow>;
		results = data.results;
		totalPages = data.total_pages;
		totalResults = data.total_results;
	} else if (type === 'movie') {
		const data = (await fetchMovies()) as PaginatedResponse<Movie>;
		results = data.results.map((m) => ({ ...m, media_type: 'movie' }));
		totalPages = data.total_pages;
		totalResults = data.total_results;
	} else if (type === 'tv') {
		const data = (await fetchTV()) as PaginatedResponse<TVShow>;
		results = data.results.map((t) => ({ ...t, media_type: 'tv' }));
		totalPages = data.total_pages;
		totalResults = data.total_results;
	} else {
		const [movies, tv] = await Promise.all([
			fetchMovies() as Promise<PaginatedResponse<Movie>>,
			fetchTV() as Promise<PaginatedResponse<TVShow>>
		]);

		const movieResults = movies.results.map((m) => ({ ...m, media_type: 'movie' }) as Movie);
		const tvResults = tv.results.map((t) => ({ ...t, media_type: 'tv' }) as TVShow);

		results = [...movieResults, ...tvResults];

		// Sort combined results
		if (sortBy.includes('popularity')) {
			results.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
		} else if (sortBy.includes('vote_average')) {
			results.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
		} else if (sortBy.includes('primary_release_date')) {
			results.sort((a, b) => {
				const dateA = new Date(
					(a as Movie).release_date || (a as TVShow).first_air_date || 0
				).getTime();
				const dateB = new Date(
					(b as Movie).release_date || (b as TVShow).first_air_date || 0
				).getTime();
				return sortBy.includes('desc') ? dateB - dateA : dateA - dateB;
			});
		} else {
			// Default fallback
			results.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
		}

		totalPages = Math.max(movies.total_pages, tv.total_pages);
		totalResults = movies.total_results + tv.total_results;
	}

	return {
		results,
		pagination: {
			page: parseInt(page),
			total_pages: totalPages,
			total_results: totalResults
		}
	};
}
