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
import { getRecoverableApiKeyByType } from '$lib/server/auth/index.js';
import { db } from '$lib/server/db';
import {
	movies,
	series,
	episodes,
	rootFolders,
	movieFiles,
	episodeFiles
} from '$lib/server/db/schema';
import { eq, and, asc, sql, inArray } from 'drizzle-orm';
import { NamingService, type MediaNamingInfo } from '$lib/server/library/naming/NamingService.js';
import { namingSettingsService } from '$lib/server/library/naming/NamingSettingsService.js';

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
	/** Optional API key for authentication (if not provided, will be fetched from DB) */
	apiKey?: string;
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
	tvdbId?: number | null;
	seasonFolder?: boolean | null;
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
	/** Optional API key for authentication (if not provided, will be fetched from DB) */
	apiKey?: string;
}

/**
 * Service for creating and managing .strm files
 */
export class StrmService {
	private static instance: StrmService;

	private constructor() {}

	/**
	 * Maps file paths to their media info for bulk updates.
	 * Used to bypass parsing old .strm content and generate fresh URLs from DB.
	 */
	private strayFilePaths: Map<
		string,
		{
			mediaType: 'movie' | 'tv';
			tmdbId?: number;
			movieId?: string;
			seriesId?: string;
			season?: number;
			episodeIds?: string[];
		}
	> = new Map();

	static getInstance(): StrmService {
		if (!StrmService.instance) {
			StrmService.instance = new StrmService();
		}
		return StrmService.instance;
	}

	/**
	 * Fetch the Media Streaming API Key from the database
	 * This key is used for authenticating streaming requests from media servers
	 * Queries directly from database to work in background contexts without user session
	 */
	private async getMediaStreamingApiKey(): Promise<string | null> {
		try {
			const key = await getRecoverableApiKeyByType('streaming');

			if (!key) {
				logger.debug('[StrmService] No Media Streaming API Key found in database');
				return null;
			}

			return key;
		} catch (error) {
			logger.error(
				{
					error: error instanceof Error ? error.message : 'Unknown error'
				},
				'[StrmService] Failed to fetch Media Streaming API Key'
			);
			return null;
		}
	}

	/**
	 * Generate the content of a .strm file
	 * Points to our resolve endpoint which handles stream extraction on-demand
	 * Automatically includes Media Streaming API Key for authentication
	 */
	async generateStrmContent(options: StrmCreateOptions): Promise<string> {
		const { mediaType, tmdbId, season, episode, baseUrl, apiKey: providedApiKey } = options;

		// For HTTP URLs, we need to include the API key
		if (baseUrl.startsWith('http')) {
			// Use provided API key, or fetch from database if not provided
			const apiKey = providedApiKey ?? (await this.getMediaStreamingApiKey());
			if (!apiKey) {
				throw new Error(
					'Media Streaming API Key not found. Generate API keys in Settings > System.'
				);
			}

			if (mediaType === 'movie') {
				return `${baseUrl}/api/streaming/session/movie/${tmdbId}/master.m3u8?api_key=${encodeURIComponent(apiKey)}`;
			} else {
				return `${baseUrl}/api/streaming/session/tv/${tmdbId}/${season}/${episode}/master.m3u8?api_key=${encodeURIComponent(apiKey)}`;
			}
		}

		// For stream:// protocol (internal use), don't add API key
		if (mediaType === 'movie') {
			return `${baseUrl}/api/streaming/session/movie/${tmdbId}/master.m3u8`;
		} else {
			return `${baseUrl}/api/streaming/session/tv/${tmdbId}/${season}/${episode}/master.m3u8`;
		}
	}

