import { db } from '$lib/server/db';
import { movies, series, episodes } from '$lib/server/db/schema';
import { eq, inArray } from 'drizzle-orm';

interface MovieInfo {
	id: string;
	title: string;
	year: number | null;
}

interface SeriesInfo {
	id: string;
	title: string;
	year: number | null;
}

interface EpisodeInfo {
	id: string;
	seriesId: string;
	seasonNumber: number;
	episodeNumber: number;
}

interface ResolvedMediaInfo {
	mediaType: 'movie' | 'episode';
	mediaId: string;
	mediaTitle: string;
	mediaYear: number | null;
	seriesId?: string;
	seriesTitle?: string;
	seasonNumber?: number;
	episodeNumber?: number;
}

/**
 * Service for resolving media information consistently
 * Provides batch fetching and caching for media lookups
 */
export class MediaResolverService {
	private static instance: MediaResolverService;
	private movieCache: Map<string, MovieInfo> = new Map();
	private seriesCache: Map<string, SeriesInfo> = new Map();
	private episodeCache: Map<string, EpisodeInfo> = new Map();

	private constructor() {}

	static getInstance(): MediaResolverService {
		if (!MediaResolverService.instance) {
			MediaResolverService.instance = new MediaResolverService();
		}
		return MediaResolverService.instance;
	}

	/**
	 * Resolve a single movie by ID
	 */
	async resolveMovie(movieId: string): Promise<MovieInfo | null> {
		// Check cache first
		if (this.movieCache.has(movieId)) {
			return this.movieCache.get(movieId)!;
		}

		const movie = await db
			.select({ id: movies.id, title: movies.title, year: movies.year })
			.from(movies)
			.where(eq(movies.id, movieId))
			.get();

		if (movie) {
			this.movieCache.set(movieId, movie);
		}

		return movie || null;
	}

	/**
	 * Resolve a single series by ID
	 */
	async resolveSeries(seriesId: string): Promise<SeriesInfo | null> {
		if (this.seriesCache.has(seriesId)) {
			return this.seriesCache.get(seriesId)!;
		}

		const s = await db
			.select({ id: series.id, title: series.title, year: series.year })
			.from(series)
			.where(eq(series.id, seriesId))
			.get();

		if (s) {
			this.seriesCache.set(seriesId, s);
		}

		return s || null;
	}

	/**
	 * Resolve a single episode by ID
	 */
	async resolveEpisode(episodeId: string): Promise<EpisodeInfo | null> {
		if (this.episodeCache.has(episodeId)) {
			return this.episodeCache.get(episodeId)!;
		}

		const ep = await db
			.select({
				id: episodes.id,
				seriesId: episodes.seriesId,
				seasonNumber: episodes.seasonNumber,
				episodeNumber: episodes.episodeNumber
			})
			.from(episodes)
			.where(eq(episodes.id, episodeId))
			.get();

		if (ep) {
			this.episodeCache.set(episodeId, ep);
		}

		return ep || null;
	}

	/**
	 * Batch resolve multiple movies
	 */
	async resolveMovies(movieIds: string[]): Promise<Map<string, MovieInfo>> {
		const uncachedIds = movieIds.filter((id) => !this.movieCache.has(id));

		if (uncachedIds.length > 0) {
			const moviesData = await db
				.select({ id: movies.id, title: movies.title, year: movies.year })
				.from(movies)
				.where(inArray(movies.id, uncachedIds))
				.all();

			for (const movie of moviesData) {
				this.movieCache.set(movie.id, movie);
			}
		}

		const result = new Map<string, MovieInfo>();
		for (const id of movieIds) {
			const movie = this.movieCache.get(id);
			if (movie) {
				result.set(id, movie);
			}
		}
		return result;
	}

	/**
	 * Batch resolve multiple series
	 */
	async resolveSeriesBatch(seriesIds: string[]): Promise<Map<string, SeriesInfo>> {
		const uncachedIds = seriesIds.filter((id) => !this.seriesCache.has(id));

		if (uncachedIds.length > 0) {
			const seriesData = await db
				.select({ id: series.id, title: series.title, year: series.year })
				.from(series)
				.where(inArray(series.id, uncachedIds))
				.all();

			for (const s of seriesData) {
				this.seriesCache.set(s.id, s);
			}
		}

		const result = new Map<string, SeriesInfo>();
		for (const id of seriesIds) {
			const s = this.seriesCache.get(id);
			if (s) {
				result.set(id, s);
			}
		}
		return result;
	}

