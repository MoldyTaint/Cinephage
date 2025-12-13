/**
 * Media Matcher Service
 *
 * Matches unmatched files to TMDB entries using parsed filename info.
 * Auto-matches high-confidence results and flags low-confidence for manual review.
 */

import { db } from '$lib/server/db/index.js';
import {
	unmatchedFiles,
	movies,
	movieFiles,
	series,
	seasons,
	episodes,
	episodeFiles,
	librarySettings,
	rootFolders
} from '$lib/server/db/schema.js';
import { eq, and } from 'drizzle-orm';
import { tmdb, type SearchResult } from '$lib/server/tmdb.js';
import { mediaInfoService } from './media-info.js';
import { basename, dirname, extname } from 'path';
import { getSubtitleSettingsService } from '$lib/server/subtitles/services/SubtitleSettingsService.js';
import { searchSubtitlesForNewMedia } from '$lib/server/subtitles/services/SubtitleImportService.js';
import { monitoringScheduler } from '$lib/server/monitoring/MonitoringScheduler.js';
import { logger } from '$lib/logging/index.js';
import { parseRelease, extractExternalIds } from '$lib/server/indexers/parser/ReleaseParser.js';

/**
 * Default match confidence threshold (0.0 - 1.0)
 * Matches above this are auto-accepted
 */
const DEFAULT_MATCH_THRESHOLD = 0.8;

/**
 * Match result for a single file
 */
export interface MatchResult {
	fileId: string;
	filePath: string;
	matched: boolean;
	tmdbId?: number;
	title?: string;
	confidence: number;
	reason?: string;
}

/**
 * Suggested match from TMDB search
 */
interface SuggestedMatch {
	tmdbId: number;
	title: string;
	year?: number;
	confidence: number;
}

/**
 * MediaMatcherService - Match files to TMDB entries
 */
export class MediaMatcherService {
	private static instance: MediaMatcherService;

	private constructor() {}

	static getInstance(): MediaMatcherService {
		if (!MediaMatcherService.instance) {
			MediaMatcherService.instance = new MediaMatcherService();
		}
		return MediaMatcherService.instance;
	}

	/**
	 * Get the configured match threshold
	 */
	private async getMatchThreshold(): Promise<number> {
		const setting = await db
			.select()
			.from(librarySettings)
			.where(eq(librarySettings.key, 'auto_match_threshold'))
			.limit(1);

		if (setting.length > 0) {
			const value = parseFloat(setting[0].value);
			if (!isNaN(value) && value >= 0 && value <= 1) {
				return value;
			}
		}

		return DEFAULT_MATCH_THRESHOLD;
	}

	/**
	 * Calculate string similarity using Levenshtein distance
	 */
	private calculateSimilarity(str1: string, str2: string): number {
		const s1 = str1.toLowerCase().trim();
		const s2 = str2.toLowerCase().trim();

		if (s1 === s2) return 1;
		if (s1.length === 0 || s2.length === 0) return 0;

		// Create matrix
		const matrix: number[][] = [];
		for (let i = 0; i <= s1.length; i++) {
			matrix[i] = [i];
		}
		for (let j = 0; j <= s2.length; j++) {
			matrix[0][j] = j;
		}

		// Fill matrix
		for (let i = 1; i <= s1.length; i++) {
			for (let j = 1; j <= s2.length; j++) {
				const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
				matrix[i][j] = Math.min(
					matrix[i - 1][j] + 1, // deletion
					matrix[i][j - 1] + 1, // insertion
					matrix[i - 1][j - 1] + cost // substitution
				);
			}
		}

		const distance = matrix[s1.length][s2.length];
		const maxLength = Math.max(s1.length, s2.length);
		return 1 - distance / maxLength;
	}

	/**
	 * Calculate match confidence between parsed info and TMDB result
	 */
	private calculateMatchConfidence(
		parsedTitle: string,
		parsedYear: number | undefined,
		tmdbTitle: string,
		tmdbYear: number | undefined
	): number {
		// Base score from title similarity
		let titleScore = this.calculateSimilarity(parsedTitle, tmdbTitle);

		// Boost if year matches exactly
		if (parsedYear && tmdbYear && parsedYear === tmdbYear) {
			titleScore = Math.min(1, titleScore + 0.2);
		}
		// Penalize if years are different (but both present)
		else if (parsedYear && tmdbYear && parsedYear !== tmdbYear) {
			// Allow 1 year difference (common for late releases)
			if (Math.abs(parsedYear - tmdbYear) > 1) {
				titleScore = titleScore * 0.7;
			}
		}

		// Check for common title variations
		const normalizedParsed = this.normalizeTitle(parsedTitle);
		const normalizedTmdb = this.normalizeTitle(tmdbTitle);
		if (normalizedParsed === normalizedTmdb) {
			titleScore = Math.max(titleScore, 0.95);
		}

		return Math.round(titleScore * 100) / 100;
	}

