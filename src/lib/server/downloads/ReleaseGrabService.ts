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
import { checkNzbAvailability } from './nzb/NzbAvailabilityChecker.js';
import { strmService, StrmService, getStreamingBaseUrl } from '$lib/server/streaming/index.js';
import { getNzbMountManager } from '$lib/server/streaming/nzb/index.js';
import { isMediaFile } from '$lib/server/streaming/usenet/types';
import { fileExists } from '$lib/server/downloadClients/import/index.js';
import { mediaInfoService } from '$lib/server/library/media-info.js';
import { monitoringScheduler } from '$lib/server/monitoring/MonitoringScheduler.js';
import { searchSubtitlesForNewMedia } from '$lib/server/subtitles/services/SubtitleImportService.js';
import { getIndexerManager } from '$lib/server/indexers/IndexerManager.js';
import { createChildLogger } from '$lib/logging';
import { db } from '$lib/server/db/index.js';
import {
	movies,
	movieFiles,
	series,
	episodes,
	episodeFiles,
	downloadHistory,
	rootFolders
} from '$lib/server/db/schema.js';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { statSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { EnhancedReleaseResult } from '$lib/server/indexers/types';
import { categoryMatchesSearchType, getCategoryContentType } from '$lib/server/indexers/types';
import type { DownloadInfo } from '$lib/server/downloadClients/core/interfaces.js';
import { blocklistService } from '$lib/server/monitoring/specifications/BlocklistSpecification.js';
import { libraryMediaEvents } from '$lib/server/library/LibraryMediaEvents';

const logger = createChildLogger({ module: 'ReleaseGrabService' });
const parser = new ReleaseParser();

type EpisodeFileUpsertInput = Omit<typeof episodeFiles.$inferInsert, 'id'> & { id?: string };
type EpisodeFileWriteExecutor = Pick<typeof db, 'select' | 'update' | 'insert'>;

/**
 * Upsert episode file by (seriesId, relativePath) and return canonical row id.
 */
async function upsertEpisodeFileByPath(
	executor: EpisodeFileWriteExecutor,
	record: EpisodeFileUpsertInput
): Promise<string> {
	const { id: requestedId, ...values } = record;

	const existing = await executor
		.select({ id: episodeFiles.id })
		.from(episodeFiles)
		.where(
			and(
				eq(episodeFiles.seriesId, record.seriesId),
				eq(episodeFiles.relativePath, record.relativePath)
			)
		)
		.limit(1);

	if (existing.length > 0) {
		await executor.update(episodeFiles).set(values).where(eq(episodeFiles.id, existing[0].id));
		return existing[0].id;
	}

	const id = requestedId ?? randomUUID();
	await executor.insert(episodeFiles).values({ id, ...values });
	return id;
}

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
	/** Stream usenet content directly instead of downloading (creates .strm files) */
	streamUsenet?: boolean;
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

		// Safety check: validate release category matches media type
		// This prevents downloading audio/music releases for movie/TV searches
		if (release.categories && release.categories.length > 0) {
			const searchType = mediaType === 'movie' ? 'movie' : 'tv';
			const hasMatchingCategory = release.categories.some((cat) =>
				categoryMatchesSearchType(cat, searchType)
			);

			if (!hasMatchingCategory) {
				const actualContentType = getCategoryContentType(release.categories[0]);
				logger.error(
					'[ReleaseGrab] BLOCKED: Release category mismatch - potential wrong content type',
					{
						title: release.title,
						expectedType: mediaType,
						actualContentType,
						categories: release.categories
					}
				);
				return {
					success: false,
					error: `Category mismatch: ${actualContentType} release cannot be grabbed for ${mediaType}`
				};
			}
		}

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
					// Check if user wants to stream instead of download
					if (options.streamUsenet) {
						return await this.handleNzbStreamingGrab(release, options);
					}
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

		// Determine protocol from release (default to torrent for backwards compatibility)
		const protocol = release.protocol === 'usenet' ? 'usenet' : 'torrent';
		const clientResult = await clientManager.getClientForProtocol(protocol);

		if (!clientResult) {
			logger.warn('[ReleaseGrab] No enabled download client for protocol', { protocol });
			return { success: false, error: `No enabled ${protocol} download client configured` };
		}

		const { client: clientConfig, instance: clientInstance } = clientResult;

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
			title: release.title,
			commentsUrl: release.commentsUrl
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
			size: release.size,
			releaseGroup: parsed.releaseGroup ?? undefined,
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
					const downloadResult = await indexer.downloadTorrent(release.downloadUrl, {
						releaseDetailsUrl: release.commentsUrl
					});
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

						// Check article availability on NNTP servers before sending to client
						const availability = await checkNzbAvailability(nzbContent);
						if (availability.skipped) {
							// NNTP not available - log warning but continue
							logger.warn('[ReleaseGrab] NZB availability check skipped - NNTP unavailable', {
								title: release.title,
								reason: availability.reason
							});
						} else if (!availability.available) {
							logger.warn('[ReleaseGrab] NZB availability check failed', {
								title: release.title,
								completionPercentage: availability.completionPercentage,
								checkedSegments: availability.checkedSegments,
								missingSegments: availability.missingSegments
							});

							// Auto-blocklist this release from this specific indexer
							// Uses 72-hour expiry in case the release becomes available later
							try {
								await blocklistService.addToBlocklist(
									{
										title: release.title,
										indexerId: release.indexerId,
										size: release.size,
										protocol: 'usenet'
									},
									{
										movieId,
										seriesId,
										episodeIds,
										reason: 'download_failed',
										message: `Unavailable on usenet: ${availability.completionPercentage}% articles found`,
										expiresInHours: 72
									}
								);
								logger.info('[ReleaseGrab] Auto-blocklisted unavailable release', {
									title: release.title,
									indexer: release.indexerName,
									expiresInHours: 72
								});
							} catch (blocklistError) {
								logger.warn('[ReleaseGrab] Failed to add to blocklist', {
									title: release.title,
									error: blocklistError instanceof Error ? blocklistError.message : 'Unknown'
								});
							}

							return {
								success: false,
								error: `Release unavailable on usenet: ${availability.completionPercentage}% of articles found. Release may be incomplete or DMCA'd.`
							};
						} else {
							logger.debug('[ReleaseGrab] NZB availability check passed', {
								title: release.title,
								completionPercentage: availability.completionPercentage,
								checkedSegments: availability.checkedSegments
							});
						}
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
			size: release.size,
			releaseGroup: parsed.releaseGroup ?? undefined,
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
	 * Handle NZB streaming - create mount and .strm files for direct NNTP streaming
	 * Bypasses download client, streams content on-demand via NNTP
	 */
	private async handleNzbStreamingGrab(
		release: EnhancedReleaseResult,
		options: GrabOptions
	): Promise<GrabResult> {
		const { mediaType, movieId, seriesId, episodeIds, seasonNumber } = options;

		logger.info('[ReleaseGrab] Handling NZB streaming grab', {
			title: release.title,
			mediaType,
			movieId,
			seriesId
		});

		// Fetch NZB content through the indexer
		let nzbContent: Buffer | undefined;

		if (!release.downloadUrl) {
			return { success: false, error: 'No download URL for NZB' };
		}

		const indexerManager = await getIndexerManager();
		const indexer = release.indexerId
			? await indexerManager.getIndexerInstance(release.indexerId)
			: null;

		if (indexer && indexer.downloadTorrent) {
			try {
				const downloadResult = await indexer.downloadTorrent(release.downloadUrl, {
					releaseDetailsUrl: release.commentsUrl
				});
				if (downloadResult.success && downloadResult.data) {
					nzbContent = downloadResult.data;
				} else {
					return { success: false, error: `Failed to fetch NZB: ${downloadResult.error}` };
				}
			} catch (fetchError) {
				const message = fetchError instanceof Error ? fetchError.message : 'Unknown error';
				return { success: false, error: `Error fetching NZB: ${message}` };
			}
		} else {
			return { success: false, error: 'No indexer available to fetch NZB' };
		}

		// Create a mount for this NZB
		const mountManager = getNzbMountManager();
		let mount;

		try {
			mount = await mountManager.createMount({
				title: release.title,
				nzbContent,
				indexerId: release.indexerId,
				downloadUrl: release.downloadUrl,
				movieId,
				seriesId,
				seasonNumber,
				episodeIds
			});
		} catch (mountError) {
			const message = mountError instanceof Error ? mountError.message : 'Unknown error';
			logger.error('[ReleaseGrab] Failed to create NZB mount', {
				title: release.title,
				error: message
			});
			return { success: false, error: `Failed to create stream mount: ${message}` };
		}

		// Get base URL for streaming
		const baseUrl = await getStreamingBaseUrl('http://localhost:5173');

		// Find media files in the mount
		const mediaFiles = mount.mediaFiles.filter((f) => isMediaFile(f.name) || f.isRar);

		if (mediaFiles.length === 0) {
			logger.warn('[ReleaseGrab] No media files found in NZB', { title: release.title });
			return { success: false, error: 'No media files found in NZB' };
		}

		// Create .strm files for media files
		let strmCreated = 0;

		if (mediaType === 'movie' && movieId) {
			// Single movie file - use first media file
			const file = mediaFiles[0];
			const streamUrl = `${baseUrl}/api/streaming/usenet/${mount.id}/${file.index}`;

			const result = await this.createNzbStrmFile({
				movieId,
				fileName: file.name,
				streamUrl
			});

			if (result.success) {
				strmCreated++;
				logger.info('[ReleaseGrab] Created NZB stream file for movie', {
					title: release.title,
					filePath: result.filePath
				});
			}
		} else if (mediaType === 'tv' && seriesId) {
			// TV - match files to episodes
			for (const file of mediaFiles) {
				const parsed = parser.parse(file.name);
				const epInfo = parsed.episode;
				if (!epInfo?.season || !epInfo.episodes?.length) continue;

				const streamUrl = `${baseUrl}/api/streaming/usenet/${mount.id}/${file.index}`;

				// Create strm for first episode in file
				const result = await this.createNzbStrmFileForEpisode({
					seriesId,
					seasonNumber: epInfo.season,
					episodeNumber: epInfo.episodes[0],
					fileName: file.name,
					streamUrl
				});

				if (result.success) {
					strmCreated++;
				}
			}
		}

		if (strmCreated === 0) {
			return { success: false, error: 'Failed to create any stream files' };
		}

		logger.info('[ReleaseGrab] NZB streaming grab completed', {
			title: release.title,
			mountId: mount.id,
			filesCreated: strmCreated
		});

		return {
			success: true,
			releaseName: release.title,
			episodesCovered: episodeIds
		};
	}

	/**
	 * Create a .strm file for an NZB movie stream
	 */
	private async createNzbStrmFile(options: {
		movieId: string;
		fileName: string;
		streamUrl: string;
	}): Promise<{ success: boolean; filePath?: string; error?: string }> {
		const { movieId, streamUrl } = options;

		// Get movie details
		const movie = await db.query.movies.findFirst({
			where: eq(movies.id, movieId)
		});

		if (!movie || !movie.rootFolderId) {
			return { success: false, error: 'Movie or root folder not found' };
		}

		const rootFolder = await db.query.rootFolders.findFirst({
			where: eq(rootFolders.id, movie.rootFolderId)
		});

		if (!rootFolder) {
			return { success: false, error: 'Root folder not found' };
		}

		// Build file path
		const safeName = this.sanitizeFilename(movie.title);
		const year = movie.year ?? 'Unknown';
		const folderName = movie.path || `${safeName} (${year})`;
		const folderPath = join(rootFolder.path, folderName);

		// Create folder if needed
		if (!existsSync(folderPath)) {
			mkdirSync(folderPath, { recursive: true });
		}

		// Create .strm file
		const strmFileName = `${safeName} (${year}).strm`;
		const strmPath = join(folderPath, strmFileName);

		writeFileSync(strmPath, streamUrl, 'utf8');

		return { success: true, filePath: strmPath };
	}

	/**
	 * Create a .strm file for an NZB TV episode stream
	 */
	private async createNzbStrmFileForEpisode(options: {
		seriesId: string;
		seasonNumber: number;
		episodeNumber: number;
		fileName: string;
		streamUrl: string;
	}): Promise<{ success: boolean; filePath?: string; error?: string }> {
		const { seriesId, seasonNumber, episodeNumber, streamUrl } = options;

		// Get series details
		const seriesRecord = await db.query.series.findFirst({
			where: eq(series.id, seriesId)
		});

		if (!seriesRecord || !seriesRecord.rootFolderId) {
			return { success: false, error: 'Series or root folder not found' };
		}

		const rootFolder = await db.query.rootFolders.findFirst({
			where: eq(rootFolders.id, seriesRecord.rootFolderId)
		});

		if (!rootFolder) {
			return { success: false, error: 'Root folder not found' };
		}

		// Build path
		const safeName = this.sanitizeFilename(seriesRecord.title);
		const year = seriesRecord.year ?? 'Unknown';
		const seriesFolder = seriesRecord.path || `${safeName} (${year})`;
		const seasonFolder = `Season ${seasonNumber.toString().padStart(2, '0')}`;
		const folderPath = join(rootFolder.path, seriesFolder, seasonFolder);

		// Create folder if needed
		if (!existsSync(folderPath)) {
			mkdirSync(folderPath, { recursive: true });
		}

		// Create .strm file
		const episodeCode = `S${seasonNumber.toString().padStart(2, '0')}E${episodeNumber.toString().padStart(2, '0')}`;
		const strmFileName = `${safeName} - ${episodeCode}.strm`;
		const strmPath = join(folderPath, strmFileName);

		writeFileSync(strmPath, streamUrl, 'utf8');

		return { success: true, filePath: strmPath };
	}

	/**
	 * Sanitize a filename for filesystem use
	 */
	private sanitizeFilename(name: string): string {
		return name
			.replace(/[<>:"/\\|?*]/g, '')
			.replace(/\s+/g, ' ')
			.trim();
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
			let allowStrmProbe = true;
			if (mediaType === 'movie' && movieId) {
				const movie = await db.query.movies.findFirst({
					where: eq(movies.id, movieId)
				});
				allowStrmProbe = movie?.scoringProfileId !== 'streamer';
			} else if (mediaType === 'tv' && seriesId) {
				const show = await db.query.series.findFirst({
					where: eq(series.id, seriesId)
				});
				allowStrmProbe = show?.scoringProfileId !== 'streamer';
			}
			const mediaInfo = await mediaInfoService.extractMediaInfo(filePath, { allowStrmProbe });

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
		libraryMediaEvents.emitMovieUpdated(movieId);

		void this.triggerSubtitleSearch('movie', movieId);

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

		// Create/update episode file record
		const fileId = await upsertEpisodeFileByPath(db, {
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
		libraryMediaEvents.emitSeriesUpdated(seriesId);

		void this.triggerSubtitleSearch('episode', episodeRow.id);

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
		const allowStrmProbe = show.scoringProfileId !== 'streamer';

		// Check which episodes already have files (to avoid race condition with watcher)
		const seasonEpisodes = await db.query.episodes.findMany({
			where: and(eq(episodes.seriesId, seriesId), eq(episodes.seasonNumber, seasonNumber))
		});
		const episodesNeedingFiles = isUpgrade
			? seasonEpisodes // For upgrades, process all episodes
			: seasonEpisodes.filter((ep) => !ep.hasFile);

		if (episodesNeedingFiles.length === 0) {
			logger.info('[ReleaseGrab] All episodes already have files, skipping season pack', {
				seriesId,
				seasonNumber,
				totalEpisodes: seasonEpisodes.length
			});
			return {
				success: true,
				releaseName: release.title,
				episodesCovered: seasonEpisodes.map((ep) => ep.id)
			};
		}

		// Create .strm files only for episodes that need them
		const strmResult = await strmService.createSeasonStrmFiles({
			seriesId,
			seasonNumber,
			tmdbId,
			baseUrl,
			episodeIds: episodesNeedingFiles.map((ep) => ep.id)
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
				const mediaInfo = await mediaInfoService.extractMediaInfo(epResult.filePath, {
					allowStrmProbe
				});
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
			// Don't clean up .strm files - let the LibraryWatcher try to link them
			// Even if we failed to get file info, the watcher might succeed
			logger.warn(
				'[ReleaseGrab] Failed to get file info for any episodes, keeping files for watcher',
				{
					seriesId,
					seasonNumber,
					filesCreated: strmResult.results.filter((r) => r.filePath).length
				}
			);
			return { success: false, error: 'Failed to get file info for any episodes' };
		}

		const createdEpisodeIds: string[] = [];
		const createdFileIds: string[] = [];
		let totalSize = 0;

		// Use transaction for all database operations to ensure atomicity
		// Handle race condition: LibraryWatcher may have already linked some files
		try {
			await db.transaction(async (tx) => {
				for (const epData of episodeFileData) {
					// Check if file was already linked by the watcher during our operation
					const existingFile = await tx.query.episodeFiles.findFirst({
						where: eq(episodeFiles.relativePath, epData.relativePath)
					});

					if (existingFile && !isUpgrade) {
						// Watcher already linked this file - skip insert, just record the IDs
						logger.debug('[ReleaseGrab] File already linked by watcher, using existing record', {
							episodeId: epData.episodeId,
							existingFileId: existingFile.id,
							relativePath: epData.relativePath
						});
						createdFileIds.push(existingFile.id);
						createdEpisodeIds.push(epData.episodeId);
						totalSize += epData.fileSize;
						continue;
					}

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

					// Create/update episode file record
					const fileId = await upsertEpisodeFileByPath(tx, {
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

				// Only create history record if we did any work
				if (createdFileIds.length > 0) {
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
				}
			});
		} catch (txError) {
			// Transaction failed - do NOT delete files, let LibraryWatcher handle them
			// Deleting files here causes a race condition where E01 gets deleted before
			// the watcher has a chance to process and link it
			logger.error('[ReleaseGrab] Transaction failed for streaming season pack', {
				seriesId,
				seasonNumber,
				error: txError instanceof Error ? txError.message : 'Unknown error',
				filesCreated: episodeFileData.length,
				note: 'Keeping .strm files for LibraryWatcher to process'
			});

			// Don't delete files - the LibraryWatcher will detect them and link properly
			// This avoids the race condition where files get deleted before watcher processes them

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
		libraryMediaEvents.emitSeriesUpdated(seriesId);

		void this.triggerSubtitleSearchForEpisodes(createdEpisodeIds);

		return {
			success: true,
			releaseName: release.title,
			episodesCovered: createdEpisodeIds
		};
	}

	private async triggerSubtitleSearch(
		mediaType: 'movie' | 'episode',
		mediaId: string
	): Promise<void> {
		try {
			const settings = await monitoringScheduler.getSettings();
			if (!settings.subtitleSearchOnImportEnabled) {
				return;
			}
			await searchSubtitlesForNewMedia(mediaType, mediaId);
		} catch (error) {
			logger.warn('[ReleaseGrab] Subtitle search on import failed', {
				mediaType,
				mediaId,
				error: error instanceof Error ? error.message : String(error)
			});
		}
	}

	private async triggerSubtitleSearchForEpisodes(episodeIds: string[]): Promise<void> {
		if (episodeIds.length === 0) {
			return;
		}

		try {
			const settings = await monitoringScheduler.getSettings();
			if (!settings.subtitleSearchOnImportEnabled) {
				return;
			}

			const results = await Promise.allSettled(
				episodeIds.map((episodeId) => searchSubtitlesForNewMedia('episode', episodeId))
			);
			const failed = results.filter((result) => result.status === 'rejected');

			if (failed.length > 0) {
				logger.warn('[ReleaseGrab] Subtitle search failed for some episodes', {
					total: episodeIds.length,
					failed: failed.length
				});
			}
		} catch (error) {
			logger.warn('[ReleaseGrab] Subtitle search on import failed for episodes', {
				total: episodeIds.length,
				error: error instanceof Error ? error.message : String(error)
			});
		}
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