	/**
	 * Batch resolve multiple episodes
	 */
	async resolveEpisodes(episodeIds: string[]): Promise<Map<string, EpisodeInfo>> {
		const uncachedIds = episodeIds.filter((id) => !this.episodeCache.has(id));

		if (uncachedIds.length > 0) {
			const episodesData = await db
				.select({
					id: episodes.id,
					seriesId: episodes.seriesId,
					seasonNumber: episodes.seasonNumber,
					episodeNumber: episodes.episodeNumber
				})
				.from(episodes)
				.where(inArray(episodes.id, uncachedIds))
				.all();

			for (const ep of episodesData) {
				this.episodeCache.set(ep.id, ep);
			}
		}

		const result = new Map<string, EpisodeInfo>();
		for (const id of episodeIds) {
			const ep = this.episodeCache.get(id);
			if (ep) {
				result.set(id, ep);
			}
		}
		return result;
	}

	/**
	 * Format episode title with series info
	 */
	formatEpisodeTitle(
		seriesTitle: string,
		seasonNumber: number | undefined,
		episodeNumber: number | undefined,
		endEpisodeNumber?: number
	): string {
		if (seasonNumber === undefined || episodeNumber === undefined) {
			return seriesTitle;
		}

		const seasonStr = String(seasonNumber).padStart(2, '0');
		const startEpStr = String(episodeNumber).padStart(2, '0');

		if (endEpisodeNumber && endEpisodeNumber !== episodeNumber) {
			const endEpStr = String(endEpisodeNumber).padStart(2, '0');
			return `${seriesTitle} S${seasonStr}E${startEpStr}-E${endEpStr}`;
		}

		return `${seriesTitle} S${seasonStr}E${startEpStr}`;
	}

	/**
	 * Resolve complete media info for a download item
	 */
	async resolveDownloadMediaInfo(options: {
		movieId?: string | null;
		seriesId?: string | null;
		episodeIds?: string[] | null;
		seasonNumber?: number | null;
	}): Promise<ResolvedMediaInfo> {
		const { movieId, seriesId, episodeIds, seasonNumber } = options;

		// Try movie first
		if (movieId) {
			const movie = await this.resolveMovie(movieId);
			if (movie) {
				return {
					mediaType: 'movie',
					mediaId: movie.id,
					mediaTitle: movie.title,
					mediaYear: movie.year
				};
			}
		}

		// Try series/episode
		if (seriesId) {
			const s = await this.resolveSeries(seriesId);
			if (s) {
				const seasonNum = seasonNumber ?? undefined;

				if (episodeIds && episodeIds.length > 0) {
					const firstEp = await this.resolveEpisode(episodeIds[0]);
					if (firstEp) {
						let endEpisodeNumber: number | undefined;
						if (episodeIds.length > 1) {
							const lastEp = await this.resolveEpisode(episodeIds[episodeIds.length - 1]);
							endEpisodeNumber = lastEp?.episodeNumber;
						}

						return {
							mediaType: 'episode',
							mediaId: firstEp.id,
							mediaTitle: this.formatEpisodeTitle(
								s.title,
								seasonNum,
								firstEp.episodeNumber,
								endEpisodeNumber
							),
							mediaYear: s.year,
							seriesId,
							seriesTitle: s.title,
							seasonNumber: seasonNum,
							episodeNumber: firstEp.episodeNumber
						};
					}
				}

				return {
					mediaType: 'episode',
					mediaId: s.id,
					mediaTitle: seasonNum ? `${s.title} Season ${seasonNum}` : s.title,
					mediaYear: s.year,
					seriesId,
					seriesTitle: s.title,
					seasonNumber: seasonNum
				};
			}
		}

		// Unknown
		return {
			mediaType: 'movie',
			mediaId: movieId || '',
			mediaTitle: 'Unknown',
			mediaYear: null
		};
	}

	/**
	 * Clear all caches (useful for testing or memory management)
	 */
	clearCaches(): void {
		this.movieCache.clear();
		this.seriesCache.clear();
		this.episodeCache.clear();
	}
}

// Export singleton instance
export const mediaResolver = MediaResolverService.getInstance();