	/**
	 * Normalize title for comparison
	 */
	private normalizeTitle(title: string): string {
		return title
			.toLowerCase()
			.replace(/[^a-z0-9]/g, '') // Remove non-alphanumeric
			.replace(/^the/, '') // Remove leading "the"
			.replace(/^a/, ''); // Remove leading "a"
	}

	/**
	 * Search TMDB and find best matches for a file
	 *
	 * Matching priority:
	 * 1. TMDB ID embedded in path (100% confidence)
	 * 2. TVDB ID embedded in path → cross-reference via TMDB (100% confidence)
	 * 3. IMDB ID embedded in path → cross-reference via TMDB (100% confidence)
	 * 4. Title search with fuzzy matching (variable confidence)
	 */
	private async findMatches(
		title: string,
		year: number | undefined,
		mediaType: 'movie' | 'tv',
		filePath: string
	): Promise<SuggestedMatch[]> {
		try {
			// Extract external IDs from folder/file path
			const extractedIds = extractExternalIds(filePath);

			// Priority 1: Direct TMDB ID lookup (highest confidence)
			if (extractedIds.tmdbId) {
				const match = await this.lookupByTmdbId(extractedIds.tmdbId, mediaType);
				if (match) {
					logger.info('[MediaMatcher] Matched via TMDB ID in path', {
						tmdbId: extractedIds.tmdbId,
						title: match.title,
						filePath
					});
					return [match];
				}
			}

			// Priority 2: TVDB ID → TMDB cross-reference
			if (extractedIds.tvdbId) {
				const match = await this.lookupByTvdbId(extractedIds.tvdbId);
				if (match) {
					logger.info('[MediaMatcher] Matched via TVDB ID in path', {
						tvdbId: extractedIds.tvdbId,
						tmdbId: match.tmdbId,
						title: match.title,
						filePath
					});
					return [match];
				}
			}

			// Priority 3: IMDB ID → TMDB cross-reference
			if (extractedIds.imdbId) {
				const match = await this.lookupByImdbId(extractedIds.imdbId, mediaType);
				if (match) {
					logger.info('[MediaMatcher] Matched via IMDB ID in path', {
						imdbId: extractedIds.imdbId,
						tmdbId: match.tmdbId,
						title: match.title,
						filePath
					});
					return [match];
				}
			}

			// Priority 4: Fall back to title search
			let results: SearchResult;

			// Use skipFilters=true to bypass global filters (min rating, vote count)
			// so that all TMDB results are visible for matching
			if (mediaType === 'movie') {
				results = await tmdb.searchMovies(title, year, true);
			} else {
				results = await tmdb.searchTv(title, year, true);
			}

			if (!results.results || results.results.length === 0) {
				return [];
			}

			// Calculate confidence for each result
			const matches: SuggestedMatch[] = results.results.slice(0, 5).map((result) => {
				const resultTitle = result.title || result.name || '';
				const resultDate = result.release_date || result.first_air_date;
				const resultYear = resultDate ? parseInt(resultDate.split('-')[0]) : undefined;

				return {
					tmdbId: result.id,
					title: resultTitle,
					year: resultYear,
					confidence: this.calculateMatchConfidence(title, year, resultTitle, resultYear)
				};
			});

			// Sort by confidence descending
			matches.sort((a, b) => b.confidence - a.confidence);

			return matches;
		} catch (error) {
			logger.error(
				'[MediaMatcher] TMDB search failed',
				error instanceof Error ? error : undefined,
				{ title }
			);
			return [];
		}
	}

