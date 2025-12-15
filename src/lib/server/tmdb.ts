import { db } from './db';
import { settings } from './db/schema';
import { eq } from 'drizzle-orm';
import type {
	GlobalTmdbFilters,
	MovieDetails,
	TVShowDetails,
	Season,
	Collection,
	PersonDetails,
	PersonCombinedCredits
} from '$lib/types/tmdb';
import { TMDB } from '$lib/config/constants';
import { logger } from '$lib/logging';
import { tmdbCache, getCacheKey } from './tmdb-cache';

// In-flight request deduplication - prevents concurrent requests for the same endpoint
const inFlightRequests = new Map<string, Promise<unknown>>();

export const tmdb = {
	async fetch(endpoint: string, options: RequestInit = {}, skipFilters = false) {
		// Ensure endpoint starts with /
		const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

		// Check cache first (only for GET requests which is the default)
		const isGetRequest = !options.method || options.method === 'GET';
		const cacheKey = getCacheKey(path, skipFilters);

		if (isGetRequest) {
			const cached = tmdbCache.get(cacheKey);
			if (cached) {
				return cached;
			}

			// Check if there's already an in-flight request for this endpoint
			const inFlight = inFlightRequests.get(cacheKey);
			if (inFlight) {
				logger.debug('Deduplicating in-flight TMDB request', { path });
				return inFlight;
			}
		}

		// Create the actual request as a promise
		const requestPromise = (async () => {
			try {
				const [apiKeySetting, filtersSetting] = await Promise.all([
					db.query.settings.findFirst({ where: eq(settings.key, 'tmdb_api_key') }),
					db.query.settings.findFirst({ where: eq(settings.key, 'global_filters') })
				]);

				if (!apiKeySetting) {
					throw new Error('TMDB API Key not configured');
				}

				let filters: GlobalTmdbFilters | null = null;
				if (filtersSetting) {
					try {
						filters = JSON.parse(filtersSetting.value);
					} catch (e) {
						logger.error('Failed to parse global filters', e);
					}
				}

				const url = new URL(TMDB.BASE_URL + path);

				// Add API key
				url.searchParams.set('api_key', apiKeySetting.value);

				// Apply Global Filters (Pre-request)
				if (filters) {
					if (filters.include_adult !== undefined) {
						url.searchParams.set('include_adult', String(filters.include_adult));
					}
					if (filters.language) {
						url.searchParams.set('language', filters.language);
					}
					if (filters.region) {
						url.searchParams.set('region', filters.region);
					}

					// Apply Discover-specific filters
					if (path.includes('/discover/')) {
						if (filters.min_vote_average > 0) {
							url.searchParams.set('vote_average.gte', String(filters.min_vote_average));
						}
						if (filters.min_vote_count > 0) {
							url.searchParams.set('vote_count.gte', String(filters.min_vote_count));
						}
						if (filters.excluded_genre_ids && filters.excluded_genre_ids.length > 0) {
							// TMDB uses without_genres
							url.searchParams.set('without_genres', filters.excluded_genre_ids.join(','));
						}
					}
				}

				const res = await fetch(url.toString(), options);

				if (!res.ok) {
					let errorMessage = `TMDB Error: ${res.status} ${res.statusText}`;
					try {
						const errorBody = await res.json();
						if (errorBody.status_message) {
							errorMessage = `TMDB Error: ${errorBody.status_message}`;
						}
					} catch {
						// ignore json parse error
					}
					throw new Error(errorMessage);
				}

				const data = await res.json();

				// Apply Global Filters (Post-request / Response Filtering)
				// This is crucial for Search endpoints which ignore some discover params
				// Skip filtering when skipFilters=true (used by media matcher to see all results)
				if (!skipFilters && filters && data.results && Array.isArray(data.results)) {
					interface FilterableItem {
						vote_average?: number;
						vote_count?: number;
						genre_ids?: number[];
						adult?: boolean;
					}

					data.results = data.results.filter((item: FilterableItem) => {
						// Filter by Score
						if (
							filters!.min_vote_average > 0 &&
							(item.vote_average ?? 0) < filters!.min_vote_average
						) {
							return false;
						}
						// Filter by Vote Count
						if (filters!.min_vote_count > 0 && (item.vote_count ?? 0) < filters!.min_vote_count) {
							return false;
						}
						// Filter by Excluded Genres
						if (
							filters!.excluded_genre_ids &&
							filters!.excluded_genre_ids.length > 0 &&
							item.genre_ids
						) {
							const hasExcludedGenre = item.genre_ids.some((id) =>
								filters!.excluded_genre_ids.includes(id)
							);
							if (hasExcludedGenre) {
								return false;
							}
						}
						// Filter by Adult (Double check)
						if (!filters!.include_adult && item.adult) {
							return false;
						}
						return true;
					});
				}

				// Cache successful response (after filtering)
				if (isGetRequest) {
					tmdbCache.set(cacheKey, data, path);
				}

				return data;
			} finally {
				if (isGetRequest) {
					inFlightRequests.delete(cacheKey);
				}
			}
		})();

		// Store in-flight promise for deduplication (GET requests only)
		if (isGetRequest) {
			inFlightRequests.set(cacheKey, requestPromise);
		}

		return requestPromise;
	},
	async getMovie(id: number): Promise<MovieDetails> {
		return this.fetch(
			`/movie/${id}?append_to_response=credits,videos,images,recommendations,similar,watch/providers,release_dates`
		) as Promise<MovieDetails>;
	},
	async getTVShow(id: number): Promise<TVShowDetails> {
		return this.fetch(
			`/tv/${id}?append_to_response=credits,videos,images,recommendations,similar,watch/providers,content_ratings`
		) as Promise<TVShowDetails>;
	},
	async getSeason(tvId: number, seasonNumber: number): Promise<Season> {
		return this.fetch(`/tv/${tvId}/season/${seasonNumber}`) as Promise<Season>;
	},
	async getCollection(id: number): Promise<Collection> {
		return this.fetch(`/collection/${id}`) as Promise<Collection>;
	},

	async getPerson(id: number): Promise<PersonDetails> {
		return this.fetch(
			`/person/${id}?append_to_response=combined_credits,external_ids`
		) as Promise<PersonDetails>;
	},

	/**
	 * Get person basic details without combined_credits (fast, small payload ~5KB)
	 * Use this for initial page load, then lazy-load credits separately
	 */
	async getPersonBasic(
		id: number
	): Promise<Omit<PersonDetails, 'combined_credits'> & { combined_credits?: undefined }> {
		return this.fetch(`/person/${id}?append_to_response=external_ids`) as Promise<
			Omit<PersonDetails, 'combined_credits'>
		>;
	},

	/**
	 * Get person's combined credits (filmography) - cached separately from person details
	 */
	async getPersonCredits(id: number): Promise<PersonCombinedCredits> {
		return this.fetch(`/person/${id}/combined_credits`) as Promise<PersonCombinedCredits>;
	},

	/**
	 * Get external IDs (IMDB, TVDB, etc.) for a movie
	 */
	async getMovieExternalIds(tmdbId: number): Promise<ExternalIds> {
		return this.fetch(`/movie/${tmdbId}/external_ids`) as Promise<ExternalIds>;
	},

	/**
	 * Get external IDs (IMDB, TVDB, etc.) for a TV show
	 */
	async getTvExternalIds(tmdbId: number): Promise<ExternalIds> {
		return this.fetch(`/tv/${tmdbId}/external_ids`) as Promise<ExternalIds>;
	},

	/**
	 * Find media by external ID (IMDB or TVDB)
	 */
	async findByExternalId(
		externalId: string,
		source: 'imdb_id' | 'tvdb_id'
	): Promise<FindByExternalIdResult> {
		return this.fetch(
			`/find/${externalId}?external_source=${source}`
		) as Promise<FindByExternalIdResult>;
	},

	/**
	 * Search for movies
	 * @param skipFilters - If true, bypass global filters (used by media matcher)
	 */
	async searchMovies(query: string, year?: number, skipFilters = false): Promise<SearchResult> {
		let endpoint = `/search/movie?query=${encodeURIComponent(query)}`;
		if (year) {
			endpoint += `&year=${year}`;
		}
		return this.fetch(endpoint, {}, skipFilters) as Promise<SearchResult>;
	},

	/**
	 * Search for TV shows
	 * @param skipFilters - If true, bypass global filters (used by media matcher)
	 */
	async searchTv(query: string, year?: number, skipFilters = false): Promise<SearchResult> {
		let endpoint = `/search/tv?query=${encodeURIComponent(query)}`;
		if (year) {
			endpoint += `&first_air_date_year=${year}`;
		}
		return this.fetch(endpoint, {}, skipFilters) as Promise<SearchResult>;
	},

	/**
	 * Get cache statistics for monitoring
	 */
	getCacheStats() {
		return tmdbCache.getStats();
	},

	/**
	 * Clear the TMDB response cache
	 * @param pattern - Optional pattern to match against cache keys
	 */
	clearCache(pattern?: string) {
		return tmdbCache.invalidate(pattern);
	}
};

/**
 * External IDs returned by TMDB
 */
export interface ExternalIds {
	imdb_id: string | null;
	tvdb_id: number | null;
	wikidata_id: string | null;
	facebook_id: string | null;
	instagram_id: string | null;
	twitter_id: string | null;
}

/**
 * Result from find by external ID
 */
export interface FindByExternalIdResult {
	movie_results: Array<{
		id: number;
		title: string;
		original_title: string;
		release_date: string;
		poster_path: string | null;
		overview: string;
		vote_average: number;
	}>;
	tv_results: Array<{
		id: number;
		name: string;
		original_name: string;
		first_air_date: string;
		poster_path: string | null;
		overview: string;
		vote_average: number;
	}>;
	person_results: Array<{
		id: number;
		name: string;
	}>;
}

/**
 * Search result from TMDB
 */
export interface SearchResult {
	page: number;
	total_pages: number;
	total_results: number;
	results: Array<{
		id: number;
		title?: string;
		name?: string;
		original_title?: string;
		original_name?: string;
		release_date?: string;
		first_air_date?: string;
		poster_path: string | null;
		overview: string;
		vote_average: number;
		media_type?: 'movie' | 'tv';
	}>;
}
