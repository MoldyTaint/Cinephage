import { tmdb } from '$lib/server/tmdb';
import { getDiscoverResults } from '$lib/server/discover';
import { contentFilterPipeline } from '$lib/server/filters/ContentFilterPipeline.js';
import type { WatchProvider } from '$lib/types/tmdb';
import type { TmdbCertificationsResponse } from '$lib/server/tmdb';
import { logger } from '$lib/logging';
import {
	parseDiscoverParams,
	isDefaultView as checkDefaultView,
	hasActiveDiscoverFilters
} from '$lib/utils/discoverParams';
import { TMDB } from '$lib/config/constants.js';
import { enrichWithReleaseDates } from '$lib/server/release-enrichment.js';
import { db } from '$lib/server/db';
import { settings } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const params = parseDiscoverParams(url.searchParams);
	const {
		type,
		page,
		sortBy,
		trending,
		topRated,
		withWatchProviders,
		watchRegion,
		withGenres,
		withOriginalLanguage: urlOriginalLanguage,
		minDate,
		maxDate,
		minRating,
		certification,
		excludeInLibrary
	} = params;
	const { nowPlaying } = params;

	// Resolve effective original language — URL param takes precedence,
	// falling back to the user's global TMDB language filter.
	let withOriginalLanguage = urlOriginalLanguage;
	if (!withOriginalLanguage) {
		const filtersRow = await db.query.settings.findFirst({
			where: eq(settings.key, 'global_filters')
		});
		if (filtersRow?.value) {
			const globalFilters = JSON.parse(filtersRow.value);
			if (globalFilters?.language && typeof globalFilters.language === 'string') {
				withOriginalLanguage = globalFilters.language.toLowerCase().split('-')[0] || null;
			}
		}
	}

	const { withKeywords } = params;
	const { withoutKeywords } = params;

	const isDefaultViewCheck = checkDefaultView(url.searchParams, params);

	// Check if TMDB is configured before making any API calls
	const tmdbConfigured = await tmdb.isConfigured();
	if (!tmdbConfigured) {
		return {
			viewType: 'not_configured' as const,
			tmdbConfigured: false,
			providers: [],
			genres: [],
			certifications: [],
			languages: [],
			filters: {
				type,
				sort_by: sortBy,
				trending,
				top_rated: topRated,
				with_watch_providers: withWatchProviders,
				with_genres: withGenres,
				with_keywords: withKeywords,
				without_keywords: withoutKeywords,
				with_original_language: withOriginalLanguage,
				certification,
				exclude_in_library: excludeInLibrary
			}
		};
	}

	try {
		const systemRegion = await tmdb.getRegion();
		const [providersData, movieGenresData, tvGenresData, movieCertifications, languagesData] =
			await Promise.all([
				tmdb.getWatchProviders('movie', watchRegion || systemRegion) as Promise<{
					results: WatchProvider[];
				} | null>,
				tmdb.fetch('/genre/movie/list') as Promise<{
					genres: { id: number; name: string }[];
				} | null>,
				tmdb.fetch('/genre/tv/list') as Promise<{ genres: { id: number; name: string }[] } | null>,
				tmdb.getCertifications('movie') as Promise<TmdbCertificationsResponse>,
				tmdb.getLanguages().catch(() => [] as { iso_639_1: string; english_name: string }[])
			]);

		const languages = languagesData
			? languagesData
					.map((l) => ({
						code: l.iso_639_1,
						name: l.english_name
					}))
					.filter((l) => l.code)
					.sort((a, b) => a.name.localeCompare(b.name))
			: [];

		// Handle null responses (shouldn't happen since we checked tmdbConfigured, but be safe)
		if (!providersData || !movieGenresData || !tvGenresData) {
			return {
				viewType: 'not_configured' as const,
				tmdbConfigured: false,
				providers: [],
				genres: [],
				certifications: [],
				languages: [],
				filters: {
					type,
					sort_by: sortBy,
					trending,
					top_rated: topRated,
					with_watch_providers: withWatchProviders,
					with_genres: withGenres,
					with_original_language: withOriginalLanguage,
					certification,
					exclude_in_library: excludeInLibrary
				}
			};
		}

		const providers = providersData.results.sort((a, b) => a.display_priority - b.display_priority);

		// Combine genres, deduplicate by ID
		const allGenres = new Map<number, { id: number; name: string }>();
		movieGenresData.genres.forEach((g) => allGenres.set(g.id, g));
		tvGenresData.genres.forEach((g) => allGenres.set(g.id, g));
		const genres = Array.from(allGenres.values()).sort((a, b) => a.name.localeCompare(b.name));

		const usCertifications = (
			movieCertifications.certifications[watchRegion || systemRegion] ??
			movieCertifications.certifications[TMDB.DEFAULT_REGION] ??
			[]
		).map((c) => ({
			certification: c.certification,
			meaning: c.meaning,
			order: c.order
		}));

		// Type for paginated TMDB results
		interface TmdbPaginatedResult {
			results: Array<{ id: number } & Record<string, unknown>>;
			page: number;
			total_pages: number;
			total_results: number;
		}

		const trendingHasActiveFilters = hasActiveDiscoverFilters({
			type,
			sortBy,
			withWatchProviders,
			withGenres,
			withKeywords,
			withoutKeywords,
			withOriginalLanguage: urlOriginalLanguage,
			minDate,
			maxDate,
			minRating,
			certification
		});

		if ((trending === 'day' || trending === 'week') && !trendingHasActiveFilters) {
			const trendingResults = (await tmdb.fetch(
				`/trending/all/${trending}?page=${page}`
			)) as TmdbPaginatedResult;

			const { results: filteredResults } = await contentFilterPipeline.apply(
				trendingResults.results,
				{ mediaType: 'all', excludeInLibrary }
			);
			const enrichedResults = await enrichWithReleaseDates(filteredResults, systemRegion);

			return {
				viewType: 'grid',
				tmdbConfigured: true,
				results: enrichedResults,
				pagination: {
					page: trendingResults.page,
					total_pages: trendingResults.total_pages,
					total_results: trendingResults.total_results
				},
				providers,
				genres,
				certifications: usCertifications,
				languages,
				filters: {
					type,
					sort_by: sortBy,
					trending,
					with_watch_providers: withWatchProviders,
					with_genres: withGenres,
					with_original_language: withOriginalLanguage,
					certification,
					exclude_in_library: excludeInLibrary
				}
			};
		}

		if (topRated === 'true' && !certification) {
			let endpoint: string;
			if (type === 'movie') {
				endpoint = `/movie/top_rated?page=${page}`;
			} else if (type === 'tv') {
				endpoint = `/tv/top_rated?page=${page}`;
			} else {
				// For 'all', fetch both and combine
				const [moviesData, tvData] = (await Promise.all([
					tmdb.fetch(`/movie/top_rated?page=${page}`),
					tmdb.fetch(`/tv/top_rated?page=${page}`)
				])) as TmdbPaginatedResult[];

				interface VoteRatedItem {
					id: number;
					vote_average?: number;
					media_type?: string;
				}
				const movieResults = moviesData.results.map(
					(m) => ({ ...m, media_type: 'movie' }) as VoteRatedItem
				);
				const tvResults = tvData.results.map((t) => ({ ...t, media_type: 'tv' }) as VoteRatedItem);
				const combinedResults = [...movieResults, ...tvResults].sort(
					(a, b) => (b.vote_average || 0) - (a.vote_average || 0)
				);

				const { results: filteredResults } = await contentFilterPipeline.apply(combinedResults, {
					mediaType: 'all',
					excludeInLibrary
				});
				const enrichedResults = await enrichWithReleaseDates(filteredResults, systemRegion);

				return {
					viewType: 'grid',
					tmdbConfigured: true,
					results: enrichedResults,
					pagination: {
						page: 1,
						total_pages: Math.max(moviesData.total_pages, tvData.total_pages),
						total_results: moviesData.total_results + tvData.total_results
					},
					providers,
					genres,
					certifications: usCertifications,
					languages,
					filters: {
						type,
						sort_by: sortBy,
						trending,
						with_watch_providers: withWatchProviders,
						with_genres: withGenres,
						with_original_language: withOriginalLanguage,
						certification,
						exclude_in_library: excludeInLibrary
					}
				};
			}

			const topRatedResults = (await tmdb.fetch(endpoint)) as TmdbPaginatedResult;
			const mediaTypeFilter = type === 'movie' ? 'movie' : 'tv';
			const { results: filteredResults } = await contentFilterPipeline.apply(
				topRatedResults.results,
				{ mediaType: mediaTypeFilter, excludeInLibrary }
			);
			const enrichedResults = await enrichWithReleaseDates(filteredResults, systemRegion);

			return {
				viewType: 'grid',
				tmdbConfigured: true,
				results: enrichedResults,
				pagination: {
					page: topRatedResults.page,
					total_pages: topRatedResults.total_pages,
					total_results: topRatedResults.total_results
				},
				providers,
				genres,
				certifications: usCertifications,
				languages,
				filters: {
					type,
					sort_by: sortBy,
					trending,
					with_watch_providers: withWatchProviders,
					with_genres: withGenres,
					with_original_language: withOriginalLanguage,
					certification,
					exclude_in_library: excludeInLibrary
				}
			};
		}

		if (nowPlaying === 'true' && !hasActiveDiscoverFilters(params)) {
			const nowPlayingResults = (await tmdb.getNowPlaying(
				Number(page) || 1
			)) as unknown as TmdbPaginatedResult;
			const { results: filteredResults } = await contentFilterPipeline.apply(
				nowPlayingResults.results,
				{ mediaType: 'movie', excludeInLibrary }
			);
			const enrichedResults = await enrichWithReleaseDates(filteredResults, systemRegion);

			return {
				viewType: 'grid',
				tmdbConfigured: true,
				results: enrichedResults,
				pagination: {
					page: nowPlayingResults.page,
					total_pages: nowPlayingResults.total_pages,
					total_results: nowPlayingResults.total_results
				},
				providers,
				genres,
				certifications: usCertifications,
				languages,
				filters: {
					type,
					sort_by: sortBy,
					trending,
					with_watch_providers: withWatchProviders,
					with_genres: withGenres,
					with_original_language: withOriginalLanguage,
					certification,
					exclude_in_library: excludeInLibrary
				}
			};
		}

		if (isDefaultViewCheck && page === '1') {
			// Fetch sections for the dashboard-style view.
			// Popular/top-rated use /discover/ endpoints so the keyword blocklist
			// injection in tmdb.fetch() fires. Trending and now-playing don't
			// support without_keywords so they remain as dedicated endpoints.
			const [trendingWeek, popularMovies, popularTV, topRatedMovies, topRatedTV, nowPlayingData] =
				(await Promise.all([
					tmdb.fetch('/trending/all/week'),
					tmdb.fetch('/discover/movie?sort_by=popularity.desc'),
					tmdb.fetch('/discover/tv?sort_by=popularity.desc'),
					tmdb.fetch('/discover/movie?sort_by=vote_average.desc&vote_count.gte=300'),
					tmdb.fetch('/discover/tv?sort_by=vote_average.desc&vote_count.gte=300'),
					tmdb.getNowPlaying()
				])) as TmdbPaginatedResult[];

			// Discover endpoints don't tag media_type — add it so downstream
			// code (library status, filters) can identify the media type.
			popularMovies.results = popularMovies.results.map((r) => ({ ...r, media_type: 'movie' }));
			popularTV.results = popularTV.results.map((r) => ({ ...r, media_type: 'tv' }));
			topRatedMovies.results = topRatedMovies.results.map((r) => ({ ...r, media_type: 'movie' }));
			topRatedTV.results = topRatedTV.results.map((r) => ({ ...r, media_type: 'tv' }));

			// Enrich all sections with library status and filter blocked media
			const [
				filteredTrendingWeek,
				filteredPopularMovies,
				filteredPopularTV,
				filteredTopRatedMovies,
				filteredTopRatedTV,
				filteredNowPlaying
			] = await Promise.all([
				contentFilterPipeline.apply(trendingWeek.results, { mediaType: 'all', excludeInLibrary }),
				contentFilterPipeline.apply(popularMovies.results, {
					mediaType: 'movie',
					excludeInLibrary
				}),
				contentFilterPipeline.apply(popularTV.results, { mediaType: 'tv', excludeInLibrary }),
				contentFilterPipeline.apply(topRatedMovies.results, {
					mediaType: 'movie',
					excludeInLibrary
				}),
				contentFilterPipeline.apply(topRatedTV.results, { mediaType: 'tv', excludeInLibrary }),
				contentFilterPipeline.apply(nowPlayingData.results, {
					mediaType: 'movie',
					excludeInLibrary
				})
			]);

			const [enrichedTrending, enrichedPopularMovies, enrichedTopRatedMovies, enrichedNowPlaying] =
				await Promise.all([
					enrichWithReleaseDates(filteredTrendingWeek.results, systemRegion),
					enrichWithReleaseDates(filteredPopularMovies.results, systemRegion),
					enrichWithReleaseDates(filteredTopRatedMovies.results, systemRegion),
					enrichWithReleaseDates(filteredNowPlaying.results, systemRegion)
				]);

			return {
				viewType: 'dashboard',
				tmdbConfigured: true,
				sections: {
					trendingWeek: enrichedTrending,
					popularMovies: enrichedPopularMovies,
					popularTV: filteredPopularTV.results,
					topRatedMovies: enrichedTopRatedMovies,
					topRatedTV: filteredTopRatedTV.results,
					nowPlaying: enrichedNowPlaying
				},
				providers,
				genres,
				certifications: usCertifications,
				languages,
				filters: {
					type,
					sort_by: sortBy,
					trending,
					with_watch_providers: withWatchProviders,
					with_genres: withGenres,
					with_original_language: withOriginalLanguage,
					certification,
					exclude_in_library: excludeInLibrary
				}
			};
		} else {
			// Use shared logic
			const { results, pagination } = await getDiscoverResults({
				type,
				page,
				sortBy,
				trending,
				withWatchProviders,
				watchRegion,
				withGenres,
				withKeywords,
				withoutKeywords,
				withOriginalLanguage,
				minDate,
				maxDate,
				minRating,
				certification
			});

			// Enrich results with library status and filter blocked media
			const mediaTypeFilter = type === 'movie' ? 'movie' : type === 'tv' ? 'tv' : 'all';
			const { results: filteredResults } = await contentFilterPipeline.apply(results, {
				mediaType: mediaTypeFilter,
				excludeInLibrary
			});
			const enrichedResults = await enrichWithReleaseDates(filteredResults, systemRegion);

			return {
				viewType: 'grid',
				tmdbConfigured: true,
				results: enrichedResults,
				pagination,
				providers,
				genres,
				certifications: usCertifications,
				languages,
				filters: {
					type,
					sort_by: sortBy,
					trending,
					with_watch_providers: withWatchProviders,
					with_genres: withGenres,
					with_original_language: withOriginalLanguage,
					certification,
					exclude_in_library: excludeInLibrary
				}
			};
		}
	} catch (e) {
		logger.error({ err: e, ...{ type, sortBy } }, 'Discover load error');
		return {
			viewType: 'error',
			tmdbConfigured: true,
			error: 'Failed to load content',
			providers: [],
			genres: [],
			certifications: [],
			languages: [],
			filters: {
				type,
				sort_by: sortBy,
				trending,
				top_rated: topRated,
				with_watch_providers: withWatchProviders,
				with_genres: withGenres,
				with_keywords: withKeywords,
				without_keywords: withoutKeywords,
				with_original_language: withOriginalLanguage,
				certification,
				exclude_in_library: excludeInLibrary
			}
		};
	}
};