	/**
	 * Lookup by direct TMDB ID
	 */
	private async lookupByTmdbId(
		tmdbId: number,
		mediaType: 'movie' | 'tv'
	): Promise<SuggestedMatch | null> {
		try {
			if (mediaType === 'movie') {
				const movie = await tmdb.getMovie(tmdbId);
				return {
					tmdbId: movie.id,
					title: movie.title,
					year: movie.release_date ? parseInt(movie.release_date.split('-')[0]) : undefined,
					confidence: 1.0
				};
			} else {
				const show = await tmdb.getTVShow(tmdbId);
				return {
					tmdbId: show.id,
					title: show.name,
					year: show.first_air_date ? parseInt(show.first_air_date.split('-')[0]) : undefined,
					confidence: 1.0
				};
			}
		} catch (error) {
			logger.warn('[MediaMatcher] TMDB ID lookup failed', {
				tmdbId,
				mediaType,
				error: error instanceof Error ? error.message : String(error)
			});
			return null;
		}
	}

	/**
	 * Lookup by TVDB ID using TMDB's cross-reference API
	 */
	private async lookupByTvdbId(tvdbId: number): Promise<SuggestedMatch | null> {
		try {
			const result = await tmdb.findByExternalId(String(tvdbId), 'tvdb_id');

			// TVDB IDs are primarily for TV shows
			if (result.tv_results.length > 0) {
				const show = result.tv_results[0];
				return {
					tmdbId: show.id,
					title: show.name,
					year: show.first_air_date ? parseInt(show.first_air_date.split('-')[0]) : undefined,
					confidence: 1.0
				};
			}

			return null;
		} catch (error) {
			logger.warn('[MediaMatcher] TVDB ID lookup failed', {
				tvdbId,
				error: error instanceof Error ? error.message : String(error)
			});
			return null;
		}
	}

	/**
	 * Lookup by IMDB ID using TMDB's cross-reference API
	 */
	private async lookupByImdbId(
		imdbId: string,
		mediaType: 'movie' | 'tv'
	): Promise<SuggestedMatch | null> {
		try {
			const result = await tmdb.findByExternalId(imdbId, 'imdb_id');

			// Prefer the expected media type, but accept either
			if (mediaType === 'movie' && result.movie_results.length > 0) {
				const movie = result.movie_results[0];
				return {
					tmdbId: movie.id,
					title: movie.title,
					year: movie.release_date ? parseInt(movie.release_date.split('-')[0]) : undefined,
					confidence: 1.0
				};
			}

			if (mediaType === 'tv' && result.tv_results.length > 0) {
				const show = result.tv_results[0];
				return {
					tmdbId: show.id,
					title: show.name,
					year: show.first_air_date ? parseInt(show.first_air_date.split('-')[0]) : undefined,
					confidence: 1.0
				};
			}

			// Fall back to any result type
			if (result.movie_results.length > 0) {
				const movie = result.movie_results[0];
				return {
					tmdbId: movie.id,
					title: movie.title,
					year: movie.release_date ? parseInt(movie.release_date.split('-')[0]) : undefined,
					confidence: 1.0
				};
			}

			if (result.tv_results.length > 0) {
				const show = result.tv_results[0];
				return {
					tmdbId: show.id,
					title: show.name,
					year: show.first_air_date ? parseInt(show.first_air_date.split('-')[0]) : undefined,
					confidence: 1.0
				};
			}

			return null;
		} catch (error) {
			logger.warn('[MediaMatcher] IMDB ID lookup failed', {
				imdbId,
				error: error instanceof Error ? error.message : String(error)
			});
			return null;
		}
	}

