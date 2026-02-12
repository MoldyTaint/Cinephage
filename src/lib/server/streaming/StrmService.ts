/**
 * STRM File Service
 *
 * Handles creation and management of .strm files for streaming releases.
 * STRM files are simple text files containing a URL that media players use
 * to locate and play streaming content.
 */

import { existsSync, mkdirSync, writeFileSync, unlinkSync, readFileSync } from 'fs';
import { join, dirname, resolve, relative } from 'path';
import { createChildLogger } from '$lib/logging';
import { db } from '$lib/server/db';
import {
	movies,
	series,
	episodes,
	rootFolders,
	movieFiles,
	episodeFiles
} from '$lib/server/db/schema';
import { eq, and, asc, sql } from 'drizzle-orm';

const logger = createChildLogger({ module: 'StrmService' });

/** Concurrency limit for parallel .strm file creation */
const STRM_CONCURRENCY_LIMIT = 10;

/**
 * Process items in batches with controlled concurrency
 */
async function processInBatches<T, R>(
	items: T[],
	processor: (item: T) => Promise<R>,
	concurrency: number = STRM_CONCURRENCY_LIMIT
): Promise<R[]> {
	const results: R[] = [];
	for (let i = 0; i < items.length; i += concurrency) {
		const batch = items.slice(i, i + concurrency);
		const batchResults = await Promise.all(batch.map(processor));
		results.push(...batchResults);
	}
	return results;
}

/**
 * Validate that a path is safe (no path traversal).
 * Returns true if the resolved path is within the expected root.
 */
function isPathSafe(rootPath: string, subPath: string): boolean {
	// Resolve to absolute paths
	const root = resolve(rootPath);
	const full = resolve(join(rootPath, subPath));

	// Check that resolved path starts with root path
	const relativePath = relative(root, full);

	// If relative path starts with '..' or is absolute, it's escaping
	if (relativePath.startsWith('..') || resolve(relativePath) === relativePath) {
		return false;
	}

	return true;
}

/**
 * Validate path component for safety.
 * Rejects paths containing traversal patterns.
 */
