/**
 * ReleaseGrabService
 *
 * Unified service for grabbing releases and adding them to download queue.
 * Consolidates the grab logic previously duplicated in SearchOnAdd and MonitoringSearchService.
 *
 * Supports:
 * - Torrent downloads via download clients (qBittorrent, etc.)
 * - Streaming releases via .strm file creation
 * - Season pack handling for TV shows
 * - Duplicate torrent detection and linking
 */

import { getDownloadClientManager } from '$lib/server/downloadClients/DownloadClientManager.js';
import { downloadMonitor } from '$lib/server/downloadClients/monitoring/index.js';
import { ReleaseParser } from '$lib/server/indexers/parser/ReleaseParser.js';
import { getDownloadResolutionService } from './DownloadResolutionService.js';
import { getNzbValidationService } from './nzb/index.js';
import { strmService, StrmService, getStreamingBaseUrl } from '$lib/server/streaming/index.js';
import { fileExists } from '$lib/server/downloadClients/import/index.js';
import { mediaInfoService } from '$lib/server/library/media-info.js';
import { getIndexerManager } from '$lib/server/indexers/IndexerManager.js';
import { createChildLogger } from '$lib/logging';
import { db } from '$lib/server/db/index.js';
import {
	movies,
	movieFiles,
	series,
	episodes,
	episodeFiles,
	downloadHistory
} from '$lib/server/db/schema.js';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { statSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { EnhancedReleaseResult } from '$lib/server/indexers/types';
import type { DownloadInfo } from '$lib/server/downloadClients/core/interfaces.js';

const logger = createChildLogger({ module: 'ReleaseGrabService' });
const parser = new ReleaseParser();

/**
 * Options for grabbing a release
 */
export interface GrabOptions {
	/** Media type */
	mediaType: 'movie' | 'tv';
	/** Movie ID (for movie grabs) */
	movieId?: string;
	/** Series ID (for TV grabs) */
	seriesId?: string;
	/** Episode IDs to link (for TV grabs) */
	episodeIds?: string[];
	/** Season number (for TV grabs) */
	seasonNumber?: number;
	/** Whether this is an automatic (background) grab vs manual */
	isAutomatic?: boolean;
	/** Whether this is an upgrade over existing content */
	isUpgrade?: boolean;
}

/**
 * Result of a grab operation
 */
export interface GrabResult {
	/** Whether the grab succeeded */
	success: boolean;
	/** Name of the grabbed release */
	releaseName?: string;
	/** Queue item ID created */
	queueItemId?: string;
	/** Error message if failed */
	error?: string;
	/** Episode IDs covered by this grab (for season packs) */
	episodesCovered?: string[];
}

/**
 * Service for grabbing releases and adding them to download queue
 */
class ReleaseGrabService {
	/**
	 * Grab a release and add it to the download queue.
	 *
	 * Routes to appropriate handler based on release protocol:
	 * - 'streaming': Creates .strm files directly
	 * - 'torrent'/'usenet': Sends to download client
	 */
	async grabRelease(release: EnhancedReleaseResult, options: GrabOptions): Promise<GrabResult> {
		const { mediaType } = options;

		logger.info('[ReleaseGrab] Grabbing release', {
			title: release.title,
			mediaType,
			protocol: release.protocol,
			movieId: options.movieId,
			seriesId: options.seriesId,
			episodeIds: options.episodeIds?.length
		});

		try {
			// Route based on release protocol
			switch (release.protocol) {
				case 'streaming':
					return await this.handleStreamingGrab(release, options);
				case 'usenet':
					return await this.handleUsenetGrab(release, options);
				case 'torrent':
				default:
					return await this.handleTorrentGrab(release, options);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			logger.error('[ReleaseGrab] Failed to grab release', {
				title: release.title,
				error: message
			});
			return { success: false, error: message };
		}
	}

	/**
	 * Handle torrent/usenet release - resolve and send to download client
	 */
	private async handleTorrentGrab(
		release: EnhancedReleaseResult,
		options: GrabOptions
	): Promise<GrabResult> {
		const { mediaType, movieId, seriesId, episodeIds, seasonNumber, isAutomatic, isUpgrade } =
			options;

		const clientManager = getDownloadClientManager();
		const enabledClients = await clientManager.getEnabledClients();

		if (enabledClients.length === 0) {
			logger.warn('[ReleaseGrab] No enabled download clients');
			return { success: false, error: 'No enabled download clients configured' };
		}

		const { client: clientConfig, instance: clientInstance } = enabledClients[0];

		// Determine category based on media type
		const category = mediaType === 'movie' ? clientConfig.movieCategory : clientConfig.tvCategory;
		const paused = clientConfig.initialState === 'pause';

		// Parse quality from release title
		const parsed = parser.parse(release.title);
		const quality = {
			resolution: parsed.resolution ?? undefined,
			source: parsed.source ?? undefined,
			codec: parsed.codec ?? undefined,
			hdr: parsed.hdr ?? undefined
		};

		// Look up indexer to get seed ratio/time settings
		let indexerSeedRatio: number | undefined;
		let indexerSeedTime: number | undefined;

		if (release.indexerId) {
			const indexerManager = await getIndexerManager();
			const indexer = await indexerManager.getIndexer(release.indexerId);
			if (indexer) {
				indexerSeedRatio = indexer.seedRatio ? parseFloat(indexer.seedRatio) : undefined;
				indexerSeedTime = indexer.seedTime ?? undefined;
			}
		}

		// Use indexer settings if available, otherwise fall back to client defaults
		const seedRatioLimit =
			indexerSeedRatio ??
			(clientConfig.seedRatioLimit ? parseFloat(clientConfig.seedRatioLimit) : undefined);
		const seedTimeLimit = indexerSeedTime ?? clientConfig.seedTimeLimit ?? undefined;

		// Resolve the download URL to get a magnet link or torrent file
		// This fetches through the indexer with proper auth/cookies
		const resolutionService = getDownloadResolutionService();
		const resolved = await resolutionService.resolve({
			downloadUrl: release.downloadUrl,
			magnetUrl: release.magnetUrl,
			infoHash: release.infoHash,
			indexerId: release.indexerId,
			title: release.title
		});

		if (!resolved.success) {
			logger.error('[ReleaseGrab] Failed to resolve download', {
				title: release.title,
				error: resolved.error
			});
			return { success: false, error: `Failed to resolve download: ${resolved.error}` };
		}

		logger.debug('[ReleaseGrab] Download resolved', {
			title: release.title,
			hasMagnet: !!resolved.magnetUrl,
			hasTorrentFile: !!resolved.torrentFile,
			infoHash: resolved.infoHash,
			usedFallback: resolved.usedFallback
		});

		// Send to download client
		let hash: string;
		let existingTorrent: DownloadInfo | null = null;

		try {
			hash = await clientInstance.addDownload({
				magnetUri: resolved.magnetUrl,
				torrentFile: resolved.torrentFile,
				infoHash: resolved.infoHash,
				category,
				paused,
				priority: clientConfig.recentPriority,
				seedRatioLimit,
				seedTimeLimit
			});
		} catch (addError) {
			// Check if this is a duplicate torrent error
			const isDuplicate = (addError as Error & { isDuplicate?: boolean }).isDuplicate;
			existingTorrent =
				(addError as Error & { existingTorrent?: DownloadInfo }).existingTorrent || null;

			if (isDuplicate && existingTorrent) {
				logger.info('[ReleaseGrab] Handling duplicate torrent - linking to existing download', {
					title: release.title,
					existingName: existingTorrent.name,
					existingStatus: existingTorrent.status,
					existingProgress: Math.round(existingTorrent.progress * 100) + '%',
					hash: existingTorrent.hash
				});

				// Use the existing torrent's hash
				hash = existingTorrent.hash;
			} else {
				// Not a duplicate error, re-throw
				throw addError;
			}
		}

		// Determine the best infoHash to use
		const infoHash = resolved.infoHash || hash;

		// Create queue record to track the download
		// addToQueue will return existing item if already tracked
		const queueItem = await downloadMonitor.addToQueue({
			downloadClientId: clientConfig.id,
			downloadId: hash || infoHash || resolved.magnetUrl || release.downloadUrl || '',
			infoHash: infoHash || undefined,
			title: release.title,
			indexerId: release.indexerId,
			indexerName: release.indexerName,
			downloadUrl: release.downloadUrl,
			magnetUrl: resolved.magnetUrl || release.magnetUrl,
			protocol: 'torrent',
			movieId,
			seriesId,
			episodeIds,
			seasonNumber,
			quality,
			isAutomatic: isAutomatic ?? false,
			isUpgrade: isUpgrade ?? false
		});

		// Log appropriate message based on whether it was a duplicate
		if (existingTorrent) {
			logger.info('[ReleaseGrab] Duplicate torrent linked to queue', {
				title: release.title,
				queueItemId: queueItem.id,
				existingStatus: existingTorrent.status,
				existingProgress: Math.round(existingTorrent.progress * 100) + '%'
			});
		} else {
			logger.info('[ReleaseGrab] Release grabbed successfully', {
				title: release.title,
				queueItemId: queueItem.id
			});
		}

		return {
			success: true,
			releaseName: release.title,
			queueItemId: queueItem.id,
			episodesCovered: episodeIds
		};
	}

	/**
	 * Handle usenet release - fetch NZB and send to SABnzbd/NZBGet
	 */
	private async handleUsenetGrab(
		release: EnhancedReleaseResult,
		options: GrabOptions
	): Promise<GrabResult> {
		const { mediaType, movieId, seriesId, episodeIds, seasonNumber, isAutomatic, isUpgrade } =
			options;

		const clientManager = getDownloadClientManager();
		const usenetClient = await clientManager.getClientForProtocol('usenet');

		if (!usenetClient) {
			logger.warn('[ReleaseGrab] No enabled usenet download clients');
			return { success: false, error: 'No enabled usenet download clients configured' };
		}

		const { client: clientConfig, instance: clientInstance } = usenetClient;

		// Determine category based on media type
		const category = mediaType === 'movie' ? clientConfig.movieCategory : clientConfig.tvCategory;
		const paused = clientConfig.initialState === 'pause';

		// Parse quality from release title
		const parsed = parser.parse(release.title);
		const quality = {
			resolution: parsed.resolution ?? undefined,
			source: parsed.source ?? undefined,
			codec: parsed.codec ?? undefined,
			hdr: parsed.hdr ?? undefined
		};

		logger.info('[ReleaseGrab] Grabbing usenet release', {
			title: release.title,
			indexer: release.indexerName,
			client: clientConfig.name
		});

		// Fetch NZB content through the indexer (handles auth/cookies)
		let nzbContent: Buffer | undefined;

		if (release.downloadUrl) {
			const indexerManager = await getIndexerManager();
			const indexer = release.indexerId
				? await indexerManager.getIndexerInstance(release.indexerId)
				: null;

			if (indexer && indexer.downloadTorrent) {
				try {
					const downloadResult = await indexer.downloadTorrent(release.downloadUrl);
					if (downloadResult.success && downloadResult.data) {
						nzbContent = downloadResult.data;

						// Validate NZB structure
						const nzbValidator = getNzbValidationService();
						const validation = nzbValidator.validate(nzbContent);
						if (!validation.valid) {
							logger.error('[ReleaseGrab] Invalid NZB', {
								title: release.title,
								error: validation.error
							});
							return { success: false, error: `Invalid NZB: ${validation.error}` };
						}

						logger.debug('[ReleaseGrab] NZB validated', {
							title: release.title,
							fileCount: validation.fileCount,
							totalSize: validation.totalSize
						});
					} else {
						logger.error('[ReleaseGrab] Failed to fetch NZB', {
							title: release.title,
							error: downloadResult.error
						});
						return { success: false, error: `Failed to fetch NZB: ${downloadResult.error}` };
					}
				} catch (fetchError) {
					const message = fetchError instanceof Error ? fetchError.message : 'Unknown error';
					logger.error('[ReleaseGrab] Error fetching NZB', {
						title: release.title,
						error: message
					});
					return { success: false, error: `Error fetching NZB: ${message}` };
				}
			} else {
				// No indexer instance - try direct URL
				logger.debug('[ReleaseGrab] Using direct NZB URL (no indexer instance)');
			}
		}

		// Add to usenet client
		let nzoId: string;
		try {
			logger.info('[ReleaseGrab] Sending to client (pre-add)', {
				title: release.title,
				hasNzb: !!nzbContent,
				client: clientConfig.name
			});

			nzoId = await clientInstance.addDownload({
				nzbFile: nzbContent,
				downloadUrl: nzbContent ? undefined : release.downloadUrl,
				title: release.title,
				category,
				paused,
				priority: clientConfig.recentPriority
			});
		} catch (addError) {
			const message = addError instanceof Error ? addError.message : 'Unknown error';
			logger.error('[ReleaseGrab] Failed to add NZB to client', {
				title: release.title,
				client: clientConfig.name,
				error: message
			});
			return { success: false, error: `Failed to add to ${clientConfig.name}: ${message}` };
		}

		// Create queue record to track the download
		const queueItem = await downloadMonitor.addToQueue({
			downloadClientId: clientConfig.id,
			downloadId: nzoId,
			title: release.title,
			indexerId: release.indexerId,
			indexerName: release.indexerName,
			downloadUrl: release.downloadUrl,
			protocol: 'usenet',
			movieId,
			seriesId,
			episodeIds,
			seasonNumber,
			quality,
			isAutomatic: isAutomatic ?? false,
			isUpgrade: isUpgrade ?? false
		});

		logger.info('[ReleaseGrab] Usenet release grabbed successfully', {
			title: release.title,
			queueItemId: queueItem.id,
			nzoId,
			client: clientConfig.name
		});

		return {
			success: true,
			releaseName: release.title,
			queueItemId: queueItem.id,
			episodesCovered: episodeIds
		};
	}

	/**
	 * Handle streaming releases - create .strm file directly instead of using download client
	 * Supports both single episodes and season packs
	 */
	private async handleStreamingGrab(
		release: EnhancedReleaseResult,
		options: GrabOptions
	): Promise<GrabResult> {
		const { mediaType, movieId, seriesId, seasonNumber, episodeIds, isUpgrade } = options;

		logger.info('[ReleaseGrab] Handling streaming release', {
			title: release.title,
			downloadUrl: release.downloadUrl
		});

		// Parse the stream:// URL to get TMDB ID and episode info
		const parsed = StrmService.parseStreamUrl(release.downloadUrl);
		if (!parsed) {
			return { success: false, error: `Invalid streaming URL: ${release.downloadUrl}` };
		}

		// Determine base URL for the .strm file content (from indexer settings, env var, or default)
		const baseUrl = await getStreamingBaseUrl('http://localhost:5173');

		// Handle season pack (multiple episodes)
		if (parsed.isSeasonPack && mediaType === 'tv' && seriesId && parsed.season !== undefined) {
			return this.handleStreamingSeasonPack(release, {
				seriesId,
				seasonNumber: parsed.season,
				tmdbId: parsed.tmdbId,
				baseUrl,
				isUpgrade,
				episodeIds
			});
		}

		// Single file handling (movie or single episode)
		const result = await strmService.createStrmFile({
			mediaType,
			tmdbId: parsed.tmdbId,
			movieId,
			seriesId,
			season: parsed.season ?? seasonNumber,
			episode: parsed.episode,
			baseUrl
		});

		if (!result.success || !result.filePath) {
			logger.error('[ReleaseGrab] Failed to create .strm file', {
				title: release.title,
				error: result.error
			});
			return { success: false, error: result.error };
		}

		logger.info('[ReleaseGrab] Created .strm file for streaming release', {
			title: release.title,
			filePath: result.filePath
		});

		// Now add the file to the database (immediate import)
		return this.importStreamingFile(release, {
			mediaType,
			movieId,
			seriesId,
			parsedStream: parsed,
			filePath: result.filePath,
			isUpgrade
		});
	}

	/**
	 * Import a single streaming file to the database
	 */
	private async importStreamingFile(
		release: EnhancedReleaseResult,
		options: {
			mediaType: 'movie' | 'tv';
			movieId?: string;
			seriesId?: string;
			parsedStream: NonNullable<ReturnType<typeof StrmService.parseStreamUrl>>;
			filePath: string;
			isUpgrade?: boolean;
		}
	): Promise<GrabResult> {
		const { mediaType, movieId, seriesId, parsedStream, filePath, isUpgrade } = options;

		try {
			// Get file stats
			const stats = statSync(filePath);
			const fileSize = Number(stats.size);
			const mediaInfo = await mediaInfoService.extractMediaInfo(filePath);

			// Parse quality from release title
			const parsedRelease = parser.parse(release.title);
			const quality = {
				resolution: parsedRelease.resolution ?? '1080p',
				source: 'Streaming',
				codec: 'HLS',
				hdr: undefined
			};

			if (mediaType === 'movie' && movieId) {
				return this.importStreamingMovie(release, {
					movieId,
					filePath,
					fileSize,
					mediaInfo,
					quality,
					parsedRelease,
					isUpgrade
				});
			} else if (
				mediaType === 'tv' &&
				seriesId &&
				parsedStream.season !== undefined &&
				parsedStream.episode !== undefined
			) {
				return this.importStreamingEpisode(release, {
					seriesId,
					season: parsedStream.season,
					episode: parsedStream.episode,
					filePath,
					fileSize,
					mediaInfo,
					quality,
					parsedRelease,
					isUpgrade
				});
			} else {
				return { success: false, error: 'Invalid media type or missing required IDs' };
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			logger.error('[ReleaseGrab] Failed to add streaming file to database', {
				title: release.title,
				error: message
			});
			return { success: false, error: `Database error: ${message}` };
		}
	}

	/**
	 * Import a streaming movie file
	 */
	private async importStreamingMovie(
		release: EnhancedReleaseResult,
		options: {
			movieId: string;
			filePath: string;
			fileSize: number;
			mediaInfo: Awaited<ReturnType<typeof mediaInfoService.extractMediaInfo>>;
			quality: { resolution: string; source: string; codec: string; hdr: undefined };
			parsedRelease: ReturnType<typeof parser.parse>;
			isUpgrade?: boolean;
		}
	): Promise<GrabResult> {
		const { movieId, filePath, fileSize, mediaInfo, quality, parsedRelease, isUpgrade } = options;

		// Get movie for root folder path
		const movie = await db.query.movies.findFirst({
			where: eq(movies.id, movieId),
			with: { rootFolder: true }
		});

		if (!movie || !movie.rootFolder) {
			return { success: false, error: 'Movie or root folder not found' };
		}

		// Calculate relative path from root folder
		const relativePath = relative(movie.rootFolder.path, filePath);

		// Delete existing files if this is an upgrade
		if (isUpgrade) {
			await this.deleteExistingMovieFiles(movieId, movie.rootFolder.path, movie.path);
		}

		// Create movie file record
		const fileId = randomUUID();
		await db.insert(movieFiles).values({
			id: fileId,
			movieId,
			relativePath,
			size: fileSize,
			dateAdded: new Date().toISOString(),
			sceneName: release.title,
			releaseGroup: parsedRelease.releaseGroup ?? 'Streaming',
			quality,
			mediaInfo
		});

		// Update movie hasFile flag
		await db.update(movies).set({ hasFile: true }).where(eq(movies.id, movieId));

		// Create history record
		await db.insert(downloadHistory).values({
			title: release.title,
			indexerId: release.indexerId,
			indexerName: release.indexerName,
			protocol: 'streaming',
			movieId,
			status: 'streaming',
			size: fileSize,
			quality,
			importedPath: filePath,
			movieFileId: fileId,
			grabbedAt: new Date().toISOString(),
			importedAt: new Date().toISOString()
		});

		logger.info('[ReleaseGrab] Added streaming movie file to database', {
			movieId,
			fileId,
			relativePath
		});

		return {
			success: true,
			releaseName: release.title
		};
	}

	/**
	 * Import a streaming episode file
	 */
	private async importStreamingEpisode(
		release: EnhancedReleaseResult,
		options: {
			seriesId: string;
			season: number;
			episode: number;
			filePath: string;
			fileSize: number;
			mediaInfo: Awaited<ReturnType<typeof mediaInfoService.extractMediaInfo>>;
			quality: { resolution: string; source: string; codec: string; hdr: undefined };
			parsedRelease: ReturnType<typeof parser.parse>;
			isUpgrade?: boolean;
		}
	): Promise<GrabResult> {
		const {
			seriesId,
			season,
			episode,
			filePath,
			fileSize,
			mediaInfo,
			quality,
			parsedRelease,
			isUpgrade
		} = options;

		// Get series for root folder path
		const show = await db.query.series.findFirst({
			where: eq(series.id, seriesId),
			with: { rootFolder: true }
		});

		if (!show || !show.rootFolder) {
			return { success: false, error: 'Series or root folder not found' };
		}

		// Find the episode
		const episodeRow = await db.query.episodes.findFirst({
			where: and(
				eq(episodes.seriesId, seriesId),
				eq(episodes.seasonNumber, season),
				eq(episodes.episodeNumber, episode)
			)
		});

		if (!episodeRow) {
			return { success: false, error: `Episode S${season}E${episode} not found` };
		}

		// Calculate relative path from root folder
		const relativePath = relative(show.rootFolder.path, filePath);

		// Delete existing episode file if this is an upgrade
		if (isUpgrade) {
			await this.deleteExistingEpisodeFiles(
				seriesId,
				episodeRow.id,
				show.rootFolder.path,
				show.path
			);
		}

		// Create episode file record
		const fileId = randomUUID();
		await db.insert(episodeFiles).values({
			id: fileId,
			seriesId,
			seasonNumber: season,
			episodeIds: [episodeRow.id],
			relativePath,
			size: fileSize,
			dateAdded: new Date().toISOString(),
			sceneName: release.title,
			releaseGroup: parsedRelease.releaseGroup ?? 'Streaming',
			quality,
			mediaInfo
		});

		// Update episode hasFile flag
		await db.update(episodes).set({ hasFile: true }).where(eq(episodes.id, episodeRow.id));

		// Create history record
		await db.insert(downloadHistory).values({
			title: release.title,
			indexerId: release.indexerId,
			indexerName: release.indexerName,
			protocol: 'streaming',
			seriesId,
			episodeIds: [episodeRow.id],
			seasonNumber: season,
			status: 'streaming',
			size: fileSize,
			quality,
			importedPath: filePath,
			episodeFileIds: [fileId],
			grabbedAt: new Date().toISOString(),
			importedAt: new Date().toISOString()
		});

		logger.info('[ReleaseGrab] Added streaming episode file to database', {
			seriesId,
			episodeId: episodeRow.id,
			fileId,
			relativePath
		});

		return {
			success: true,
			releaseName: release.title,
			episodesCovered: [episodeRow.id]
		};
	}

	/**
	 * Handle streaming season pack - create .strm files for all episodes in a season
	 */
	private async handleStreamingSeasonPack(
		release: EnhancedReleaseResult,
		options: {
			seriesId: string;
			seasonNumber: number;
			tmdbId: string;
			baseUrl: string;
			isUpgrade?: boolean;
			episodeIds?: string[];
		}
	): Promise<GrabResult> {
		const { seriesId, seasonNumber, tmdbId, baseUrl, isUpgrade } = options;

		logger.info('[ReleaseGrab] Handling streaming season pack', {
			seriesId,
			seasonNumber,
			title: release.title
		});

		// Get series for root folder path
		const show = await db.query.series.findFirst({
			where: eq(series.id, seriesId),
			with: { rootFolder: true }
		});

		if (!show || !show.rootFolder) {
			return { success: false, error: 'Series or root folder not found' };
		}

		// Create .strm files for all episodes in the season
		const strmResult = await strmService.createSeasonStrmFiles({
			seriesId,
			seasonNumber,
			tmdbId,
			baseUrl
		});

		if (!strmResult.success || strmResult.results.length === 0) {
			logger.error('[ReleaseGrab] Failed to create season pack .strm files', {
				seriesId,
				seasonNumber,
				error: strmResult.error
			});
			return { success: false, error: strmResult.error || 'Failed to create .strm files' };
		}

		// Parse quality from release title
		const parsedRelease = parser.parse(release.title);
		const quality = {
			resolution: parsedRelease.resolution ?? '1080p',
			source: 'Streaming',
			codec: 'HLS',
			hdr: undefined
		};

		// Collect file info before starting transaction
		const episodeFileData: Array<{
			episodeId: string;
			episodeNumber: number;
			filePath: string;
			fileSize: number;
			relativePath: string;
			mediaInfo: Awaited<ReturnType<typeof mediaInfoService.extractMediaInfo>>;
		}> = [];

		// First pass: collect file info and validate (outside transaction)
		for (const epResult of strmResult.results) {
			if (!epResult.filePath) {
				logger.warn('[ReleaseGrab] Skipping episode without .strm file', {
					episodeId: epResult.episodeId,
					episodeNumber: epResult.episodeNumber,
					error: epResult.error
				});
				continue;
			}

			try {
				const stats = statSync(epResult.filePath);
				const mediaInfo = await mediaInfoService.extractMediaInfo(epResult.filePath);
				const relativePath = relative(show.rootFolder!.path, epResult.filePath);

				episodeFileData.push({
					episodeId: epResult.episodeId,
					episodeNumber: epResult.episodeNumber,
					filePath: epResult.filePath,
					fileSize: Number(stats.size),
					relativePath,
					mediaInfo
				});
			} catch (error) {
				logger.error('[ReleaseGrab] Failed to get file info for episode', {
					episodeId: epResult.episodeId,
					episodeNumber: epResult.episodeNumber,
					error: error instanceof Error ? error.message : 'Unknown error'
				});
			}
		}

		if (episodeFileData.length === 0) {
			// Clean up created .strm files since we can't proceed
			for (const epResult of strmResult.results) {
				if (epResult.filePath) {
					try {
						await unlink(epResult.filePath);
					} catch {
						// Ignore cleanup errors
					}
				}
			}
			return { success: false, error: 'Failed to get file info for any episodes' };
		}

		const createdEpisodeIds: string[] = [];
		const createdFileIds: string[] = [];
		let totalSize = 0;

		// Use transaction for all database operations to ensure atomicity
		try {
			await db.transaction(async (tx) => {
				for (const epData of episodeFileData) {
					// Delete existing episode file if this is an upgrade
					if (isUpgrade) {
						const allSeriesFiles = await tx.query.episodeFiles.findMany({
							where: eq(episodeFiles.seriesId, seriesId)
						});
						const existingFiles = allSeriesFiles.filter((f) =>
							f.episodeIds?.includes(epData.episodeId)
						);
						for (const oldFile of existingFiles) {
							// Delete physical file from disk (best effort)
							const oldFilePath = join(show.rootFolder!.path, show.path, oldFile.relativePath);
							try {
								if (await fileExists(oldFilePath)) {
									await unlink(oldFilePath);
									logger.debug('[ReleaseGrab] Deleted old episode file from disk', {
										episodeId: epData.episodeId,
										path: oldFilePath
									});
								}
							} catch (deleteError) {
								logger.warn(
									'[ReleaseGrab] Failed to delete old episode file from disk (continuing)',
									{
										path: oldFilePath,
										error: deleteError instanceof Error ? deleteError.message : String(deleteError)
									}
								);
							}
							// Delete DB record
							await tx.delete(episodeFiles).where(eq(episodeFiles.id, oldFile.id));
							logger.debug('[ReleaseGrab] Deleted old episode file record for streaming upgrade', {
								episodeId: epData.episodeId,
								oldFileId: oldFile.id
							});
						}
					}

					// Create episode file record
					const fileId = randomUUID();
					await tx.insert(episodeFiles).values({
						id: fileId,
						seriesId,
						seasonNumber,
						episodeIds: [epData.episodeId],
						relativePath: epData.relativePath,
						size: epData.fileSize,
						dateAdded: new Date().toISOString(),
						sceneName: release.title,
						releaseGroup: parsedRelease.releaseGroup ?? 'Streaming',
						quality,
						mediaInfo: epData.mediaInfo
					});

					// Update episode hasFile flag
					await tx.update(episodes).set({ hasFile: true }).where(eq(episodes.id, epData.episodeId));

					createdEpisodeIds.push(epData.episodeId);
					createdFileIds.push(fileId);
					totalSize += epData.fileSize;

					logger.debug('[ReleaseGrab] Created episode file record', {
						episodeId: epData.episodeId,
						episodeNumber: epData.episodeNumber,
						fileId
					});
				}

				// Create single history record for the entire season pack
				await tx.insert(downloadHistory).values({
					title: release.title,
					indexerId: release.indexerId,
					indexerName: release.indexerName,
					protocol: 'streaming',
					seriesId,
					episodeIds: createdEpisodeIds,
					seasonNumber,
					status: 'streaming',
					size: totalSize,
					quality,
					episodeFileIds: createdFileIds,
					grabbedAt: new Date().toISOString(),
					importedAt: new Date().toISOString()
				});
			});
		} catch (txError) {
			// Transaction failed - clean up created .strm files
			logger.error('[ReleaseGrab] Transaction failed for streaming season pack, cleaning up', {
				seriesId,
				seasonNumber,
				error: txError instanceof Error ? txError.message : 'Unknown error'
			});

			for (const epData of episodeFileData) {
				try {
					await unlink(epData.filePath);
					logger.debug('[ReleaseGrab] Cleaned up .strm file after transaction failure', {
						path: epData.filePath
					});
				} catch {
					// Ignore cleanup errors
				}
			}

			return {
				success: false,
				error: txError instanceof Error ? txError.message : 'Database transaction failed'
			};
		}

		if (createdFileIds.length === 0) {
			return { success: false, error: 'Failed to create any episode file records' };
		}

		logger.info('[ReleaseGrab] Created streaming season pack files', {
			seriesId,
			seasonNumber,
			episodesCreated: createdFileIds.length,
			totalEpisodes: strmResult.results.length
		});

		return {
			success: true,
			releaseName: release.title,
			episodesCovered: createdEpisodeIds
		};
	}

	/**
	 * Delete existing movie files (for upgrade handling)
	 */
	private async deleteExistingMovieFiles(
		movieId: string,
		rootFolderPath: string,
		moviePath: string
	): Promise<void> {
		const existingFiles = await db.query.movieFiles.findMany({
			where: eq(movieFiles.movieId, movieId)
		});

		for (const oldFile of existingFiles) {
			// Delete physical file from disk
			const oldFilePath = join(rootFolderPath, moviePath, oldFile.relativePath);
			try {
				if (await fileExists(oldFilePath)) {
					await unlink(oldFilePath);
					logger.info('[ReleaseGrab] Deleted old movie file from disk', {
						movieId,
						path: oldFilePath
					});
				}
			} catch (deleteError) {
				logger.warn('[ReleaseGrab] Failed to delete old file from disk (continuing)', {
					path: oldFilePath,
					error: deleteError instanceof Error ? deleteError.message : String(deleteError)
				});
			}
			// Delete DB record
			await db.delete(movieFiles).where(eq(movieFiles.id, oldFile.id));
			logger.info('[ReleaseGrab] Deleted old movie file record for streaming upgrade', {
				movieId,
				oldFileId: oldFile.id
			});
		}
	}

	/**
	 * Delete existing episode files (for upgrade handling)
	 */
	private async deleteExistingEpisodeFiles(
		seriesId: string,
		episodeId: string,
		rootFolderPath: string,
		seriesPath: string
	): Promise<void> {
		// Episode files use episodeIds array, find files containing this episode
		const allSeriesFiles = await db.query.episodeFiles.findMany({
			where: eq(episodeFiles.seriesId, seriesId)
		});
		const existingFiles = allSeriesFiles.filter((f) => f.episodeIds?.includes(episodeId));

		for (const oldFile of existingFiles) {
			// Delete physical file from disk
			const oldFilePath = join(rootFolderPath, seriesPath, oldFile.relativePath);
			try {
				if (await fileExists(oldFilePath)) {
					await unlink(oldFilePath);
					logger.info('[ReleaseGrab] Deleted old episode file from disk', {
						episodeId,
						path: oldFilePath
					});
				}
			} catch (deleteError) {
				logger.warn('[ReleaseGrab] Failed to delete old episode file from disk (continuing)', {
					path: oldFilePath,
					error: deleteError instanceof Error ? deleteError.message : String(deleteError)
				});
			}
			// Delete DB record
			await db.delete(episodeFiles).where(eq(episodeFiles.id, oldFile.id));
			logger.info('[ReleaseGrab] Deleted old episode file record for streaming upgrade', {
				episodeId,
				oldFileId: oldFile.id
			});
		}
	}
}

// Singleton instance
let serviceInstance: ReleaseGrabService | null = null;

/**
 * Get the ReleaseGrabService singleton
 */
export function getReleaseGrabService(): ReleaseGrabService {
	if (!serviceInstance) {
		serviceInstance = new ReleaseGrabService();
	}
	return serviceInstance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetReleaseGrabService(): void {
	serviceInstance = null;
}

// Also export the class for type usage
export { ReleaseGrabService };