	/**
	 * Process an unmatched file and try to match it
	 */
	async processUnmatchedFile(fileId: string): Promise<MatchResult> {
		const [file] = await db.select().from(unmatchedFiles).where(eq(unmatchedFiles.id, fileId));

		if (!file) {
			return {
				fileId,
				filePath: '',
				matched: false,
				confidence: 0,
				reason: 'File not found'
			};
		}

		const threshold = await this.getMatchThreshold();

		// Re-parse the filename to get the correct clean title
		// This ensures we use the updated parser logic even for existing records
		const filename = basename(file.path, extname(file.path));
		const parsed = parseRelease(filename);
		const searchTitle = parsed.cleanTitle || file.parsedTitle || filename;
		const searchYear = parsed.year || file.parsedYear || undefined;

		// Find matches (checks for embedded IDs first, then falls back to title search)
		const matches = await this.findMatches(
			searchTitle,
			searchYear,
			file.mediaType as 'movie' | 'tv',
			file.path
		);

		if (matches.length === 0) {
			// Update file with no match reason
			await db
				.update(unmatchedFiles)
				.set({
					reason: 'no_match',
					suggestedMatches: []
				})
				.where(eq(unmatchedFiles.id, fileId));

			return {
				fileId,
				filePath: file.path,
				matched: false,
				confidence: 0,
				reason: 'No matches found in TMDB'
			};
		}

		const bestMatch = matches[0];

		// Store all suggested matches
		await db
			.update(unmatchedFiles)
			.set({
				suggestedMatches: matches.slice(0, 5)
			})
			.where(eq(unmatchedFiles.id, fileId));

		// Check if best match exceeds threshold
		if (bestMatch.confidence >= threshold) {
			// Auto-match
			await this.acceptMatch(fileId, bestMatch.tmdbId, file.mediaType as 'movie' | 'tv');

			return {
				fileId,
				filePath: file.path,
				matched: true,
				tmdbId: bestMatch.tmdbId,
				title: bestMatch.title,
				confidence: bestMatch.confidence
			};
		} else {
			// Low confidence - flag for manual review
			await db
				.update(unmatchedFiles)
				.set({
					reason: bestMatch.confidence > 0.5 ? 'low_confidence' : 'multiple_matches'
				})
				.where(eq(unmatchedFiles.id, fileId));

			return {
				fileId,
				filePath: file.path,
				matched: false,
				tmdbId: bestMatch.tmdbId,
				title: bestMatch.title,
				confidence: bestMatch.confidence,
				reason: `Confidence ${Math.round(bestMatch.confidence * 100)}% below threshold ${Math.round(threshold * 100)}%`
			};
		}
	}

	/**
	 * Process all unmatched files
	 */
	async processAllUnmatched(): Promise<MatchResult[]> {
		const files = await db.select().from(unmatchedFiles);
		const results: MatchResult[] = [];

		for (const file of files) {
			const result = await this.processUnmatchedFile(file.id);
			results.push(result);

			// Small delay to avoid rate limiting
			await new Promise((resolve) => setTimeout(resolve, 250));
		}

		return results;
	}

	/**
	 * Accept a match and create the library entry
	 */
	async acceptMatch(
		unmatchedFileId: string,
		tmdbId: number,
		mediaType: 'movie' | 'tv'
	): Promise<void> {
		const [file] = await db
			.select()
			.from(unmatchedFiles)
			.where(eq(unmatchedFiles.id, unmatchedFileId));

		if (!file) {
			throw new Error(`Unmatched file not found: ${unmatchedFileId}`);
		}

		// Get root folder
		const [rootFolder] = await db
			.select()
			.from(rootFolders)
			.where(eq(rootFolders.id, file.rootFolderId!));

		if (!rootFolder) {
			throw new Error(`Root folder not found: ${file.rootFolderId}`);
		}

		// Extract media info
		const mediaInfo = await mediaInfoService.extractMediaInfo(file.path);

		if (mediaType === 'movie') {
			await this.createMovieEntry(file, tmdbId, rootFolder, mediaInfo);
		} else {
			await this.createSeriesEntry(file, tmdbId, rootFolder, mediaInfo);
		}

		// Remove from unmatched
		await db.delete(unmatchedFiles).where(eq(unmatchedFiles.id, unmatchedFileId));
	}