	/**
	 * Create a .strm file for a streaming release
	 */
	async createStrmFile(options: StrmCreateOptions): Promise<StrmCreateResult> {
		const { mediaType, movieId, seriesId, season, episode } = options;

		try {
			let destinationPath: string;

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

				destinationPath = this.buildMovieStrmPath(rootFolder.path, movie);
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

				// Get episode title if available
				const episodeRow = await db.query.episodes.findFirst({
					where: and(
						eq(episodes.seriesId, seriesId),
						eq(episodes.seasonNumber, season),
						eq(episodes.episodeNumber, episode)
					)
				});
				destinationPath = this.buildEpisodeStrmPath(
					rootFolder.path,
					show,
					season,
					episode,
					episodeRow?.title
				);
			} else {
				return { success: false, error: 'Invalid options for creating .strm file' };
			}

			// Ensure directory exists
			const dir = dirname(destinationPath);
			if (!existsSync(dir)) {
				mkdirSync(dir, { recursive: true });
				logger.debug({ dir }, '[StrmService] Created directory');
			}

			// Generate and write .strm content
			const content = await this.generateStrmContent(options);
			writeFileSync(destinationPath, content, 'utf8');

			logger.info(
				{
					path: destinationPath,
					content
				},
				'[StrmService] Created .strm file'
			);

			return { success: true, filePath: destinationPath };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			logger.error({ err: error }, '[StrmService] Failed to create .strm file');
			return { success: false, error: message };
		}
	}

	/**
	 * Create a .strm file using pre-fetched data (no DB queries)
	 * This is the optimized version for batch operations
	 */
	async createStrmFileDirect(options: StrmDirectOptions): Promise<StrmCreateResult> {
		const {
			tmdbId,
			baseUrl,
			rootFolderPath,
			seriesData,
			seasonNumber,
			episode,
			apiKey: providedApiKey
		} = options;

		try {
			// Use provided API key or fetch from database
			const apiKey = providedApiKey ?? (await this.getMediaStreamingApiKey());
			if (!apiKey) {
				return {
					success: false,
					error: 'Media Streaming API Key not found. Generate API keys in Settings > System.'
				};
			}

			const destinationPath = this.buildEpisodeStrmPath(
				rootFolderPath,
				{
					title: seriesData.title,
					year: seriesData.year,
					tmdbId: Number(tmdbId),
					tvdbId: seriesData.tvdbId,
					path: seriesData.path,
					seasonFolder: seriesData.seasonFolder
				},
				seasonNumber,
				episode.episodeNumber,
				episode.title
			);

			// Ensure directory exists
			const dir = dirname(destinationPath);
			if (!existsSync(dir)) {
				mkdirSync(dir, { recursive: true });
			}

			// Generate and write .strm content with API key
			const content = `${baseUrl}/api/streaming/session/tv/${tmdbId}/${seasonNumber}/${episode.episodeNumber}/master.m3u8?api_key=${encodeURIComponent(apiKey)}`;
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
				logger.info({ path: filePath }, '[StrmService] Deleted .strm file');
				return true;
			}
			return false;
		} catch (error) {
			logger.error(
				{
					path: filePath,
					err: error
				},
				'[StrmService] Failed to delete .strm file'
			);
			return false;
		}
	}

	private getNamingService(): NamingService {
		return new NamingService(namingSettingsService.getConfigSync());
	}

	private buildMovieStrmPath(
		rootFolderPath: string,
		movie: {
			title: string;
			year: number | null;
			tmdbId: number;
			imdbId?: string | null;
			path: string | null;
		}
	): string {
		const namingService = this.getNamingService();
		const info: MediaNamingInfo = {
			title: movie.title,
			year: movie.year ?? undefined,
			tmdbId: movie.tmdbId,
			imdbId: movie.imdbId ?? undefined,
			originalExtension: '.strm'
		};

		const folderName = sanitizePath(movie.path || namingService.generateMovieFolderName(info));
		if (!isPathSafe(rootFolderPath, folderName)) {
			throw new Error('Invalid movie path: path traversal detected');
		}

		return join(rootFolderPath, folderName, namingService.generateMovieFileName(info));
	}

	private buildEpisodeStrmPath(
		rootFolderPath: string,
		show: {
			title: string;
			year: number | null;
			tmdbId: number;
			tvdbId?: number | null;
			path: string | null;
			seasonFolder?: boolean | null;
		},
		seasonNumber: number,
		episodeNumber: number,
		episodeTitle?: string | null
	): string {
		const namingService = this.getNamingService();
		const seriesInfo: MediaNamingInfo = {
			title: show.title,
			year: show.year ?? undefined,
			tmdbId: show.tmdbId,
			tvdbId: show.tvdbId ?? undefined
		};
		const showPath = sanitizePath(show.path || namingService.generateSeriesFolderName(seriesInfo));
		if (!isPathSafe(rootFolderPath, showPath)) {
			throw new Error('Invalid series path: path traversal detected');
		}

		const episodeInfo: MediaNamingInfo = {
			...seriesInfo,
			seasonNumber,
			episodeNumbers: [episodeNumber],
			episodeTitle: episodeTitle ?? undefined,
			originalExtension: '.strm'
		};

		const relativePath =
			(show.seasonFolder ?? true)
				? join(
						namingService.generateSeasonFolderName(seasonNumber),
						namingService.generateEpisodeFileName(episodeInfo)
					)
				: namingService.generateEpisodeFileName(episodeInfo);

		return join(rootFolderPath, showPath, relativePath);
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
	 *   - {baseUrl}/api/streaming/session/movie/{tmdbId}/master.m3u8
	 *   - {baseUrl}/api/streaming/session/tv/{tmdbId}/{season}/{episode}/master.m3u8
	 */
	parseStrmFileUrl(url: string): {
		mediaType: 'movie' | 'tv';
		tmdbId: string;
		season?: number;
		episode?: number;
	} | null {
		const trimmedUrl = url.trim();
		let pathToParse = trimmedUrl;

		if (/^https?:\/\//i.test(trimmedUrl)) {
			try {
				pathToParse = new URL(trimmedUrl).pathname;
			} catch {
				pathToParse = trimmedUrl;
			}
		} else {
			pathToParse = trimmedUrl.split('?')[0]?.split('#')[0] ?? trimmedUrl;
		}

		// Match movie URL: {anyBaseUrl}/api/streaming/session/movie/{tmdbId}/master.m3u8
		const movieMatch = pathToParse.match(
			/\/api\/streaming\/session\/movie\/(\d+)\/master\.m3u8\/?$/
		);
		const legacyMovieMatch = pathToParse.match(
			/\/api\/streaming\/(?:resolve|playback)\/movie\/(\d+)\/?$/
		);
		if (movieMatch) {
			return {
				mediaType: 'movie',
				tmdbId: movieMatch[1]
			};
		}
		if (legacyMovieMatch) {
			return {
				mediaType: 'movie',
				tmdbId: legacyMovieMatch[1]
			};
		}

		// Match TV URL: {anyBaseUrl}/api/streaming/session/tv/{tmdbId}/{season}/{episode}/master.m3u8
		const tvMatch = pathToParse.match(
			/\/api\/streaming\/session\/tv\/(\d+)\/(\d+)\/(\d+)\/master\.m3u8\/?$/
		);
		const legacyTvMatch = pathToParse.match(
			/\/api\/streaming\/(?:resolve|playback)\/tv\/(\d+)\/(\d+)\/(\d+)\/?$/
		);
		if (tvMatch) {
			return {
				mediaType: 'tv',
				tmdbId: tvMatch[1],
				season: parseInt(tvMatch[2], 10),
				episode: parseInt(tvMatch[3], 10)
			};
		}
		if (legacyTvMatch) {
			return {
				mediaType: 'tv',
				tmdbId: legacyTvMatch[1],
				season: parseInt(legacyTvMatch[2], 10),
				episode: parseInt(legacyTvMatch[3], 10)
			};
		}

		return null;
	}

	/**
	 * Bulk update streamer-profile .strm files with a new base URL.
	 * This is useful when the server's IP/port/domain changes.
	 *
	 * @param newBaseUrl - The new base URL to use in .strm files
	 * @param options - Optional configuration including API key for authentication
	 * @returns Summary of the update operation
	 */
	async bulkUpdateStrmUrls(
		newBaseUrl: string,
		options?: { apiKey?: string }
	): Promise<{
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

		logger.info(
			{
				newBaseUrl: baseUrl,
				hasApiKey: !!options?.apiKey
			},
			'[StrmService] Starting bulk .strm URL update'
		);

		try {
			const movieStrmLike = sql`lower(${movieFiles.relativePath}) like '%.strm'`;
			const episodeStrmLike = sql`lower(${episodeFiles.relativePath}) like '%.strm'`;

			// Process ALL .strm files regardless of scoring profile.
			// This ensures legacy files with old /playback/ URLs get updated too.
			const [movieStrmRows, episodeStrmRows] = await Promise.all([
				db
					.select({
						relativePath: movieFiles.relativePath,
						parentPath: movies.path,
						rootPath: rootFolders.path,
						movieId: movieFiles.movieId,
						tmdbId: movies.tmdbId
					})
					.from(movieFiles)
					.leftJoin(movies, eq(movieFiles.movieId, movies.id))
					.leftJoin(rootFolders, eq(movies.rootFolderId, rootFolders.id))
					.where(movieStrmLike),
				db
					.select({
						relativePath: episodeFiles.relativePath,
						parentPath: series.path,
						rootPath: rootFolders.path,
						seriesId: episodeFiles.seriesId,
						seasonNumber: episodeFiles.seasonNumber,
						episodeIds: episodeFiles.episodeIds
					})
					.from(episodeFiles)
					.leftJoin(series, eq(episodeFiles.seriesId, series.id))
					.leftJoin(rootFolders, eq(series.rootFolderId, rootFolders.id))
					.where(episodeStrmLike)
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
					if (row.tmdbId === null) {
						skippedMissingMetadata += 1;
						continue;
					}
					strmFiles.add(fullPath);
					// Map file path to movie info for direct URL generation
					this.strayFilePaths.set(fullPath, {
						mediaType: 'movie',
						tmdbId: row.tmdbId,
						movieId: row.movieId
					});
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
					// Map file path to episode info for direct URL generation
					this.strayFilePaths.set(fullPath, {
						mediaType: 'tv',
						tmdbId: undefined, // Will need to look up via seriesId
						seriesId: row.seriesId,
						season: row.seasonNumber,
						episodeIds: row.episodeIds ?? undefined
					});
				}
			}

			totalFiles = strmFiles.size;
			logger.info(
				{
					count: totalFiles,
					skippedMissingMetadata
				},
				'[StrmService] Found streamer .strm files to process'
			);

			// Pre-fetch all episode data in one query to resolve episode numbers
			const allEpisodeIds = new Set<string>();
			for (const [, info] of this.strayFilePaths) {
				if (info.mediaType === 'tv' && info.episodeIds) {
					for (const id of info.episodeIds) {
						if (typeof id === 'string') allEpisodeIds.add(id);
					}
				}
			}
			const episodeDataMap = new Map<string, { seasonNumber: number; episodeNumber: number }>();
			if (allEpisodeIds.size > 0) {
				const episodeRows = await db
					.select({
						id: episodes.id,
						seasonNumber: episodes.seasonNumber,
						episodeNumber: episodes.episodeNumber
					})
					.from(episodes)
					.where(inArray(episodes.id, Array.from(allEpisodeIds)));

				for (const row of episodeRows) {
					episodeDataMap.set(row.id, {
						seasonNumber: row.seasonNumber,
						episodeNumber: row.episodeNumber
					});
				}
			}

			// Process each .strm file - generate fresh URL from DB info
			for (const filePath of strmFiles) {
				try {
					const mediaInfo = this.strayFilePaths.get(filePath);
					if (!mediaInfo) {
						errors.push({ path: filePath, error: 'Missing media info' });
						continue;
					}

					let tmdbId: number;
					let season: number | undefined;
					let episode: number | undefined;

					if (mediaInfo.mediaType === 'movie') {
						tmdbId = mediaInfo.tmdbId!;
					} else {
						// Look up series tmdbId
						const [seriesRow] = await db
							.select({ tmdbId: series.tmdbId })
							.from(series)
							.where(eq(series.id, mediaInfo.seriesId!));
						if (!seriesRow) {
							errors.push({ path: filePath, error: 'Series not found' });
							continue;
						}
						tmdbId = seriesRow.tmdbId;
						season = mediaInfo.season;

						// Resolve episode number from the first episode ID
						if (mediaInfo.episodeIds && mediaInfo.episodeIds.length > 0) {
							const firstEpId = mediaInfo.episodeIds[0];
							const epData = episodeDataMap.get(firstEpId);
							if (epData) {
								episode = epData.episodeNumber;
							}
						}
					}

					// Generate fresh .strm content from database info
					const newContent = await this.generateStrmContent({
						mediaType: mediaInfo.mediaType,
						tmdbId: String(tmdbId),
						season,
						episode,
						baseUrl,
						apiKey: options?.apiKey
					});

					// Read current content for comparison
					const currentContent = readFileSync(filePath, 'utf8').trim();

					// Only write if content actually changed
					if (currentContent !== newContent) {
						writeFileSync(filePath, newContent, 'utf8');
						updatedFiles++;
						logger.debug(
							{
								path: filePath,
								newUrl: newContent.substring(0, 50) + '...'
							},
							'[StrmService] Updated .strm file'
						);
					}
				} catch (error) {
					const message = error instanceof Error ? error.message : 'Unknown error';
					errors.push({ path: filePath, error: message });
				}
			}

			// Clear the map to free memory
			this.strayFilePaths.clear();

			logger.info(
				{
					totalFiles,
					updatedFiles,
					unchanged: totalFiles - updatedFiles - errors.length,
					errors: errors.length
				},
				'[StrmService] Bulk .strm URL update complete'
			);

			return {
				success: true,
				totalFiles,
				updatedFiles,
				errors
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			logger.error({ err: error }, '[StrmService] Bulk .strm URL update failed');
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

				seriesData = {
					title: show.title,
					year: show.year,
					path: show.path,
					tvdbId: show.tvdbId,
					seasonFolder: show.seasonFolder
				};
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

			logger.info(
				{
					seriesId,
					seasonNumber,
					episodeCount: seasonEpisodes.length,
					episodeNumbers: seasonEpisodes.map((e) => e.episodeNumber)
				},
				'[StrmService] Creating season pack .strm files'
			);

			// Process episodes in parallel batches using the direct method (no DB queries)
			const results = await processInBatches(seasonEpisodes, async (ep) => {
				const result = await this.createStrmFileDirect({
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

			logger.info(
				{
					seriesId,
					seasonNumber,
					success: successCount,
					failed: seasonEpisodes.length - successCount
				},
				'[StrmService] Season pack .strm files created'
			);

			return {
				success: successCount > 0,
				results
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			logger.error(
				{
					seriesId,
					seasonNumber,
					err: error
				},
				'[StrmService] Failed to create season pack .strm files'
			);
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

			const seriesData: SeriesData = {
				title: show.title,
				year: show.year,
				path: show.path,
				tvdbId: show.tvdbId,
				seasonFolder: show.seasonFolder
			};
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
				// Skip unaired episodes (but allow specials/season 0)
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

			logger.info(
				{
					seriesId,
					seasonCount: episodesBySeason.size,
					totalEpisodes: Array.from(episodesBySeason.values()).reduce(
						(sum, eps) => sum + eps.length,
						0
					),
					episodeBreakdown
				},
				'[StrmService] Creating complete series .strm files'
			);

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

			logger.info(
				{
					seriesId,
					seasonsProcessed: seasonResults.length,
					totalEpisodes,
					totalSuccess,
					totalFailed: totalEpisodes - totalSuccess
				},
				'[StrmService] Complete series .strm files created'
			);

			return {
				success: totalSuccess > 0,
				results: seasonResults
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			logger.error(
				{
					seriesId,
					err: error
				},
				'[StrmService] Failed to create complete series .strm files'
			);
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
		apiKey?: string;
	}): Promise<StrmCreateResult> {
		const {
			mountId,
			fileIndex,
			movieId,
			seriesId,
			seasonNumber,
			episodeId,
			baseUrl,
			apiKey: providedApiKey
		} = options;

		// Use provided API key or fetch from database
		const apiKey = providedApiKey ?? (await this.getMediaStreamingApiKey());
		if (!apiKey) {
			throw new Error('Media Streaming API Key not found. Generate API keys in Settings > System.');
		}

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

				destinationPath = this.buildMovieStrmPath(movie.rootFolder.path, movie);
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

				destinationPath = this.buildEpisodeStrmPath(
					show.rootFolder.path,
					show,
					seasonNumber,
					episodeRow.episodeNumber,
					episodeRow.title
				);
			} else {
				return { success: false, error: 'Invalid options for creating NZB .strm file' };
			}

			// Ensure directory exists
			const dir = dirname(destinationPath);
			if (!existsSync(dir)) {
				mkdirSync(dir, { recursive: true });
				logger.debug({ dir }, '[StrmService] Created directory');
			}

			// Generate NZB streaming URL with API key
			const content = `${baseUrl}/api/streaming/usenet/${mountId}/${fileIndex}?api_key=${encodeURIComponent(apiKey)}`;
			writeFileSync(destinationPath, content, 'utf8');

			logger.info(
				{
					path: destinationPath,
					mountId,
					fileIndex
				},
				'[StrmService] Created NZB .strm file'
			);

			return { success: true, filePath: destinationPath };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			logger.error({ err: error }, '[StrmService] Failed to create NZB .strm file');
			return { success: false, error: message };
		}
	}
}

export const strmService = StrmService.getInstance();