function sanitizePath(pathComponent: string): string {
	// Remove or replace dangerous characters and patterns
	return pathComponent
		.replace(/\.\./g, '') // Remove parent directory references
		.replace(/^\/+|\/+$/g, '') // Remove leading/trailing slashes
		.replace(/[<>:"|?*]/g, '') // Remove invalid characters
		.trim();
}

export interface StrmCreateOptions {
	/** Media type: 'movie' or 'tv' */
	mediaType: 'movie' | 'tv';
	/** TMDB ID for the content */
	tmdbId: string;
	/** Movie ID if movie */
	movieId?: string;
	/** Series ID if TV */
	seriesId?: string;
	/** Season number for TV */
	season?: number;
	/** Episode number for TV */
	episode?: number;
	/** Base URL for the application (e.g., http://localhost:5173) */
	baseUrl: string;
}

export interface StrmCreateResult {
	success: boolean;
	filePath?: string;
	error?: string;
}

/** Pre-fetched series data to avoid redundant DB queries */
export interface SeriesData {
	title: string;
	year: number | null;
	path: string | null;
}

/** Pre-fetched episode data for batch processing */
export interface EpisodeData {
	id: string;
	episodeNumber: number;
	title: string | null;
}

/** Options for creating .strm file without DB queries */
export interface StrmDirectOptions {
	tmdbId: string;
	baseUrl: string;
	rootFolderPath: string;
	seriesData: SeriesData;
	seasonNumber: number;
	episode: EpisodeData;
}

/**
 * Service for creating and managing .strm files
 */
export class StrmService {
	private static instance: StrmService;

	private constructor() {}

	static getInstance(): StrmService {
		if (!StrmService.instance) {
			StrmService.instance = new StrmService();
		}
		return StrmService.instance;
	}

	/**
	 * Generate the content of a .strm file
	 * Points to our resolve endpoint which handles stream extraction on-demand
	 */
	generateStrmContent(options: StrmCreateOptions): string {
		const { mediaType, tmdbId, season, episode, baseUrl } = options;

		if (mediaType === 'movie') {
			return `${baseUrl}/api/streaming/resolve/movie/${tmdbId}`;
		} else {
			return `${baseUrl}/api/streaming/resolve/tv/${tmdbId}/${season}/${episode}`;
		}
	}

	/**
	 * Create a .strm file for a streaming release
	 */
	async createStrmFile(options: StrmCreateOptions): Promise<StrmCreateResult> {
		const { mediaType, movieId, seriesId, season, episode } = options;

		try {
			let destinationPath: string;
			let filename: string;

			if (mediaType === 'movie' && movieId) {
				// Get movie details for folder path
				const movie = await db.query.movies.findFirst({
					where: eq(movies.id, movieId)
				});

				if (!movie) {
					return { success: false, error: `Movie not found: ${movieId}` };
				}

				if (!movie.rootFolderId) {
					return { success: false, error: 'Movie has no root folder configured' };
				}

				// Get root folder path
				const rootFolder = await db.query.rootFolders.findFirst({
					where: eq(rootFolders.id, movie.rootFolderId)
				});

				if (!rootFolder) {
					return { success: false, error: 'Root folder not found' };
				}

				// Build movie folder path - use existing path or construct from title
				const safeName = this.sanitizeFilename(movie.title);
				const year = movie.year ?? 'Unknown';
				const rawFolderName = movie.path || `${safeName} (${year})`;

				// Sanitize path to prevent traversal attacks
				const folderName = sanitizePath(rawFolderName);
				if (!isPathSafe(rootFolder.path, folderName)) {
					return { success: false, error: 'Invalid movie path: path traversal detected' };
				}

				const movieFolder = join(rootFolder.path, folderName);
				filename = `${safeName} (${year}).strm`;
				destinationPath = join(movieFolder, filename);
			} else if (mediaType === 'tv' && seriesId && season !== undefined && episode !== undefined) {
				// Get series details
				const show = await db.query.series.findFirst({
					where: eq(series.id, seriesId)
				});

				if (!show) {
					return { success: false, error: `Series not found: ${seriesId}` };
				}

				if (!show.rootFolderId) {
					return { success: false, error: 'Series has no root folder configured' };
				}

				// Get root folder path
				const rootFolder = await db.query.rootFolders.findFirst({
					where: eq(rootFolders.id, show.rootFolderId)
				});

				if (!rootFolder) {
					return { success: false, error: 'Root folder not found' };
				}

				// Build episode folder path - use existing path or construct from title
				const safeName = this.sanitizeFilename(show.title);
				const year = show.year ?? 'Unknown';
				const rawShowPath = show.path || `${safeName} (${year})`;

				// Sanitize path to prevent traversal attacks
				const showPath = sanitizePath(rawShowPath);
				if (!isPathSafe(rootFolder.path, showPath)) {
					return { success: false, error: 'Invalid series path: path traversal detected' };
				}

				const showFolder = join(rootFolder.path, showPath);
				const seasonFolder = join(showFolder, `Season ${season.toString().padStart(2, '0')}`);

				// Get episode title if available
				const episodeRow = await db.query.episodes.findFirst({
					where: and(
						eq(episodes.seriesId, seriesId),
						eq(episodes.seasonNumber, season),
						eq(episodes.episodeNumber, episode)
					)
				});
				const seasonStr = season.toString().padStart(2, '0');
				const episodeStr = episode.toString().padStart(2, '0');
				const episodeTitle = episodeRow?.title
					? ` - ${this.sanitizeFilename(episodeRow.title)}`
					: '';
				filename = `${safeName} - S${seasonStr}E${episodeStr}${episodeTitle}.strm`;
				destinationPath = join(seasonFolder, filename);
			} else {
				return { success: false, error: 'Invalid options for creating .strm file' };
			}

			// Ensure directory exists
			const dir = dirname(destinationPath);
			if (!existsSync(dir)) {
				mkdirSync(dir, { recursive: true });
				logger.debug('[StrmService] Created directory', { dir });
			}

			// Generate and write .strm content
			const content = this.generateStrmContent(options);
			writeFileSync(destinationPath, content, 'utf8');

			logger.info('[StrmService] Created .strm file', {
				path: destinationPath,
				content
			});

			return { success: true, filePath: destinationPath };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			logger.error('[StrmService] Failed to create .strm file', { error: message });
			return { success: false, error: message };
		}
	}

	/**
	 * Create a .strm file using pre-fetched data (no DB queries)
	 * This is the optimized version for batch operations
	 */
	createStrmFileDirect(options: StrmDirectOptions): StrmCreateResult {
		const { tmdbId, baseUrl, rootFolderPath, seriesData, seasonNumber, episode } = options;

		try {
			const safeName = this.sanitizeFilename(seriesData.title);
			const year = seriesData.year ?? 'Unknown';
			const rawShowPath = seriesData.path || `${safeName} (${year})`;

			const showPath = sanitizePath(rawShowPath);
			if (!isPathSafe(rootFolderPath, showPath)) {
				return { success: false, error: 'Invalid series path: path traversal detected' };
			}

			const showFolder = join(rootFolderPath, showPath);
			const seasonFolder = join(showFolder, `Season ${seasonNumber.toString().padStart(2, '0')}`);

			const seasonStr = seasonNumber.toString().padStart(2, '0');
			const episodeStr = episode.episodeNumber.toString().padStart(2, '0');
			const episodeTitle = episode.title ? ` - ${this.sanitizeFilename(episode.title)}` : '';
			const filename = `${safeName} - S${seasonStr}E${episodeStr}${episodeTitle}.strm`;
			const destinationPath = join(seasonFolder, filename);

			// Ensure directory exists
			const dir = dirname(destinationPath);
			if (!existsSync(dir)) {
				mkdirSync(dir, { recursive: true });
			}

			// Generate and write .strm content
			const content = `${baseUrl}/api/streaming/resolve/tv/${tmdbId}/${seasonNumber}/${episode.episodeNumber}`;
			writeFileSync(destinationPath, content, 'utf8');

			return { success: true, filePath: destinationPath };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return { success: false, error: message };
		}
	}

	/**
	 * Delete a .strm file
	 */
	deleteStrmFile(filePath: string): boolean {
		try {
			if (existsSync(filePath)) {
				unlinkSync(filePath);
				logger.info('[StrmService] Deleted .strm file', { path: filePath });
				return true;
			}
			return false;
		} catch (error) {
			logger.error('[StrmService] Failed to delete .strm file', {
				path: filePath,
				error: error instanceof Error ? error.message : 'Unknown error'
			});
			return false;
		}
	}

	/**
	 * Sanitize a string for use as a filename
	 */
	private sanitizeFilename(name: string): string {
		return name
			.replace(/[<>:"/\\|?*]/g, '') // Remove invalid characters
			.replace(/\s+/g, ' ') // Normalize whitespace
			.trim();
	}

	/**
	 * Resolve a media file path from DB root folder + media path + relative file path.
	 * Handles both canonical relative paths and already-prefixed relative paths.
	 */
	private resolveMediaPath(
		rootPath: string,
		parentPath: string | null,
		relativePath: string
	): string {
		const cleanedParent = (parentPath ?? '').replace(/^[/\\]+/, '');
		if (
			cleanedParent &&
			(relativePath === cleanedParent ||
				relativePath.startsWith(`${cleanedParent}/`) ||
				relativePath.startsWith(`${cleanedParent}\\`))
		) {
			return join(rootPath, relativePath);
		}
		return join(rootPath, cleanedParent, relativePath);
	}

	/**
	 * Parse an HTTP URL from a .strm file to extract media parameters.
	 * This is used when bulk-updating .strm files to understand what content they point to.
	 *
	 * Supports:
	 *   - {baseUrl}/api/streaming/resolve/movie/{tmdbId}
	 *   - {baseUrl}/api/streaming/resolve/tv/{tmdbId}/{season}/{episode}
	 */
	parseStrmFileUrl(url: string): {
		mediaType: 'movie' | 'tv';
		tmdbId: string;
		season?: number;
		episode?: number;
	} | null {
		// Match movie URL: {anyBaseUrl}/api/streaming/resolve/movie/{tmdbId}
		const movieMatch = url.match(/\/api\/streaming\/resolve\/movie\/(\d+)$/);
		if (movieMatch) {
			return {
				mediaType: 'movie',
				tmdbId: movieMatch[1]
			};
		}

		// Match TV URL: {anyBaseUrl}/api/streaming/resolve/tv/{tmdbId}/{season}/{episode}
		const tvMatch = url.match(/\/api\/streaming\/resolve\/tv\/(\d+)\/(\d+)\/(\d+)$/);
		if (tvMatch) {
			return {
				mediaType: 'tv',
				tmdbId: tvMatch[1],
				season: parseInt(tvMatch[2], 10),
				episode: parseInt(tvMatch[3], 10)
			};
		}

		return null;
	}

	/**
	 * Bulk update streamer-profile .strm files with a new base URL.
	 * This is useful when the server's IP/port/domain changes.
	 *
	 * @param newBaseUrl - The new base URL to use in .strm files
	 * @returns Summary of the update operation
	 */
	async bulkUpdateStrmUrls(newBaseUrl: string): Promise<{
		success: boolean;
		totalFiles: number;
		updatedFiles: number;
		errors: Array<{ path: string; error: string }>;
	}> {
		const errors: Array<{ path: string; error: string }> = [];
		let totalFiles = 0;
		let updatedFiles = 0;

		// Remove trailing slash from base URL
		const baseUrl = newBaseUrl.replace(/\/$/, '');

		logger.info('[StrmService] Starting bulk .strm URL update', { newBaseUrl: baseUrl });

		try {
			const movieStrmLike = sql`lower(${movieFiles.relativePath}) like '%.strm'`;
			const episodeStrmLike = sql`lower(${episodeFiles.relativePath}) like '%.strm'`;

			// Only process library entries currently on the Streamer profile.
			// This prevents touching external/manual .strm files under non-streamer profiles.
			const [movieStrmRows, episodeStrmRows] = await Promise.all([
				db
					.select({
						relativePath: movieFiles.relativePath,
						parentPath: movies.path,
						rootPath: rootFolders.path
					})
					.from(movieFiles)
					.leftJoin(movies, eq(movieFiles.movieId, movies.id))
					.leftJoin(rootFolders, eq(movies.rootFolderId, rootFolders.id))
					.where(and(movieStrmLike, eq(movies.scoringProfileId, 'streamer'))),
				db
					.select({
						relativePath: episodeFiles.relativePath,
						parentPath: series.path,
						rootPath: rootFolders.path
					})
					.from(episodeFiles)
					.leftJoin(series, eq(episodeFiles.seriesId, series.id))
					.leftJoin(rootFolders, eq(series.rootFolderId, rootFolders.id))
					.where(and(episodeStrmLike, eq(series.scoringProfileId, 'streamer')))
			]);

			const strmFiles = new Set<string>();
			let skippedMissingMetadata = 0;

			for (const row of movieStrmRows) {
				if (!row.rootPath || !row.parentPath) {
					skippedMissingMetadata += 1;
					continue;
				}
				const fullPath = this.resolveMediaPath(row.rootPath, row.parentPath, row.relativePath);
				if (existsSync(fullPath)) {
					strmFiles.add(fullPath);
				}
			}

			for (const row of episodeStrmRows) {
				if (!row.rootPath || !row.parentPath) {
					skippedMissingMetadata += 1;
					continue;
				}
				const fullPath = this.resolveMediaPath(row.rootPath, row.parentPath, row.relativePath);
				if (existsSync(fullPath)) {
					strmFiles.add(fullPath);
				}
			}

			totalFiles = strmFiles.size;
			logger.info('[StrmService] Found streamer .strm files to process', {
				count: totalFiles,
				skippedMissingMetadata
			});

			// Process each .strm file
			for (const filePath of strmFiles) {
				try {
					// Read current content
					const currentContent = readFileSync(filePath, 'utf8').trim();

					// Parse the URL to extract media info
					const parsed = this.parseStrmFileUrl(currentContent);
					if (!parsed) {
						errors.push({ path: filePath, error: 'Could not parse URL format' });
						continue;
					}

					// Generate new content with the new base URL
					const newContent = this.generateStrmContent({
						mediaType: parsed.mediaType,
						tmdbId: parsed.tmdbId,
						season: parsed.season,
						episode: parsed.episode,
						baseUrl
					});

					// Only write if content actually changed
					if (currentContent !== newContent) {
						writeFileSync(filePath, newContent, 'utf8');
						updatedFiles++;
						logger.debug('[StrmService] Updated .strm file', {
							path: filePath,
							oldUrl: currentContent.substring(0, 50) + '...',
							newUrl: newContent.substring(0, 50) + '...'
						});
					}
				} catch (error) {
					const message = error instanceof Error ? error.message : 'Unknown error';
					errors.push({ path: filePath, error: message });
				}
			}

			logger.info('[StrmService] Bulk .strm URL update complete', {
				totalFiles,
				updatedFiles,
				unchanged: totalFiles - updatedFiles - errors.length,
				errors: errors.length
			});

			return {
				success: true,
				totalFiles,
				updatedFiles,
				errors
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			logger.error('[StrmService] Bulk .strm URL update failed', { error: message });
			return {
				success: false,
				totalFiles,
				updatedFiles,
				errors: [{ path: 'global', error: message }]
			};
		}
	}

	/**
	 * Parse a stream:// URL to extract parameters
	 * Supports:
	 *   - stream://movie/{tmdbId}
	 *   - stream://tv/{tmdbId}/{season}/{episode} (single episode)
	 *   - stream://tv/{tmdbId}/{season} (season pack - no episode)
	 *   - stream://tv/{tmdbId}/all (complete series - all seasons)
	 */
	static parseStreamUrl(url: string): {
		mediaType: 'movie' | 'tv';
		tmdbId: string;
		season?: number;
		episode?: number;
		isSeasonPack?: boolean;
		isCompleteSeries?: boolean;
	} | null {
		// Format: stream://movie/{tmdbId}
		const movieMatch = url.match(/^stream:\/\/movie\/(\d+)$/);
		if (movieMatch) {
			return {
				mediaType: 'movie',
				tmdbId: movieMatch[1]
			};
		}

		// Format: stream://tv/{tmdbId}/all (complete series - all seasons)
		const tvCompleteMatch = url.match(/^stream:\/\/tv\/(\d+)\/all$/);
		if (tvCompleteMatch) {
			return {
				mediaType: 'tv',
				tmdbId: tvCompleteMatch[1],
				season: undefined,
				episode: undefined,
				isSeasonPack: true,
				isCompleteSeries: true
			};
		}

		// Format: stream://tv/{tmdbId}/{season}/{episode} (single episode)
		const tvEpisodeMatch = url.match(/^stream:\/\/tv\/(\d+)\/(\d+)\/(\d+)$/);
		if (tvEpisodeMatch) {
			return {
				mediaType: 'tv',
				tmdbId: tvEpisodeMatch[1],
				season: parseInt(tvEpisodeMatch[2], 10),
				episode: parseInt(tvEpisodeMatch[3], 10),
				isSeasonPack: false
			};
		}

		// Format: stream://tv/{tmdbId}/{season} (season pack - no episode)
		const tvSeasonMatch = url.match(/^stream:\/\/tv\/(\d+)\/(\d+)$/);
		if (tvSeasonMatch) {
			return {
				mediaType: 'tv',
				tmdbId: tvSeasonMatch[1],
				season: parseInt(tvSeasonMatch[2], 10),
				episode: undefined,
				isSeasonPack: true
			};
		}

		return null;
	}

	/**
	 * Create .strm files for all episodes in a season
	 * Used for streaming "season pack" grabs
	 *
	 * Note: Only creates files for episodes that have already aired
	 * @param options.episodeIds - Optional: Only create files for these specific episode IDs (used to avoid race condition with watcher)
	 * @param options.seriesData - Optional: Pre-fetched series data to avoid redundant DB queries
	 * @param options.rootFolderPath - Optional: Pre-fetched root folder path
	 * @param options.episodeData - Optional: Pre-fetched episode data for this season
	 */
	async createSeasonStrmFiles(options: {
		seriesId: string;
		seasonNumber: number;
		tmdbId: string;
		baseUrl: string;
		episodeIds?: string[];
		seriesData?: SeriesData;
		rootFolderPath?: string;
		episodeData?: EpisodeData[];
	}): Promise<{
		success: boolean;
		results: Array<{ episodeId: string; episodeNumber: number; filePath?: string; error?: string }>;
		error?: string;
	}> {
		const { seriesId, seasonNumber, tmdbId, baseUrl, episodeIds } = options;

		try {
			// Use pre-fetched data or fetch from DB
			let seriesData = options.seriesData;
			let rootFolderPath = options.rootFolderPath;

			if (!seriesData || !rootFolderPath) {
				const show = await db.query.series.findFirst({
					where: eq(series.id, seriesId),
					with: { rootFolder: true }
				});

				if (!show) {
					return { success: false, results: [], error: `Series not found: ${seriesId}` };
				}
				if (!show.rootFolder) {
					return { success: false, results: [], error: 'Series has no root folder configured' };
				}

				seriesData = { title: show.title, year: show.year, path: show.path };
				rootFolderPath = show.rootFolder.path;
			}

			// Use pre-fetched episode data or fetch from DB
			let seasonEpisodes: EpisodeData[];

			if (options.episodeData) {
				seasonEpisodes = options.episodeData;
			} else {
				const allEpisodes = await db.query.episodes.findMany({
					where: and(eq(episodes.seriesId, seriesId), eq(episodes.seasonNumber, seasonNumber))
				});

				// Filter to only include episodes that have already aired
				const today = new Date().toISOString().split('T')[0];
				let airedEpisodes = allEpisodes.filter((ep) => !ep.airDate || ep.airDate <= today);

				// If specific episode IDs provided, filter to only those episodes
				if (episodeIds && episodeIds.length > 0) {
					const episodeIdSet = new Set(episodeIds);
					airedEpisodes = airedEpisodes.filter((ep) => episodeIdSet.has(ep.id));
				}

				seasonEpisodes = airedEpisodes.map((ep) => ({
					id: ep.id,
					episodeNumber: ep.episodeNumber,
					title: ep.title
				}));
			}

			if (seasonEpisodes.length === 0) {
				return {
					success: false,
					results: [],
					error: `No episodes to process for season ${seasonNumber}`
				};
			}

			logger.info('[StrmService] Creating season pack .strm files', {
				seriesId,
				seasonNumber,
				episodeCount: seasonEpisodes.length,
				episodeNumbers: seasonEpisodes.map((e) => e.episodeNumber)
			});

			// Process episodes in parallel batches using the direct method (no DB queries)
			const results = await processInBatches(seasonEpisodes, async (ep) => {
				const result = this.createStrmFileDirect({
					tmdbId,
					baseUrl,
					rootFolderPath: rootFolderPath!,
					seriesData: seriesData!,
					seasonNumber,
					episode: ep
				});

				return {
					episodeId: ep.id,
					episodeNumber: ep.episodeNumber,
					filePath: result.success ? result.filePath : undefined,
					error: result.error
				};
			});

			const successCount = results.filter((r) => r.filePath).length;

			logger.info('[StrmService] Season pack .strm files created', {
				seriesId,
				seasonNumber,
				success: successCount,
				failed: seasonEpisodes.length - successCount
			});

			return {
				success: successCount > 0,
				results
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			logger.error('[StrmService] Failed to create season pack .strm files', {
				seriesId,
				seasonNumber,
				error: message
			});
			return { success: false, results: [], error: message };
		}
	}

	/**
	 * Create .strm files for all episodes in all seasons of a series
	 * Used for streaming "complete series" grabs
	 *
	 * Optimized to pre-fetch all data upfront and process seasons in parallel
	 * Note: Excludes Season 0 (Specials) by default
	 */
	async createSeriesStrmFiles(options: {
		seriesId: string;
		tmdbId: string;
		baseUrl: string;
	}): Promise<{
		success: boolean;
		results: Array<{
			seasonNumber: number;
			episodeResults: Array<{
				episodeId: string;
				episodeNumber: number;
				filePath?: string;
				error?: string;
			}>;
		}>;
		error?: string;
	}> {
		const { seriesId, tmdbId, baseUrl } = options;

		try {
			// Pre-fetch series and root folder in one query
			const show = await db.query.series.findFirst({
				where: eq(series.id, seriesId),
				with: { rootFolder: true }
			});

			if (!show) {
				return { success: false, results: [], error: `Series not found: ${seriesId}` };
			}
			if (!show.rootFolder) {
				return { success: false, results: [], error: 'Series has no root folder configured' };
			}

			const seriesData: SeriesData = { title: show.title, year: show.year, path: show.path };
			const rootFolderPath = show.rootFolder.path;

			// Pre-fetch ALL episodes for the series in one query
			const allEpisodes = await db.query.episodes.findMany({
				where: eq(episodes.seriesId, seriesId),
				orderBy: [asc(episodes.seasonNumber), asc(episodes.episodeNumber)]
			});

			// Filter to only aired episodes and group by season
			const today = new Date().toISOString().split('T')[0];
			const episodesBySeason = new Map<number, EpisodeData[]>();

			for (const ep of allEpisodes) {
				// Skip Season 0 (Specials) and unaired episodes
				if (ep.seasonNumber === 0) continue;
				if (ep.airDate && ep.airDate > today) continue;

				const seasonEps = episodesBySeason.get(ep.seasonNumber) || [];
				seasonEps.push({ id: ep.id, episodeNumber: ep.episodeNumber, title: ep.title });
				episodesBySeason.set(ep.seasonNumber, seasonEps);
			}

			if (episodesBySeason.size === 0) {
				return { success: false, results: [], error: 'No aired episodes found for series' };
			}

			// Log episode breakdown per season to debug E01 skipping issue
			const episodeBreakdown: Record<number, number[]> = {};
			for (const [season, eps] of episodesBySeason.entries()) {
				episodeBreakdown[season] = eps.map((e) => e.episodeNumber);
			}

			logger.info('[StrmService] Creating complete series .strm files', {
				seriesId,
				seasonCount: episodesBySeason.size,
				totalEpisodes: Array.from(episodesBySeason.values()).reduce(
					(sum, eps) => sum + eps.length,
					0
				),
				episodeBreakdown
			});

			// Process all seasons in parallel, each season processes its episodes in batches
			const seasonNumbers = Array.from(episodesBySeason.keys()).sort((a, b) => a - b);
			const seasonResults = await Promise.all(
				seasonNumbers.map(async (seasonNumber) => {
					const seasonResult = await this.createSeasonStrmFiles({
						seriesId,
						seasonNumber,
						tmdbId,
						baseUrl,
						seriesData,
						rootFolderPath,
						episodeData: episodesBySeason.get(seasonNumber)!
					});

					return {
						seasonNumber,
						episodeResults: seasonResult.results
					};
				})
			);

			let totalSuccess = 0;
			let totalEpisodes = 0;
			for (const result of seasonResults) {
				const successCount = result.episodeResults.filter((r) => r.filePath).length;
				totalSuccess += successCount;
				totalEpisodes += result.episodeResults.length;
			}

			logger.info('[StrmService] Complete series .strm files created', {
				seriesId,
				seasonsProcessed: seasonResults.length,
				totalEpisodes,
				totalSuccess,
				totalFailed: totalEpisodes - totalSuccess
			});

			return {
				success: totalSuccess > 0,
				results: seasonResults
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			logger.error('[StrmService] Failed to create complete series .strm files', {
				seriesId,
				error: message
			});
			return { success: false, results: [], error: message };
		}
	}

	/**
	 * Create a .strm file pointing to an NZB streaming mount
	 */
	async createNzbStrmFile(options: {
		mountId: string;
		fileIndex: number;
		movieId?: string;
		seriesId?: string;
		seasonNumber?: number;
		episodeId?: string;
		baseUrl: string;
	}): Promise<StrmCreateResult> {
		const { mountId, fileIndex, movieId, seriesId, seasonNumber, episodeId, baseUrl } = options;

		try {
			let destinationPath: string;

			if (movieId) {
				// Get movie details for folder path
				const movie = await db.query.movies.findFirst({
					where: eq(movies.id, movieId),
					with: { rootFolder: true }
				});

				if (!movie) {
					return { success: false, error: `Movie not found: ${movieId}` };
				}
				if (!movie.rootFolder) {
					return { success: false, error: 'Movie has no root folder configured' };
				}

				const safeName = this.sanitizeFilename(movie.title);
				const year = movie.year ?? 'Unknown';
				const rawFolderName = movie.path || `${safeName} (${year})`;
				const folderName = sanitizePath(rawFolderName);

				if (!isPathSafe(movie.rootFolder.path, folderName)) {
					return { success: false, error: 'Invalid movie path: path traversal detected' };
				}

				const movieFolder = join(movie.rootFolder.path, folderName);
				const filename = `${safeName} (${year}).strm`;
				destinationPath = join(movieFolder, filename);
			} else if (seriesId && seasonNumber !== undefined && episodeId) {
				// Get series and episode details
				const show = await db.query.series.findFirst({
					where: eq(series.id, seriesId),
					with: { rootFolder: true }
				});

				if (!show) {
					return { success: false, error: `Series not found: ${seriesId}` };
				}
				if (!show.rootFolder) {
					return { success: false, error: 'Series has no root folder configured' };
				}

				const episodeRow = await db.query.episodes.findFirst({
					where: eq(episodes.id, episodeId)
				});

				if (!episodeRow) {
					return { success: false, error: `Episode not found: ${episodeId}` };
				}

				const safeName = this.sanitizeFilename(show.title);
				const year = show.year ?? 'Unknown';
				const rawShowPath = show.path || `${safeName} (${year})`;
				const showPath = sanitizePath(rawShowPath);

				if (!isPathSafe(show.rootFolder.path, showPath)) {
					return { success: false, error: 'Invalid series path: path traversal detected' };
				}

				const showFolder = join(show.rootFolder.path, showPath);
				const seasonFolder = join(showFolder, `Season ${seasonNumber.toString().padStart(2, '0')}`);

				const seasonStr = seasonNumber.toString().padStart(2, '0');
				const episodeStr = episodeRow.episodeNumber.toString().padStart(2, '0');
				const episodeTitle = episodeRow.title
					? ` - ${this.sanitizeFilename(episodeRow.title)}`
					: '';
				const filename = `${safeName} - S${seasonStr}E${episodeStr}${episodeTitle}.strm`;
				destinationPath = join(seasonFolder, filename);
			} else {
				return { success: false, error: 'Invalid options for creating NZB .strm file' };
			}

			// Ensure directory exists
			const dir = dirname(destinationPath);
			if (!existsSync(dir)) {
				mkdirSync(dir, { recursive: true });
				logger.debug('[StrmService] Created directory', { dir });
			}

			// Generate NZB streaming URL
			const content = `${baseUrl}/api/streaming/usenet/${mountId}/${fileIndex}`;
			writeFileSync(destinationPath, content, 'utf8');

			logger.info('[StrmService] Created NZB .strm file', {
				path: destinationPath,
				mountId,
				fileIndex
			});

			return { success: true, filePath: destinationPath };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			logger.error('[StrmService] Failed to create NZB .strm file', { error: message });
			return { success: false, error: message };
		}
	}
}

export const strmService = StrmService.getInstance();