	/**
	 * Create a movie entry from an unmatched file
	 */
	private async createMovieEntry(
		file: typeof unmatchedFiles.$inferSelect,
		tmdbId: number,
		rootFolder: typeof rootFolders.$inferSelect,
		mediaInfo: Awaited<ReturnType<typeof mediaInfoService.extractMediaInfo>>
	): Promise<void> {
		// Fetch movie details and external IDs from TMDB
		const [tmdbMovie, externalIds] = await Promise.all([
			tmdb.getMovie(tmdbId),
			tmdb.getMovieExternalIds(tmdbId).catch((err) => {
				logger.warn('[MediaMatcher] Failed to fetch movie external IDs', {
					tmdbId,
					error: err instanceof Error ? err.message : String(err)
				});
				return { imdb_id: null, tvdb_id: null };
			})
		]);

		// Calculate relative path from root folder
		const relativePath = file.path.replace(rootFolder.path, '').replace(/^\//, '');
		const movieFolder = dirname(relativePath);
		const fileName = basename(relativePath);

		// Check if movie already exists
		const [existingMovie] = await db.select().from(movies).where(eq(movies.tmdbId, tmdbId));

		let movieId: string;

		if (existingMovie) {
			movieId = existingMovie.id;
			// Update hasFile flag
			await db.update(movies).set({ hasFile: true }).where(eq(movies.id, movieId));
		} else {
			// Get default language profile for new media
			const subtitleSettings = getSubtitleSettingsService();
			const defaultProfileId = await subtitleSettings.get('defaultLanguageProfileId');

			// Create new movie entry
			const [newMovie] = await db
				.insert(movies)
				.values({
					tmdbId,
					imdbId: externalIds.imdb_id,
					title: tmdbMovie.title,
					originalTitle: tmdbMovie.original_title,
					year: tmdbMovie.release_date ? parseInt(tmdbMovie.release_date.split('-')[0]) : undefined,
					overview: tmdbMovie.overview,
					posterPath: tmdbMovie.poster_path,
					backdropPath: tmdbMovie.backdrop_path,
					runtime: tmdbMovie.runtime,
					genres: tmdbMovie.genres?.map((g) => g.name),
					path: movieFolder || fileName,
					rootFolderId: rootFolder.id,
					hasFile: true,
					languageProfileId: defaultProfileId,
					wantsSubtitles: defaultProfileId ? true : undefined
				})
				.returning();

			movieId = newMovie.id;
			logger.debug('[MediaMatcher] Assigned default language profile to new movie', {
				movieId,
				title: tmdbMovie.title,
				languageProfileId: defaultProfileId
			});
		}

		// Create movie file entry
		await db.insert(movieFiles).values({
			movieId,
			relativePath: fileName,
			size: file.size,
			mediaInfo,
			sceneName: file.parsedTitle
		});

		// Trigger subtitle search if enabled (after metadata is fetched)
		this.triggerSubtitleSearch('movie', movieId).catch((err) => {
			logger.warn('[MediaMatcher] Failed to trigger subtitle search for movie', {
				movieId,
				error: err instanceof Error ? err.message : String(err)
			});
		});
	}

	/**
	 * Create a series/episode entry from an unmatched file
	 */
	private async createSeriesEntry(
		file: typeof unmatchedFiles.$inferSelect,
		tmdbId: number,
		rootFolder: typeof rootFolders.$inferSelect,
		mediaInfo: Awaited<ReturnType<typeof mediaInfoService.extractMediaInfo>>
	): Promise<void> {
		// Fetch series details and external IDs from TMDB
		const [tmdbSeries, externalIds] = await Promise.all([
			tmdb.getTVShow(tmdbId),
			tmdb.getTvExternalIds(tmdbId).catch((err) => {
				logger.warn('[MediaMatcher] Failed to fetch series external IDs', {
					tmdbId,
					error: err instanceof Error ? err.message : String(err)
				});
				return { imdb_id: null, tvdb_id: null };
			})
		]);

		// Calculate relative path from root folder
		const relativePath = file.path.replace(rootFolder.path, '').replace(/^\//, '');
		const pathParts = relativePath.split('/');
		const seriesFolder = pathParts[0] || relativePath;

		// Check if series already exists
		const [existingSeries] = await db.select().from(series).where(eq(series.tmdbId, tmdbId));

		let seriesId: string;

		if (existingSeries) {
			seriesId = existingSeries.id;
		} else {
			// Get default language profile for new media
			const subtitleSettings = getSubtitleSettingsService();
			const defaultProfileId = await subtitleSettings.get('defaultLanguageProfileId');

			// Create new series entry
			const [newSeries] = await db
				.insert(series)
				.values({
					tmdbId,
					imdbId: externalIds.imdb_id,
					tvdbId: externalIds.tvdb_id,
					title: tmdbSeries.name,
					originalTitle: tmdbSeries.original_name,
					year: tmdbSeries.first_air_date
						? parseInt(tmdbSeries.first_air_date.split('-')[0])
						: undefined,
					overview: tmdbSeries.overview,
					posterPath: tmdbSeries.poster_path,
					backdropPath: tmdbSeries.backdrop_path,
					status: tmdbSeries.status,
					network: tmdbSeries.networks?.[0]?.name,
					genres: tmdbSeries.genres?.map((g) => g.name),
					path: seriesFolder,
					rootFolderId: rootFolder.id,
					languageProfileId: defaultProfileId,
					wantsSubtitles: defaultProfileId ? true : undefined
				})
				.returning();

			seriesId = newSeries.id;
			logger.debug('[MediaMatcher] Assigned default language profile to new series', {
				seriesId,
				title: tmdbSeries.name,
				languageProfileId: defaultProfileId
			});
		}

		// Determine season and episode from parsed info
		const seasonNumber = file.parsedSeason || 1;
		const episodeNumber = file.parsedEpisode || 1;

		// Ensure season exists
		let [season] = await db
			.select()
			.from(seasons)
			.where(and(eq(seasons.seriesId, seriesId), eq(seasons.seasonNumber, seasonNumber)));

		if (!season) {
			// Fetch season details from TMDB
			try {
				const tmdbSeason = await tmdb.getSeason(tmdbId, seasonNumber);
				[season] = await db
					.insert(seasons)
					.values({
						seriesId,
						seasonNumber,
						name: tmdbSeason.name,
						overview: tmdbSeason.overview,
						posterPath: tmdbSeason.poster_path,
						airDate: tmdbSeason.air_date
					})
					.returning();
			} catch {
				// Season might not exist in TMDB, create basic entry
				[season] = await db
					.insert(seasons)
					.values({
						seriesId,
						seasonNumber
					})
					.returning();
			}
		}

		// Ensure episode exists
		let [episode] = await db
			.select()
			.from(episodes)
			.where(
				and(
					eq(episodes.seriesId, seriesId),
					eq(episodes.seasonNumber, seasonNumber),
					eq(episodes.episodeNumber, episodeNumber)
				)
			);

		if (!episode) {
			// Create basic episode entry
			[episode] = await db
				.insert(episodes)
				.values({
					seriesId,
					seasonId: season.id,
					seasonNumber,
					episodeNumber,
					hasFile: true
				})
				.returning();
		} else {
			// Update hasFile
			await db.update(episodes).set({ hasFile: true }).where(eq(episodes.id, episode.id));
		}

		// Create episode file entry
		await db.insert(episodeFiles).values({
			seriesId,
			seasonNumber,
			episodeIds: [episode.id],
			relativePath: relativePath.replace(seriesFolder + '/', ''),
			size: file.size,
			mediaInfo,
			sceneName: file.parsedTitle
		});

		// Update series stats
		await this.updateSeriesStats(seriesId);

		// Trigger subtitle search if enabled (after metadata is fetched)
		this.triggerSubtitleSearch('episode', episode.id).catch((err) => {
			logger.warn('[MediaMatcher] Failed to trigger subtitle search for episode', {
				episodeId: episode.id,
				error: err instanceof Error ? err.message : String(err)
			});
		});
	}

	/**
	 * Update episode counts for a series (excluding specials/season 0)
	 */
	private async updateSeriesStats(seriesId: string): Promise<void> {
		const allEpisodes = await db.select().from(episodes).where(eq(episodes.seriesId, seriesId));
		const regularEpisodes = allEpisodes.filter((e) => e.seasonNumber !== 0);

		const episodeCount = regularEpisodes.length;
		const episodeFileCount = regularEpisodes.filter((e) => e.hasFile).length;

		await db.update(series).set({ episodeCount, episodeFileCount }).where(eq(series.id, seriesId));
	}

	/**
	 * Reject a suggested match (keep as unmatched with different reason)
	 */
	async rejectMatch(unmatchedFileId: string): Promise<void> {
		await db
			.update(unmatchedFiles)
			.set({
				reason: 'rejected',
				suggestedMatches: []
			})
			.where(eq(unmatchedFiles.id, unmatchedFileId));
	}

	/**
	 * Trigger subtitle search for newly imported media
	 * Checks settings to determine if search should run
	 */
	private async triggerSubtitleSearch(
		mediaType: 'movie' | 'episode',
		mediaId: string
	): Promise<void> {
		// Use consolidated settings from MonitoringScheduler
		const settings = await monitoringScheduler.getSettings();

		// Check if subtitle search on import is enabled
		if (!settings.subtitleSearchOnImportEnabled) {
			return;
		}

		// Check if trigger timing matches 'after_metadata' (called after TMDB fetch)
		const trigger = settings.subtitleSearchTrigger;
		if (trigger !== 'after_metadata' && trigger !== 'both') {
			return;
		}

		logger.info('[MediaMatcher] Triggering subtitle search for new media', { mediaType, mediaId });

		await searchSubtitlesForNewMedia(mediaType, mediaId);
	}
}

export const mediaMatcherService = MediaMatcherService.getInstance();
