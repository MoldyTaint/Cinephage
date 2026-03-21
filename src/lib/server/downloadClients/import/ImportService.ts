/**
 * Import Service
 *
 * Handles importing completed downloads into the media library.
 * - Detects video files in download folder
 * - Hardlinks/copies to appropriate library folder
 * - Creates database records for imported files
 * - Handles upgrades (replaces existing lower-quality files)
 */

import { EventEmitter } from 'events';
import { stat } from 'fs/promises';
import { join, basename, dirname, extname } from 'path';
import { randomUUID } from 'node:crypto';
import { db } from '$lib/server/db';
import { eventBuffer } from '$lib/server/sse/EventBuffer.js';
import {
	downloadQueue,
	downloadHistory,
	movies,
	movieFiles,
	series,
	seasons,
	episodes,
	episodeFiles,
	rootFolders,
	downloadClients
} from '$lib/server/db/schema';
import { eq, and, or, inArray, gte } from 'drizzle-orm';
import { downloadMonitor } from '../monitoring/DownloadMonitorService';
import {
	transferFileWithMode,
	findVideoFiles,
	ensureDirectory,
	fileExists,
	VIDEO_EXTENSIONS,
	ImportMode
} from './FileTransfer';
import { getDownloadClientManager } from '../DownloadClientManager';
import { unlink, rm } from 'fs/promises';
import { ReleaseParser } from '$lib/server/indexers/parser/ReleaseParser';
import { mediaInfoService, MediaInfoService } from '$lib/server/library/media-info';
import {
	NamingService,
	releaseToNamingInfo,
	type MediaNamingInfo
} from '$lib/server/library/naming/NamingService';
import { namingSettingsService } from '$lib/server/library/naming/NamingSettingsService';
import { createChildLogger } from '$lib/logging';
import {
	DOWNLOAD,
	EXCLUDED_FILE_PATTERNS,
	DANGEROUS_EXTENSIONS,
	EXECUTABLE_EXTENSIONS
} from '$lib/config/constants';
import { ImportWorker, workerManager } from '$lib/server/workers';
import { monitoringScheduler } from '$lib/server/monitoring/MonitoringScheduler.js';
import { searchSubtitlesForNewMedia } from '$lib/server/subtitles/services/SubtitleImportService.js';
import { libraryMediaEvents } from '$lib/server/library/LibraryMediaEvents';
import {
	getMediaParseStem,
	matchEpisodesByIdentifier,
	resolveTvEpisodeIdentifier,
	type ResolvedTvEpisodeIdentifier
} from '$lib/server/library/tv-episode-resolver.js';
import { isImportedQueueStatus, type QueueStatus } from '$lib/types/queue';

const logger = createChildLogger({ logDomain: 'imports' as const });

/**
 * Import result for a single file
 */
export interface ImportResult {
	success: boolean;
	sourcePath: string;
	destPath?: string;
	fileId?: string;
	error?: string;
	wasUpgrade?: boolean;
	replacedFileId?: string;
	replacedFileIds?: string[]; // For upgrades that delete multiple old files
	sceneName?: string;
	releaseGroup?: string;
	quality?: {
		resolution?: string;
		source?: string;
		codec?: string;
		hdr?: string;
	};
}

/**
 * Import job result
 */
export interface ImportJobResult {
	success: boolean;
	queueItemId: string;
	importedFiles: ImportResult[];
	failedFiles: ImportResult[];
	totalSize: number;
	error?: string;
}

interface ImportableFileOptions {
	allowStrmSmall?: boolean;
	preferNonStrm?: boolean;
}

/**
 * Result of scanning for dangerous/executable files in a download
 * Following Radarr's DownloadedMovieImportService pattern
 * @see https://github.com/Radarr/Radarr/blob/develop/src/NzbDrone.Core/MediaFiles/DownloadedMovieImportService.cs
 */
interface DangerousFileResult {
	hasDangerousFiles: boolean;
	dangerousFiles: Array<{ path: string; extension: string; reason: 'dangerous' | 'executable' }>;
}

/**
 * Import retry configuration
 */
const MAX_IMPORT_ATTEMPTS = 10;
const IMPORT_RETRY_DELAY_MS = 30_000; // 30 seconds between retries

/**
 * Pending import info for retry tracking
 */
interface PendingImportInfo {
	attempts: number;
	lastAttempt: number;
	reason: string;
}

/**
 * Import request result
 */
export type ImportRequestResult =
	| { status: 'queued' }
	| { status: 'already_importing' }
	| { status: 'already_imported' }
	| { status: 'pending_retry'; reason: string }
	| { status: 'failed'; reason: string };

/**
 * Import Service
 *
 * Central service for importing completed downloads into the media library.
 * All import requests should go through this service to ensure proper
 * deduplication and sequential processing.
 */
export class ImportService extends EventEmitter {
	private static instance: ImportService | null = null;
	private parser: ReleaseParser;
	private isProcessing = false;
	private processingQueue: string[] = [];

	// Pending imports that need retry (e.g., SABnzbd path not ready yet)
	private pendingImports: Map<string, PendingImportInfo> = new Map();

	// Timer for retrying pending imports
	private retryTimer: ReturnType<typeof setInterval> | null = null;

	private constructor() {
		super();
		this.parser = new ReleaseParser();
	}

	private isAlreadyImportedStatus(status: QueueStatus | string | null | undefined): boolean {
		return status === 'imported' || status === 'seeding-imported';
	}

	static getInstance(): ImportService {
		if (!ImportService.instance) {
			ImportService.instance = new ImportService();
		}
		return ImportService.instance;
	}

	/** Reset the singleton instance (for testing) */
	static resetInstance(): void {
		if (ImportService.instance) {
			ImportService.instance.stop();
		}
		ImportService.instance = null;
	}

	/**
	 * Start the import service
	 * Sets up retry timer and checks for pending imports from previous runs.
	 */
	start(): void {
		logger.info('Starting import service');

		// Start retry timer for pending imports (e.g., SABnzbd path not ready)
		if (!this.retryTimer) {
			this.retryTimer = setInterval(() => {
				this.retryPendingImports().catch((err) => {
					logger.warn(
						{
							error: err instanceof Error ? err.message : String(err)
						},
						'Error retrying pending imports'
					);
				});
			}, IMPORT_RETRY_DELAY_MS);
		}

		// Check for any completed items that weren't imported (from previous runs)
		this.checkPendingImports();
	}

	/**
	 * Stop the import service
	 */
	stop(): void {
		if (this.retryTimer) {
			clearInterval(this.retryTimer);
			this.retryTimer = null;
		}
		this.pendingImports.clear();
		this.processingQueue = [];
		logger.info('Stopped import service');
	}

	/**
	 * Check for downloads that completed but weren't imported
	 * This handles:
	 * - Usenet items with 'completed' status
	 * - Torrent items with 'paused' or 'seeding' status and 100% progress
	 *   (qBittorrent goes downloading -> seeding -> paused, never 'completed')
	 */
	private async checkPendingImports(): Promise<void> {
		// Find items that should have been imported:
		// 1. Status is 'completed' (usenet)
		// 2. Status is 'paused' or 'seeding' with progress >= 99% (torrents)
		const pendingItems = await db
			.select()
			.from(downloadQueue)
			.where(
				or(
					eq(downloadQueue.status, 'completed'),
					and(
						inArray(downloadQueue.status, ['paused', 'seeding']),
						gte(downloadQueue.progress, '0.99')
					)
				)
			);

		for (const item of pendingItems) {
			// Skip if no media linkage (can't import without knowing the target)
			if (!item.movieId && !item.seriesId) {
				continue;
			}
			// Skip if no output path
			if (!item.outputPath) {
				continue;
			}

			logger.info(
				{
					id: item.id,
					title: item.title,
					status: item.status,
					progress: item.progress
				},
				'Found pending import from previous run'
			);
			this.queueImport(item.id);
		}
	}

	/**
	 * Queue an import job (internal - skips validation)
	 */
	queueImport(queueItemId: string): void {
		if (!this.processingQueue.includes(queueItemId)) {
			this.processingQueue.push(queueItemId);
			this.processNext();
		}
	}

	/**
	 * Request an import for a completed download.
	 * This is the PRIMARY entry point for triggering imports from outside.
	 *
	 * Validates the download is ready for import (has valid path, not already
	 * importing, etc.) and either queues it or marks it for retry.
	 *
	 * @param queueItemId - ID of the queue item to import
	 * @returns Result indicating what action was taken
	 */
	async requestImport(queueItemId: string): Promise<ImportRequestResult> {
		// Check if already in processing queue
		if (this.processingQueue.includes(queueItemId)) {
			logger.debug({ queueItemId }, 'Import already queued');
			return { status: 'already_importing' };
		}

		// Get queue item from database
		const [queueItem] = await db
			.select()
			.from(downloadQueue)
			.where(eq(downloadQueue.id, queueItemId))
			.limit(1);

		if (!queueItem) {
			return { status: 'failed', reason: 'Queue item not found' };
		}

		// Don't import if already importing/imported
		if (queueItem.status === 'importing') {
			return { status: 'already_importing' };
		}
		if (this.isAlreadyImportedStatus(queueItem.status)) {
			this.pendingImports.delete(queueItemId);
			logger.debug(
				{
					queueItemId,
					status: queueItem.status
				},
				'Skipping import request for already imported item'
			);
			return { status: 'already_imported' };
		}

		// Need output path to import
		if (!queueItem.outputPath) {
			this.trackPendingImport(queueItemId, 'No output path');
			return { status: 'pending_retry', reason: 'No output path available' };
		}

		// Validate outputPath is not just the base download directory
		// SABnzbd queue items return empty paths initially, which map to just the base directory
		// This check prevents scanning the entire download folder
		const manager = getDownloadClientManager();
		const clients = await manager.getEnabledClients();
		const client = clients.find((c) => c.client.id === queueItem.downloadClientId);

		if (client?.client.downloadPathLocal) {
			const basePath = client.client.downloadPathLocal.replace(/\/+$/, '');
			const outputPath = queueItem.outputPath.replace(/\/+$/, '');

			// If outputPath equals the base path (or is shorter), it's invalid
			if (outputPath === basePath || outputPath.length <= basePath.length) {
				this.trackPendingImport(queueItemId, 'Invalid path - waiting for download client');
				return { status: 'pending_retry', reason: 'Path not ready yet' };
			}
		}

		// Path is valid, clear from pending and queue the import
		this.pendingImports.delete(queueItemId);

		logger.info(
			{
				queueId: queueItemId,
				title: queueItem.title,
				outputPath: queueItem.outputPath
			},
			'Queueing import for completed download'
		);

		this.queueImport(queueItemId);
		return { status: 'queued' };
	}

	/**
	 * Track a pending import that needs retry (path was invalid)
	 */
	private trackPendingImport(queueItemId: string, reason: string): void {
		const existing = this.pendingImports.get(queueItemId);
		const attempts = (existing?.attempts ?? 0) + 1;

		if (attempts > MAX_IMPORT_ATTEMPTS) {
			logger.error(
				{
					queueItemId,
					attempts,
					reason
				},
				'Max import retry attempts reached'
			);
			this.pendingImports.delete(queueItemId);
			// Mark as failed in the database
			downloadMonitor.markFailed(
				queueItemId,
				`Import failed after ${attempts} attempts: ${reason}`
			);
			return;
		}

		this.pendingImports.set(queueItemId, {
			attempts,
			lastAttempt: Date.now(),
			reason
		});

		logger.info(
			{
				queueItemId,
				attempts,
				reason
			},
			'Tracking pending import for retry'
		);
	}

	/**
	 * Retry pending imports that are ready
	 */
	private async retryPendingImports(): Promise<void> {
		const now = Date.now();

		for (const [queueItemId, info] of this.pendingImports) {
			// Skip if already in processing queue
			if (this.processingQueue.includes(queueItemId)) {
				continue;
			}

			// Skip if not ready for retry yet
			if (now - info.lastAttempt < IMPORT_RETRY_DELAY_MS) {
				continue;
			}

			// Check if item still exists and is in valid state
			const [queueItem] = await db
				.select({ status: downloadQueue.status })
				.from(downloadQueue)
				.where(eq(downloadQueue.id, queueItemId))
				.limit(1);

			if (
				!queueItem ||
				this.isAlreadyImportedStatus(queueItem.status) ||
				queueItem.status === 'removed' ||
				queueItem.status === 'failed'
			) {
				// Item no longer exists or is in terminal state
				this.pendingImports.delete(queueItemId);
				continue;
			}

			logger.info(
				{
					queueItemId,
					attempt: info.attempts + 1,
					reason: info.reason
				},
				'Retrying pending import'
			);

			// Try to request import again (will validate path and queue if ready)
			await this.requestImport(queueItemId);
		}
	}

	/**
	 * Process the next import in queue
	 */
	private async processNext(): Promise<void> {
		if (this.isProcessing || this.processingQueue.length === 0) {
			return;
		}

		this.isProcessing = true;
		const queueItemId = this.processingQueue.shift()!;

		try {
			await this.processImport(queueItemId);
		} catch (error) {
			logger.error(
				{
					queueItemId,
					error: error instanceof Error ? error.message : String(error)
				},
				'Import processing error'
			);
		}

		this.isProcessing = false;
		this.processNext();
	}

	/**
	 * Process a single import
	 */
	async processImport(queueItemId: string): Promise<ImportJobResult> {
		logger.info({ queueItemId }, 'Processing import');

		// Get queue item
		const [queueItem] = await db
			.select()
			.from(downloadQueue)
			.where(eq(downloadQueue.id, queueItemId))
			.limit(1);

		if (!queueItem) {
			return {
				success: false,
				queueItemId,
				importedFiles: [],
				failedFiles: [],
				totalSize: 0,
				error: 'Queue item not found'
			};
		}

		// Check if already imported
		if (isImportedQueueStatus(queueItem.status)) {
			return {
				success: true,
				queueItemId,
				importedFiles: [],
				failedFiles: [],
				totalSize: 0,
				error: 'Already imported'
			};
		}

		// Load download client for import options (if available)
		const [client] = queueItem.downloadClientId
			? await db
					.select()
					.from(downloadClients)
					.where(eq(downloadClients.id, queueItem.downloadClientId))
					.limit(1)
			: [];
		const importOptions = this.getImportOptions(client, queueItem);

		// Create ImportWorker for tracking
		const mediaType = queueItem.movieId ? 'movie' : 'episode';
		const worker = new ImportWorker({
			queueItemId,
			mediaType,
			title: queueItem.title
		});

		try {
			workerManager.spawnInBackground(worker);
		} catch (e) {
			// Concurrency limit reached - continue without worker tracking
			logger.warn(
				{
					queueItemId,
					error: e instanceof Error ? e.message : String(e)
				},
				'Could not create import worker'
			);
		}

		// Mark as importing using atomic operation
		// This prevents race conditions where two processes try to import the same item
		const markResult = await downloadMonitor.markImporting(queueItemId);

		if (markResult === 'already_importing') {
			worker.fail('Already being imported by another process');
			return {
				success: false,
				queueItemId,
				importedFiles: [],
				failedFiles: [],
				totalSize: 0,
				error: 'Already being imported by another process'
			};
		}

		if (markResult === 'already_imported') {
			worker.complete({ imported: 0, failed: 0, totalSize: 0 });
			return {
				success: true,
				queueItemId,
				importedFiles: [],
				failedFiles: [],
				totalSize: 0,
				error: 'Already imported'
			};
		}

		if (markResult === 'max_attempts') {
			worker.fail('Max import attempts exceeded');
			return {
				success: false,
				queueItemId,
				importedFiles: [],
				failedFiles: [],
				totalSize: 0,
				error: 'Max import attempts exceeded'
			};
		}

		if (markResult === 'not_found') {
			worker.fail('Queue item not found');
			return {
				success: false,
				queueItemId,
				importedFiles: [],
				failedFiles: [],
				totalSize: 0,
				error: 'Queue item not found'
			};
		}

		try {
			// Set source path
			const downloadPath = queueItem.outputPath || queueItem.clientDownloadPath;
			if (downloadPath) {
				worker.setSourcePath(downloadPath);
			}

			// Fetch download info from client to determine if we can move files
			// Seeding torrents can't be moved (canMoveFiles=false) - must use hardlink/copy
			// Usenet downloads can always be moved (canMoveFiles=true)
			let canMoveFiles = true; // Default to true (safe for usenet)

			if (client) {
				try {
					const clientManager = getDownloadClientManager();
					const clientInstance = await clientManager.getClientInstance(client.id);

					if (clientInstance) {
						const downloadId = queueItem.infoHash || queueItem.downloadId;
						const downloadInfo = await clientInstance.getDownload(downloadId);

						if (downloadInfo) {
							canMoveFiles = downloadInfo.canMoveFiles;
							logger.debug(
								{
									canMoveFiles,
									status: downloadInfo.status,
									protocol: queueItem.protocol,
									downloadId
								},
								'Determined import mode from download client'
							);
						}
					}
				} catch (err) {
					logger.warn(
						{
							error: err instanceof Error ? err.message : String(err),
							queueItemId
						},
						'Failed to get download info for import mode detection, defaulting to hardlink'
					);
					// If we can't determine, prefer hardlink/copy (safer for seeding)
					canMoveFiles = queueItem.protocol === 'usenet';
				}
			} else {
				// No client info, use protocol to guess
				canMoveFiles = queueItem.protocol === 'usenet';
			}

			// Determine what to import based on linked media
			let result: ImportJobResult;
			if (queueItem.movieId) {
				result = await this.importMovie(queueItem, worker, importOptions, canMoveFiles);
			} else if (queueItem.seriesId) {
				result = await this.importSeries(queueItem, worker, importOptions, canMoveFiles);
			} else {
				throw new Error('No linked movie or series');
			}

			// Complete worker
			if (result.success) {
				worker.complete({
					imported: result.importedFiles.length,
					failed: result.failedFiles.length,
					totalSize: result.totalSize
				});
			} else {
				worker.fail(result.error || 'Import failed');
			}

			return result;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			await downloadMonitor.markFailed(queueItemId, errorMessage);
			worker.fail(errorMessage);

			return {
				success: false,
				queueItemId,
				importedFiles: [],
				failedFiles: [],
				totalSize: 0,
				error: errorMessage
			};
		}
	}

	/**
	 * Import a movie download
	 *
	 * @param queueItem - Queue item to import
	 * @param worker - Import worker for tracking
	 * @param importOptions - File detection options
	 * @param canMoveFiles - Whether files can be moved (false for seeding torrents)
	 */
	private async importMovie(
		queueItem: typeof downloadQueue.$inferSelect,
		worker: ImportWorker,
		importOptions: ImportableFileOptions,
		canMoveFiles: boolean
	): Promise<ImportJobResult> {
		const result: ImportJobResult = {
			success: false,
			queueItemId: queueItem.id,
			importedFiles: [],
			failedFiles: [],
			totalSize: 0
		};

		// Get movie info
		const [movie] = await db
			.select()
			.from(movies)
			.where(eq(movies.id, queueItem.movieId!))
			.limit(1);

		if (!movie) {
			result.error = 'Movie not found in library';
			await downloadMonitor.markFailed(queueItem.id, result.error);
			return result;
		}

		worker.log('info', `Importing movie: ${movie.title}`);

		// Get root folder
		const [rootFolder] = movie.rootFolderId
			? await db.select().from(rootFolders).where(eq(rootFolders.id, movie.rootFolderId)).limit(1)
			: [];

		if (!rootFolder) {
			result.error = 'Root folder not found';
			await downloadMonitor.markFailed(queueItem.id, result.error);
			return result;
		}

		// Check if root folder is read-only
		if (rootFolder.readOnly) {
			result.error = 'Cannot import to read-only root folder';
			await downloadMonitor.markFailed(queueItem.id, result.error);
			worker.log('error', 'Root folder is read-only, cannot import files');
			return result;
		}

		// Get download path
		const downloadPath = queueItem.outputPath || queueItem.clientDownloadPath;
		if (!downloadPath) {
			result.error = 'Download path not available';
			await downloadMonitor.markFailed(queueItem.id, result.error);
			return result;
		}

		// Check for dangerous/executable files (malware protection)
		const dangerousScan = await this.scanForDangerousFiles(downloadPath);
		if (dangerousScan.hasDangerousFiles) {
			const fileList = dangerousScan.dangerousFiles
				.map((f) => `${basename(f.path)} (${f.extension})`)
				.join(', ');
			result.error = `Caution: Found potentially dangerous files: ${fileList}`;
			logger.warn(
				{
					downloadPath,
					dangerousFiles: dangerousScan.dangerousFiles
				},
				'Rejecting import due to dangerous files'
			);
			await downloadMonitor.markFailed(queueItem.id, result.error);
			worker.log('error', result.error);
			return result;
		}

		// Find video files in download
		const videoFiles = await this.findImportableFiles(downloadPath, importOptions);

		if (videoFiles.length === 0) {
			result.error = 'No video files found in download';
			await downloadMonitor.markFailed(queueItem.id, result.error);
			return result;
		}

		worker.setTotalFiles(1); // Movies typically have 1 main file

		// For movies, typically take the largest file
		const mainFile = await this.resolveImportFile(
			videoFiles.sort((a, b) => b.size - a.size)[0],
			downloadPath,
			importOptions
		);

		if (!mainFile) {
			result.error = 'No importable files found in download';
			await downloadMonitor.markFailed(queueItem.id, result.error);
			return result;
		}

		// Build destination path
		const movieFolder = join(rootFolder.path, movie.path);
		const destFileName = this.buildMovieFileName(movie, mainFile.path, queueItem);
		const destPath = join(movieFolder, destFileName);

		// Check for existing file (upgrade scenario)
		const existingFiles = await db
			.select()
			.from(movieFiles)
			.where(eq(movieFiles.movieId, movie.id));

		const isUpgrade = queueItem.isUpgrade || false;

		// Log upgrade detection but DON'T delete old files yet - wait until new file is imported
		if (existingFiles.length > 0 && isUpgrade) {
			logger.info(
				{
					movieId: movie.id,
					existingCount: existingFiles.length
				},
				'Upgrade detected - will replace existing files after successful import'
			);
		}

		// Transfer the file FIRST (keep old file until new one is successfully imported)
		// Use ImportMode.Auto to decide based on canMoveFiles:
		// - Seeding torrents (canMoveFiles=false): Use hardlink/copy to preserve source
		// - Usenet/completed (canMoveFiles=true): Use move for efficiency
		worker.log('info', `Transferring file to: ${destPath} (canMoveFiles=${canMoveFiles})`);
		const preserveSymlinks = rootFolder.preserveSymlinks ?? false;
		const transferResult = await transferFileWithMode(mainFile.path, destPath, {
			importMode: ImportMode.Auto,
			canMoveFiles,
			preserveSymlinks
		});

		if (!transferResult.success) {
			result.failedFiles.push({
				success: false,
				sourcePath: mainFile.path,
				error: transferResult.error
			});
			result.error = `Failed to transfer file: ${transferResult.error}`;
			worker.fileProcessed(basename(mainFile.path), false, transferResult.error);
			await downloadMonitor.markFailed(queueItem.id, result.error);
			return result;
		}

		worker.fileTransferred(
			basename(mainFile.path),
			transferResult.mode === 'symlink'
				? 'symlink'
				: transferResult.mode === 'hardlink'
					? 'hardlink'
					: 'copy'
		);
		worker.setDestinationPath(destPath);

		// Extract media info (skip STRM probing for streamer profile)
		const allowStrmProbe = movie.scoringProfileId !== 'streamer';
		const mediaInfo = await mediaInfoService.extractMediaInfo(destPath, { allowStrmProbe });

		const importedMetadata = this.buildImportedMetadata(queueItem, mainFile.path, mediaInfo);

		// Create or update file record (deduplication)
		const relativePath = destFileName;

		// Check if a file record already exists for this path (prevent duplicates)
		const existingFileRecord = await db
			.select()
			.from(movieFiles)
			.where(and(eq(movieFiles.movieId, movie.id), eq(movieFiles.relativePath, relativePath)))
			.limit(1);

		const fileData = {
			movieId: movie.id,
			relativePath,
			size: transferResult.sizeBytes,
			dateAdded: new Date().toISOString(),
			sceneName: importedMetadata.sceneName,
			releaseGroup: importedMetadata.releaseGroup,
			edition: importedMetadata.edition,
			quality: importedMetadata.quality,
			mediaInfo,
			infoHash: queueItem.infoHash ?? undefined
		};

		let fileId: string;
		if (existingFileRecord.length > 0) {
			// Update existing record instead of creating duplicate
			fileId = existingFileRecord[0].id;
			await db.update(movieFiles).set(fileData).where(eq(movieFiles.id, fileId));
			logger.info({ movieId: movie.id, fileId }, 'Updated existing movie file record');
		} else {
			// Create new file record
			fileId = randomUUID();
			await db.insert(movieFiles).values({ id: fileId, ...fileData });
		}

		// Update movie hasFile flag
		await db.update(movies).set({ hasFile: true }).where(eq(movies.id, movie.id));

		result.totalSize = transferResult.sizeBytes || 0;
		result.success = true;

		// Mark as imported (protocol determines if it shows as 'seeding-imported' or 'imported')
		await downloadMonitor.markImported(
			queueItem.id,
			destPath,
			queueItem.protocol as 'torrent' | 'usenet'
		);

		// NOW delete old files (after successful import - so media is never missing)
		const deletedFileIds: string[] = [];
		if (existingFiles.length > 0 && isUpgrade) {
			logger.info(
				{
					movieId: movie.id,
					existingCount: existingFiles.length
				},
				'Import successful - now deleting old files'
			);

			for (const oldFile of existingFiles) {
				// Don't delete the file we just created/updated
				if (oldFile.id === fileId) continue;

				const deleteResult = await this.deleteMovieFile(oldFile.id, movie.id);
				if (deleteResult.success) {
					logger.info(
						{
							movieId: movie.id,
							oldFileId: oldFile.id,
							oldPath: oldFile.relativePath
						},
						'Deleted old movie file after upgrade'
					);
					deletedFileIds.push(oldFile.id);
				} else {
					logger.warn(
						{
							movieId: movie.id,
							oldFileId: oldFile.id,
							error: deleteResult.error
						},
						'Failed to delete old movie file after upgrade'
					);
				}
			}
		}

		result.importedFiles.push({
			success: true,
			sourcePath: mainFile.path,
			destPath,
			fileId,
			wasUpgrade: isUpgrade,
			replacedFileIds: deletedFileIds.length > 0 ? deletedFileIds : undefined,
			sceneName: fileData.sceneName,
			releaseGroup: fileData.releaseGroup,
			quality: fileData.quality
		});

		worker.fileProcessed(basename(destPath), true);
		if (isUpgrade && deletedFileIds.length > 0) {
			worker.upgrade('previous version', basename(destPath));
		}

		// Create history record
		await this.createHistoryRecord(queueItem, 'imported', {
			importedPath: destPath,
			movieFileId: fileId,
			title: fileData.sceneName,
			releaseGroup: fileData.releaseGroup,
			quality: fileData.quality
		});

		logger.info(
			{
				movieId: movie.id,
				title: movie.title,
				destPath,
				wasUpgrade: isUpgrade,
				replacedFiles: deletedFileIds.length
			},
			'Movie imported successfully'
		);

		// Emit event for SSE clients and buffer for replay
		const movieEvent = {
			mediaType: 'movie' as const,
			movieId: movie.id,
			file: {
				id: fileId,
				relativePath: relativePath,
				size: transferResult.sizeBytes,
				dateAdded: fileData.dateAdded,
				sceneName: fileData.sceneName,
				releaseGroup: fileData.releaseGroup,
				quality: fileData.quality,
				mediaInfo,
				edition: fileData.edition
			},
			wasUpgrade: isUpgrade,
			replacedFileIds: deletedFileIds.length > 0 ? deletedFileIds : undefined,
			timestamp: Date.now()
		};
		this.emit('file:imported', movieEvent);
		eventBuffer.add(movieEvent);
		libraryMediaEvents.emitMovieUpdated(movie.id);

		// Trigger subtitle search asynchronously (don't await to avoid blocking)
		this.triggerSubtitleSearch('movie', movie.id).catch((err) => {
			logger.warn(
				{
					movieId: movie.id,
					error: err instanceof Error ? err.message : String(err)
				},
				'[ImportService] Failed to trigger subtitle search for movie'
			);
		});

		// For usenet downloads, delete source folder (no seeding needed)
		if (queueItem.protocol === 'usenet' && queueItem.outputPath) {
			this.cleanupUsenetSource(queueItem.outputPath).catch((err) => {
				logger.warn(
					{
						outputPath: queueItem.outputPath,
						error: err instanceof Error ? err.message : String(err)
					},
					'[ImportService] Failed to cleanup usenet source'
				);
			});
		}

		return result;
	}

	/**
	 * Import a series/episode download
	 *
	 * @param queueItem - Queue item to import
	 * @param worker - Import worker for tracking
	 * @param importOptions - File detection options
	 * @param canMoveFiles - Whether files can be moved (false for seeding torrents)
	 */
	private async importSeries(
		queueItem: typeof downloadQueue.$inferSelect,
		worker: ImportWorker,
		importOptions: ImportableFileOptions,
		_canMoveFiles: boolean
	): Promise<ImportJobResult> {
		const result: ImportJobResult = {
			success: false,
			queueItemId: queueItem.id,
			importedFiles: [],
			failedFiles: [],
			totalSize: 0
		};

		// Get series info
		const [seriesData] = await db
			.select()
			.from(series)
			.where(eq(series.id, queueItem.seriesId!))
			.limit(1);

		if (!seriesData) {
			result.error = 'Series not found in library';
			await downloadMonitor.markFailed(queueItem.id, result.error);
			return result;
		}

		worker.log('info', `Importing series: ${seriesData.title}`);

		// Get root folder
		const [rootFolder] = seriesData.rootFolderId
			? await db
					.select()
					.from(rootFolders)
					.where(eq(rootFolders.id, seriesData.rootFolderId))
					.limit(1)
			: [];

		if (!rootFolder) {
			result.error = 'Root folder not found';
			await downloadMonitor.markFailed(queueItem.id, result.error);
			return result;
		}

		// Check if root folder is read-only
		if (rootFolder.readOnly) {
			result.error = 'Cannot import to read-only root folder';
			await downloadMonitor.markFailed(queueItem.id, result.error);
			worker.log('error', 'Root folder is read-only, cannot import files');
			return result;
		}

		// Get download path
		const downloadPath = queueItem.outputPath || queueItem.clientDownloadPath;
		if (!downloadPath) {
			result.error = 'Download path not available';
			await downloadMonitor.markFailed(queueItem.id, result.error);
			return result;
		}

		// Check for dangerous/executable files (malware protection)
		const dangerousScan = await this.scanForDangerousFiles(downloadPath);
		if (dangerousScan.hasDangerousFiles) {
			const fileList = dangerousScan.dangerousFiles
				.map((f) => `${basename(f.path)} (${f.extension})`)
				.join(', ');
			result.error = `Caution: Found potentially dangerous files: ${fileList}`;
			logger.warn(
				{
					downloadPath,
					dangerousFiles: dangerousScan.dangerousFiles
				},
				'Rejecting import due to dangerous files'
			);
			await downloadMonitor.markFailed(queueItem.id, result.error);
			worker.log('error', result.error);
			return result;
		}

		// Find video files
		const videoFiles = await this.findImportableFiles(downloadPath, importOptions);

		if (videoFiles.length === 0) {
			result.error = 'No video files found in download';
			await downloadMonitor.markFailed(queueItem.id, result.error);
			return result;
		}

		worker.setTotalFiles(videoFiles.length);

		// Process each video file
		const importedFileIds: string[] = [];

		for (const videoFile of videoFiles) {
			try {
				const resolvedFile = await this.resolveImportFile(videoFile, downloadPath, importOptions);
				if (!resolvedFile) {
					const errorMessage = 'Source file not found';
					result.failedFiles.push({
						success: false,
						sourcePath: videoFile.path,
						error: errorMessage
					});
					worker.fileProcessed(basename(videoFile.path), false, errorMessage);
					logger.warn(
						{
							seriesId: seriesData.id,
							seriesTitle: seriesData.title,
							sourcePath: videoFile.path,
							error: errorMessage
						},
						'Failed to import episode file'
					);
					continue;
				}

				const importResult = await this.importEpisodeFile(
					resolvedFile,
					seriesData,
					rootFolder,
					queueItem,
					_canMoveFiles
				);

				if (importResult.success) {
					result.importedFiles.push(importResult);
					result.totalSize += resolvedFile.size;
					if (importResult.fileId) {
						importedFileIds.push(importResult.fileId);
					}
					worker.fileProcessed(basename(resolvedFile.path), true);
					if (importResult.wasUpgrade) {
						worker.upgrade(
							'previous version',
							basename(importResult.destPath || resolvedFile.path)
						);
					}
				} else {
					result.failedFiles.push(importResult);
					worker.fileProcessed(basename(videoFile.path), false, importResult.error);
					logger.warn(
						{
							seriesId: seriesData.id,
							seriesTitle: seriesData.title,
							sourcePath: importResult.sourcePath,
							error: importResult.error
						},
						'Failed to import episode file'
					);
				}
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				result.failedFiles.push({
					success: false,
					sourcePath: videoFile.path,
					error: errorMessage
				});
				worker.fileProcessed(basename(videoFile.path), false, errorMessage);
				logger.error(
					{
						seriesId: seriesData.id,
						seriesTitle: seriesData.title,
						sourcePath: videoFile.path,
						error: errorMessage
					},
					'Exception while importing episode file'
				);
			}
		}

		// Consider success if at least one file imported
		result.success = result.importedFiles.length > 0;

		if (result.success) {
			// Mark as imported (protocol determines if it shows as 'seeding-imported' or 'imported')
			const importedPath = result.importedFiles[0]?.destPath || downloadPath;
			const representativeImport = result.importedFiles.find((file) => file.success);
			await downloadMonitor.markImported(
				queueItem.id,
				importedPath,
				queueItem.protocol as 'torrent' | 'usenet'
			);

			// Create history record
			await this.createHistoryRecord(queueItem, 'imported', {
				importedPath,
				episodeFileIds: importedFileIds,
				title: representativeImport?.sceneName,
				releaseGroup: representativeImport?.releaseGroup,
				quality: representativeImport?.quality
			});

			logger.info(
				{
					seriesId: seriesData.id,
					title: seriesData.title,
					importedCount: result.importedFiles.length,
					failedCount: result.failedFiles.length
				},
				'Series episodes imported'
			);

			// Trigger subtitle search for each imported episode asynchronously
			if (importedFileIds.length > 0) {
				this.triggerSubtitleSearchForEpisodeFiles(importedFileIds).catch((err) => {
					logger.warn(
						{
							seriesId: seriesData.id,
							error: err instanceof Error ? err.message : String(err)
						},
						'[ImportService] Failed to trigger subtitle search for episodes'
					);
				});
			}

			// For usenet downloads, delete source folder (no seeding needed)
			if (queueItem.protocol === 'usenet' && queueItem.outputPath) {
				this.cleanupUsenetSource(queueItem.outputPath).catch((err) => {
					logger.warn(
						{
							outputPath: queueItem.outputPath,
							error: err instanceof Error ? err.message : String(err)
						},
						'[ImportService] Failed to cleanup usenet source'
					);
				});
			}
		} else {
			result.error = 'Failed to import any episodes';
			await downloadMonitor.markFailed(queueItem.id, result.error);
		}

		return result;
	}

	/**
	 * Import a single episode file
	 */
	private resolveEpisodeIdentifierWithFallback(
		videoFilePath: string,
		queueItem: Pick<typeof downloadQueue.$inferSelect, 'title' | 'seasonNumber'>,
		seriesType: 'standard' | 'anime' | 'daily'
	): ResolvedTvEpisodeIdentifier | null {
		const seasonHint = queueItem.seasonNumber ?? undefined;
		const candidates: Array<{
			source: 'file' | 'queueTitle' | 'parentFolder';
			value?: string | null;
		}> = [
			{ source: 'file', value: videoFilePath },
			{ source: 'queueTitle', value: queueItem.title },
			{ source: 'parentFolder', value: basename(dirname(videoFilePath)) }
		];
		const seenStems = new Set<string>();

		for (const candidate of candidates) {
			if (!candidate.value) continue;
			const stem = getMediaParseStem(candidate.value);
			const normalizedStem = stem.trim().toLowerCase();
			if (!normalizedStem || seenStems.has(normalizedStem)) {
				continue;
			}
			seenStems.add(normalizedStem);

			const parsed = this.parser.parse(stem);
			const identifier = resolveTvEpisodeIdentifier({
				filePath: videoFilePath,
				fileName: stem,
				parsed,
				seasonHint,
				seriesType
			});

			if (!identifier) {
				continue;
			}

			if (candidate.source !== 'file') {
				logger.info(
					{
						sourcePath: videoFilePath,
						fallbackSource: candidate.source,
						fallbackToken: stem
					},
					'[ImportService] Resolved episode identifier from fallback context'
				);
			}

			return identifier;
		}

		return null;
	}

	private async importEpisodeFile(
		videoFile: { path: string; size: number },
		seriesData: typeof series.$inferSelect,
		rootFolder: typeof rootFolders.$inferSelect,
		queueItem: typeof downloadQueue.$inferSelect,
		canMoveFiles: boolean
	): Promise<ImportResult> {
		const normalizedSeriesType =
			seriesData.seriesType === 'anime' || seriesData.seriesType === 'daily'
				? seriesData.seriesType
				: 'standard';

		// Parse episode info from filename/release context (fallbacks handle obfuscated basenames).
		const resolvedIdentifier = this.resolveEpisodeIdentifierWithFallback(
			videoFile.path,
			{
				title: queueItem.title,
				seasonNumber: queueItem.seasonNumber
			},
			normalizedSeriesType
		);

		if (!resolvedIdentifier) {
			return {
				success: false,
				sourcePath: videoFile.path,
				error: 'Could not parse episode info from filename'
			};
		}

		const seriesEpisodes = await db
			.select()
			.from(episodes)
			.where(eq(episodes.seriesId, seriesData.id));
		let matchingEpisodes = matchEpisodesByIdentifier(seriesEpisodes, resolvedIdentifier);
		if (matchingEpisodes.length === 0) {
			matchingEpisodes = this.matchEpisodesFromQueueContext(
				seriesEpisodes,
				queueItem,
				resolvedIdentifier
			);
		}
		if (matchingEpisodes.length === 0) {
			return {
				success: false,
				sourcePath: videoFile.path,
				error: 'Could not match imported file to an episode in the library'
			};
		}

		const seasonNum = matchingEpisodes[0].seasonNumber;
		const episodeNums = matchingEpisodes.map((episode) => episode.episodeNumber);
		const firstEpisode = matchingEpisodes[0];
		const absoluteNumber =
			firstEpisode?.absoluteEpisodeNumber ??
			this.getFallbackAbsoluteEpisodeNumber(seriesEpisodes, firstEpisode?.id);

		// Build destination path
		const seriesFolder = join(rootFolder.path, seriesData.path);

		const destFileName = this.buildEpisodeFileName(
			seriesData,
			seasonNum,
			episodeNums,
			videoFile.path,
			queueItem,
			firstEpisode?.title ?? undefined,
			absoluteNumber,
			firstEpisode?.airDate ?? undefined
		);
		const relativePath = this.buildEpisodeRelativePath(
			seriesData.seasonFolder ?? true,
			seasonNum,
			destFileName
		);
		const destPath = join(seriesFolder, relativePath);

		// Ensure season folder exists
		await ensureDirectory(dirname(destPath));

		// Transfer file using mode based on seeding state
		const preserveSymlinks = rootFolder.preserveSymlinks ?? false;
		const transferResult = await transferFileWithMode(videoFile.path, destPath, {
			importMode: ImportMode.Auto,
			canMoveFiles,
			preserveSymlinks
		});

		if (!transferResult.success) {
			return {
				success: false,
				sourcePath: videoFile.path,
				error: transferResult.error
			};
		}

		// Extract media info (skip STRM probing for streamer profile)
		const allowStrmProbe = seriesData.scoringProfileId !== 'streamer';
		const mediaInfo = await mediaInfoService.extractMediaInfo(destPath, { allowStrmProbe });
		const importedMetadata = this.buildImportedMetadata(queueItem, videoFile.path, mediaInfo);

		const episodeIds = matchingEpisodes.map((ep) => ep.id);

		// Check for existing files covering these episodes (upgrade scenario)
		const existingFiles = await db
			.select()
			.from(episodeFiles)
			.where(eq(episodeFiles.seriesId, seriesData.id));

		const filesToReplace: string[] = [];
		const isUpgrade = queueItem.isUpgrade || false;

		if (isUpgrade && existingFiles.length > 0) {
			// Find files that cover any of the same episodes
			for (const existingFile of existingFiles) {
				const hasOverlap = existingFile.episodeIds?.some((id) => episodeIds.includes(id)) ?? false;
				if (hasOverlap) {
					filesToReplace.push(existingFile.id);
				}
			}

			if (filesToReplace.length > 0) {
				logger.info(
					{
						seriesId: seriesData.id,
						seasonNumber: seasonNum,
						episodeNumbers: episodeNums,
						filesToReplace
					},
					'Upgrade detected - will replace existing episode file(s)'
				);
			}
		}

		// Check if a file record already exists for this path (prevent duplicates)
		const existingFileRecord = await db
			.select()
			.from(episodeFiles)
			.where(
				and(eq(episodeFiles.seriesId, seriesData.id), eq(episodeFiles.relativePath, relativePath))
			)
			.limit(1);

		let fileId: string;
		const fileData = {
			seriesId: seriesData.id,
			seasonNumber: seasonNum,
			episodeIds,
			relativePath,
			size: transferResult.sizeBytes,
			dateAdded: new Date().toISOString(),
			sceneName: importedMetadata.sceneName,
			releaseGroup: importedMetadata.releaseGroup,
			edition: importedMetadata.edition,
			releaseType: episodeNums.length > 1 ? 'multiEpisode' : 'singleEpisode',
			quality: importedMetadata.quality,
			mediaInfo,
			infoHash: queueItem.infoHash ?? undefined
		};

		if (existingFileRecord.length > 0) {
			// Update existing record instead of creating duplicate
			fileId = existingFileRecord[0].id;
			await db.update(episodeFiles).set(fileData).where(eq(episodeFiles.id, fileId));
			logger.info(
				{
					fileId,
					relativePath,
					seriesId: seriesData.id
				},
				'Updated existing episode file record'
			);
		} else {
			// Create new file record
			fileId = randomUUID();
			await db.insert(episodeFiles).values({
				id: fileId,
				...fileData
			});
		}

		// Update episode hasFile flags
		for (const episodeId of episodeIds) {
			await db.update(episodes).set({ hasFile: true }).where(eq(episodes.id, episodeId));
		}

		// Emit event for SSE clients and buffer for replay
		const episodeEvent = {
			mediaType: 'episode' as const,
			seriesId: seriesData.id,
			episodeIds,
			seasonNumber: seasonNum,
			file: {
				id: fileId,
				relativePath,
				size: transferResult.sizeBytes,
				dateAdded: fileData.dateAdded,
				sceneName: fileData.sceneName,
				releaseGroup: fileData.releaseGroup,
				edition: fileData.edition,
				releaseType: fileData.releaseType,
				quality: fileData.quality,
				mediaInfo,
				languages: undefined as string[] | undefined
			},
			wasUpgrade: isUpgrade,
			replacedFileIds: filesToReplace.length > 0 ? filesToReplace : undefined,
			timestamp: Date.now()
		};
		this.emit('file:imported', episodeEvent);
		eventBuffer.add(episodeEvent);
		libraryMediaEvents.emitSeriesUpdated(seriesData.id);

		// Delete old files if this was an upgrade
		if (filesToReplace.length > 0) {
			for (const oldFileId of filesToReplace) {
				const deleteResult = await this.deleteEpisodeFile(oldFileId, seriesData.id);
				if (deleteResult.success) {
					logger.info(
						{
							seriesId: seriesData.id,
							replacedFileId: oldFileId
						},
						'Successfully deleted old episode file during upgrade'
					);
				} else {
					logger.warn(
						{
							seriesId: seriesData.id,
							replacedFileId: oldFileId,
							error: deleteResult.error
						},
						'Failed to delete old episode file during upgrade'
					);
				}
			}
		}

		// Update series stats
		await this.updateSeriesStats(seriesData.id);

		return {
			success: true,
			sourcePath: videoFile.path,
			destPath,
			fileId,
			wasUpgrade: isUpgrade,
			replacedFileId: filesToReplace.length > 0 ? filesToReplace[0] : undefined,
			sceneName: fileData.sceneName,
			releaseGroup: fileData.releaseGroup,
			quality: fileData.quality
		};
	}

	/**
	 * Fallback matcher for releases that reset season episode numbering (e.g., E01..E16)
	 * while the library stores global episode numbers for that season (e.g., E62..E77).
	 *
	 * Uses queueItem.episodeIds ordering context to map parsed episode indices.
	 */
	private matchEpisodesFromQueueContext(
		seriesEpisodes: Array<typeof episodes.$inferSelect>,
		queueItem: Pick<typeof downloadQueue.$inferSelect, 'episodeIds' | 'seasonNumber'>,
		identifier: ResolvedTvEpisodeIdentifier
	): Array<typeof episodes.$inferSelect> {
		if (identifier.numbering !== 'standard') {
			return [];
		}

		const queuedEpisodeIds = queueItem.episodeIds ?? [];
		if (queuedEpisodeIds.length === 0) {
			return [];
		}

		const targetSeason = queueItem.seasonNumber ?? identifier.seasonNumber;
		if (targetSeason === undefined || targetSeason === null) {
			return [];
		}

		// Require season alignment before applying relative index mapping.
		if (identifier.seasonNumber !== targetSeason) {
			return [];
		}

		const queuedEpisodesInSeason = seriesEpisodes
			.filter(
				(episode) => queuedEpisodeIds.includes(episode.id) && episode.seasonNumber === targetSeason
			)
			.sort((a, b) => a.episodeNumber - b.episodeNumber);

		if (queuedEpisodesInSeason.length === 0) {
			return [];
		}

		const resolved = identifier.episodeNumbers
			.map((episodeNumber) => queuedEpisodesInSeason[episodeNumber - 1])
			.filter((episode): episode is typeof episodes.$inferSelect => Boolean(episode));

		if (resolved.length !== identifier.episodeNumbers.length) {
			return [];
		}

		// Deduplicate in case a release token repeats an episode number.
		const uniqueById = new Map(resolved.map((episode) => [episode.id, episode]));
		return [...uniqueById.values()];
	}

	/**
	 * Find importable video files in a directory
	 */
	private async findImportableFiles(
		downloadPath: string,
		options: ImportableFileOptions
	): Promise<Array<{ path: string; size: number }>> {
		const files: Array<{ path: string; size: number }> = [];

		try {
			const stats = await stat(downloadPath);

			if (stats.isFile()) {
				// Single file download
				if (this.isImportableFile(downloadPath, stats.size, options)) {
					files.push({ path: downloadPath, size: stats.size });
				}
			} else if (stats.isDirectory()) {
				// Directory - find all video files
				const videoFiles = await findVideoFiles(downloadPath);

				for (const filePath of videoFiles) {
					try {
						const fileStats = await stat(filePath);
						if (this.isImportableFile(filePath, fileStats.size, options)) {
							files.push({ path: filePath, size: fileStats.size });
						}
					} catch {
						// Skip files we can't stat
					}
				}
			}
		} catch (error) {
			logger.error(
				{
					downloadPath,
					error: error instanceof Error ? error.message : String(error)
				},
				'Failed to scan download path'
			);
		}

		if (options.preferNonStrm) {
			const hasNonStrm = files.some((file) => extname(file.path).toLowerCase() !== '.strm');
			if (hasNonStrm) {
				return files.filter((file) => extname(file.path).toLowerCase() !== '.strm');
			}
		}

		return files;
	}

	private getImportOptions(
		client?: typeof downloadClients.$inferSelect,
		queueItem?: Pick<typeof downloadQueue.$inferSelect, 'outputPath' | 'clientDownloadPath'>
	): ImportableFileOptions {
		const isMountModeClient =
			client?.implementation === 'sabnzbd' &&
			(client?.mountMode === 'nzbdav' || client?.mountMode === 'altmount');
		const hasDirectStrmPath = [queueItem?.outputPath, queueItem?.clientDownloadPath].some(
			(path) => path?.toLowerCase().endsWith('.strm') ?? false
		);
		return {
			allowStrmSmall: isMountModeClient || hasDirectStrmPath,
			preferNonStrm: isMountModeClient
		};
	}

	private async resolveImportFile(
		file: { path: string; size: number },
		downloadPath: string,
		options: ImportableFileOptions
	): Promise<{ path: string; size: number } | null> {
		if (await fileExists(file.path)) {
			return file;
		}

		if (!options.allowStrmSmall) {
			return null;
		}

		const ext = extname(file.path).toLowerCase();
		if (ext !== '.strm') {
			return null;
		}

		const refreshed = await this.findImportableFiles(downloadPath, options);
		const candidate =
			refreshed.find((item) => extname(item.path).toLowerCase() === '.strm') ?? refreshed[0];

		if (!candidate) {
			return null;
		}

		logger.debug(
			{
				originalPath: file.path,
				candidatePath: candidate.path,
				downloadPath
			},
			'[ImportService] Retrying missing .strm file with refreshed scan'
		);

		return (await fileExists(candidate.path)) ? candidate : null;
	}

	/**
	 * Check if a file should be imported
	 */
	private isImportableFile(
		filePath: string,
		size: number,
		options: ImportableFileOptions
	): boolean {
		// Check size
		const ext = extname(filePath).toLowerCase();
		if (!(options.allowStrmSmall && ext === '.strm') && size < DOWNLOAD.MIN_IMPORT_SIZE_BYTES) {
			return false;
		}

		// Check extension
		if (!VIDEO_EXTENSIONS.includes(ext)) {
			return false;
		}

		// Check for sample/extra patterns
		const fileName = basename(filePath);
		for (const pattern of EXCLUDED_FILE_PATTERNS) {
			if (pattern.test(fileName)) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Scan a directory for dangerous or executable files
	 * Following Radarr's DownloadedMovieImportService pattern
	 * @see https://github.com/Radarr/Radarr/blob/develop/src/NzbDrone.Core/MediaFiles/DownloadedMovieImportService.cs
	 */
	private async scanForDangerousFiles(downloadPath: string): Promise<DangerousFileResult> {
		const result: DangerousFileResult = {
			hasDangerousFiles: false,
			dangerousFiles: []
		};

		try {
			const stats = await stat(downloadPath);

			if (stats.isFile()) {
				// Single file - check it directly
				const ext = extname(downloadPath).toLowerCase();
				if ((DANGEROUS_EXTENSIONS as readonly string[]).includes(ext)) {
					result.hasDangerousFiles = true;
					result.dangerousFiles.push({ path: downloadPath, extension: ext, reason: 'dangerous' });
				} else if ((EXECUTABLE_EXTENSIONS as readonly string[]).includes(ext)) {
					result.hasDangerousFiles = true;
					result.dangerousFiles.push({ path: downloadPath, extension: ext, reason: 'executable' });
				}
			} else if (stats.isDirectory()) {
				// Recursively scan directory for dangerous files
				await this.scanDirectoryForDangerousFiles(downloadPath, result);
			}
		} catch (error) {
			logger.warn(
				{
					downloadPath,
					error: error instanceof Error ? error.message : String(error)
				},
				'Failed to scan for dangerous files'
			);
		}

		return result;
	}

	/**
	 * Recursively scan a directory for dangerous files
	 */
	private async scanDirectoryForDangerousFiles(
		dir: string,
		result: DangerousFileResult
	): Promise<void> {
		try {
			const { readdir } = await import('fs/promises');
			const entries = await readdir(dir, { withFileTypes: true });

			for (const entry of entries) {
				const fullPath = join(dir, entry.name);

				if (entry.isDirectory()) {
					// Skip hidden directories
					if (entry.name.startsWith('.') || entry.name.startsWith('@')) {
						continue;
					}
					await this.scanDirectoryForDangerousFiles(fullPath, result);
				} else if (entry.isFile()) {
					const ext = extname(entry.name).toLowerCase();
					if ((DANGEROUS_EXTENSIONS as readonly string[]).includes(ext)) {
						result.hasDangerousFiles = true;
						result.dangerousFiles.push({ path: fullPath, extension: ext, reason: 'dangerous' });
					} else if ((EXECUTABLE_EXTENSIONS as readonly string[]).includes(ext)) {
						result.hasDangerousFiles = true;
						result.dangerousFiles.push({ path: fullPath, extension: ext, reason: 'executable' });
					}
				}
			}
		} catch (error) {
			logger.warn(
				{
					dir,
					error: error instanceof Error ? error.message : String(error)
				},
				'Failed to scan directory for dangerous files'
			);
		}
	}

	/**
	 * Get a NamingService instance with current database config
	 */
	private getNamingService(): NamingService {
		const config = namingSettingsService.getConfigSync();
		return new NamingService(config);
	}

	private buildSeasonFolderName(seasonNumber: number): string {
		return this.getNamingService().generateSeasonFolderName(seasonNumber);
	}

	private buildEpisodeRelativePath(
		useSeasonFolders: boolean,
		seasonNumber: number,
		destFileName: string
	): string {
		return useSeasonFolders
			? join(this.buildSeasonFolderName(seasonNumber), destFileName)
			: destFileName;
	}

	/**
	 * Build a movie filename using the naming service
	 */
	private buildMovieFileName(
		movie: typeof movies.$inferSelect,
		sourcePath: string,
		queueItem: typeof downloadQueue.$inferSelect
	): string {
		const parsed = this.parser.parse(queueItem.title);

		// Build naming info from movie and parsed release
		const namingInfo: MediaNamingInfo = {
			title: movie.title,
			year: movie.year ?? undefined,
			tmdbId: movie.tmdbId,
			imdbId: movie.imdbId ?? undefined,
			...releaseToNamingInfo(parsed, sourcePath)
		};

		return this.getNamingService().generateMovieFileName(namingInfo);
	}

	/**
	 * Build an episode filename using the naming service
	 */
	private buildEpisodeFileName(
		seriesData: typeof series.$inferSelect,
		seasonNum: number,
		episodeNums: number[],
		sourcePath: string,
		queueItem: typeof downloadQueue.$inferSelect,
		episodeTitle?: string,
		absoluteNumber?: number,
		airDate?: string
	): string {
		const parsed = this.parser.parse(queueItem.title);
		const isAnime = seriesData.seriesType === 'anime';
		const isDaily = seriesData.seriesType === 'daily';

		// Build naming info from series and parsed release
		// IMPORTANT: Spread releaseToNamingInfo FIRST, then override with explicit values
		// This prevents season pack parsing from overwriting per-file episode numbers
		const namingInfo: MediaNamingInfo = {
			...releaseToNamingInfo(parsed, sourcePath),
			title: seriesData.title,
			year: seriesData.year ?? undefined,
			tvdbId: seriesData.tvdbId ?? undefined,
			seasonNumber: seasonNum,
			episodeNumbers: episodeNums,
			episodeTitle,
			absoluteNumber,
			airDate,
			isAnime,
			isDaily
		};

		return this.getNamingService().generateEpisodeFileName(namingInfo);
	}

	private getFallbackAbsoluteEpisodeNumber(
		allEpisodes: Array<typeof episodes.$inferSelect>,
		episodeId?: string
	): number | undefined {
		if (!episodeId) {
			return undefined;
		}

		let lastAbsolute = 0;
		const regularEpisodes = [...allEpisodes]
			.filter((episode) => episode.seasonNumber > 0)
			.sort((a, b) => {
				if (a.seasonNumber !== b.seasonNumber) {
					return a.seasonNumber - b.seasonNumber;
				}
				return a.episodeNumber - b.episodeNumber;
			});

		for (const episode of regularEpisodes) {
			const absoluteNumber =
				typeof episode.absoluteEpisodeNumber === 'number' && episode.absoluteEpisodeNumber > 0
					? episode.absoluteEpisodeNumber
					: lastAbsolute + 1;

			lastAbsolute = absoluteNumber;
			if (episode.id === episodeId) {
				return absoluteNumber;
			}
		}

		return undefined;
	}

	private normalizeUnknownValue(value?: string | null): string | undefined {
		if (!value) return undefined;
		const trimmed = value.trim();
		if (!trimmed) return undefined;

		const normalized = trimmed.toLowerCase();
		if (normalized === 'unknown' || normalized === 'n/a' || normalized === '-') {
			return undefined;
		}

		return trimmed;
	}

	private firstKnownValue(...values: Array<string | null | undefined>): string | undefined {
		for (const value of values) {
			const normalized = this.normalizeUnknownValue(value);
			if (normalized) return normalized;
		}
		return undefined;
	}

	private hasKnownQualityMetadata(parsed: ReturnType<ReleaseParser['parse']>): boolean {
		return (
			parsed.resolution !== 'unknown' ||
			parsed.source !== 'unknown' ||
			parsed.codec !== 'unknown' ||
			parsed.hdr !== null ||
			Boolean(parsed.releaseGroup)
		);
	}

	private resolveSourceReleaseContext(sourcePath: string): {
		sourceName: string;
		parsed: ReturnType<ReleaseParser['parse']>;
	} {
		const fileSourceName = getMediaParseStem(sourcePath);
		const parentFolderName = getMediaParseStem(basename(dirname(sourcePath)));
		const candidates = [fileSourceName, parentFolderName].filter(
			(candidate, index, all) =>
				candidate && all.findIndex((value) => value === candidate) === index
		);

		const [primaryCandidate] = candidates;
		if (!primaryCandidate) {
			return {
				sourceName: basename(sourcePath, extname(sourcePath)),
				parsed: this.parser.parse(basename(sourcePath, extname(sourcePath)))
			};
		}

		const primaryParsed = this.parser.parse(primaryCandidate);
		if (this.hasKnownQualityMetadata(primaryParsed) || candidates.length === 1) {
			return {
				sourceName: primaryCandidate,
				parsed: primaryParsed
			};
		}

		for (let i = 1; i < candidates.length; i++) {
			const fallbackCandidate = candidates[i];
			if (!fallbackCandidate) continue;
			const fallbackParsed = this.parser.parse(fallbackCandidate);
			if (!this.hasKnownQualityMetadata(fallbackParsed)) {
				continue;
			}

			logger.info(
				{
					sourcePath,
					fallbackToken: fallbackCandidate
				},
				'[ImportService] Using fallback source context for metadata parsing'
			);

			return {
				sourceName: fallbackCandidate,
				parsed: fallbackParsed
			};
		}

		return {
			sourceName: primaryCandidate,
			parsed: primaryParsed
		};
	}

	private mapMediaInfoResolution(
		mediaInfo?: { width?: number; height?: number } | null
	): string | undefined {
		if (!mediaInfo) return undefined;

		const label = MediaInfoService.getResolutionLabel(
			mediaInfo.width,
			mediaInfo.height
		).toLowerCase();
		if (label === 'unknown') return undefined;
		if (label === '4k') return '2160p';
		return /^\d{3,4}p$/.test(label) ? label : undefined;
	}

	private mapMediaInfoCodec(codec?: string): string | undefined {
		const normalized = this.normalizeUnknownValue(codec)?.toLowerCase();
		if (!normalized) return undefined;
		const compact = normalized.replace(/[^a-z0-9+]/g, '');

		if (compact.includes('av1')) return 'av1';
		if (compact.includes('hevc') || compact.includes('h265') || compact.includes('x265'))
			return 'h265';
		if (compact.includes('avc') || compact.includes('h264') || compact.includes('x264'))
			return 'h264';
		if (compact.includes('vc1')) return 'vc1';
		if (compact.includes('mpeg2') || compact.includes('m2v')) return 'mpeg2';
		if (compact.includes('xvid')) return 'xvid';
		if (compact.includes('divx')) return 'divx';

		return undefined;
	}

	private mapMediaInfoHdr(hdr?: string): string | undefined {
		const normalized = this.normalizeUnknownValue(hdr)?.toLowerCase();
		if (!normalized) return undefined;

		if (normalized.includes('dolby') && normalized.includes('vision')) return 'dolby-vision';
		if (normalized.includes('hdr10+')) return 'hdr10+';
		if (normalized.includes('hdr10')) return 'hdr10';
		if (normalized.includes('hlg')) return 'hlg';
		if (normalized.includes('pq')) return 'pq';
		if (normalized.includes('sdr')) return 'sdr';
		if (normalized.includes('hdr')) return 'hdr';

		return undefined;
	}

	private buildImportedMetadata(
		queueItem: Pick<typeof downloadQueue.$inferSelect, 'title' | 'quality' | 'releaseGroup'>,
		sourcePath: string,
		mediaInfo: {
			width?: number;
			height?: number;
			videoCodec?: string;
			videoHdrFormat?: string;
		} | null
	): {
		sceneName: string;
		releaseGroup?: string;
		edition?: string;
		quality: {
			resolution?: string;
			source?: string;
			codec?: string;
			hdr?: string;
		};
	} {
		const queueParsed = this.parser.parse(queueItem.title);
		const { sourceName, parsed: sourceParsed } = this.resolveSourceReleaseContext(sourcePath);
		const queueQuality = queueItem.quality ?? undefined;

		const hasQueueMetadata =
			this.hasKnownQualityMetadata(queueParsed) ||
			Boolean(
				this.firstKnownValue(
					queueItem.releaseGroup,
					queueQuality?.resolution,
					queueQuality?.source,
					queueQuality?.codec,
					queueQuality?.hdr
				)
			);
		const hasSourceMetadata = this.hasKnownQualityMetadata(sourceParsed);
		const sceneName = !hasQueueMetadata && hasSourceMetadata ? sourceName : queueItem.title;

		return {
			sceneName,
			edition: queueParsed.edition ?? sourceParsed.edition ?? undefined,
			releaseGroup: this.firstKnownValue(
				queueItem.releaseGroup,
				queueParsed.releaseGroup,
				sourceParsed.releaseGroup
			),
			quality: {
				resolution: this.firstKnownValue(
					queueQuality?.resolution,
					queueParsed.resolution,
					sourceParsed.resolution,
					this.mapMediaInfoResolution(mediaInfo)
				),
				source: this.firstKnownValue(queueQuality?.source, queueParsed.source, sourceParsed.source),
				codec: this.firstKnownValue(
					queueQuality?.codec,
					queueParsed.codec,
					sourceParsed.codec,
					this.mapMediaInfoCodec(mediaInfo?.videoCodec)
				),
				hdr: this.firstKnownValue(
					queueQuality?.hdr,
					queueParsed.hdr ?? undefined,
					sourceParsed.hdr ?? undefined,
					this.mapMediaInfoHdr(mediaInfo?.videoHdrFormat)
				)
			}
		};
	}

	/**
	 * Update series and season episode counts.
	 * Public so it can be called after library scans to refresh cached counts.
	 */
	async updateSeriesStats(seriesId: string): Promise<void> {
		// Get all episodes for this series
		const allEpisodes = await db.select().from(episodes).where(eq(episodes.seriesId, seriesId));

		// Exclude specials (season 0) from series-level counts
		const regularEpisodes = allEpisodes.filter((ep) => ep.seasonNumber !== 0);
		const regularEpisodesWithFiles = regularEpisodes.filter((ep) => ep.hasFile);

		// Update series counts
		await db
			.update(series)
			.set({
				episodeFileCount: regularEpisodesWithFiles.length,
				episodeCount: regularEpisodes.length
			})
			.where(eq(series.id, seriesId));

		// Group by season and update each season's counts
		const seasonMap = new Map<number, { total: number; withFiles: number }>();
		for (const ep of allEpisodes) {
			const stats = seasonMap.get(ep.seasonNumber) || { total: 0, withFiles: 0 };
			stats.total++;
			if (ep.hasFile) {
				stats.withFiles++;
			}
			seasonMap.set(ep.seasonNumber, stats);
		}

		// Update each season
		for (const [seasonNumber, stats] of seasonMap) {
			await db
				.update(seasons)
				.set({
					episodeFileCount: stats.withFiles,
					episodeCount: stats.total
				})
				.where(and(eq(seasons.seriesId, seriesId), eq(seasons.seasonNumber, seasonNumber)));
		}
	}

	/**
	 * Delete a movie file (both database record and physical file)
	 */
	private async deleteMovieFile(
		fileId: string,
		movieId: string
	): Promise<{ success: boolean; error?: string }> {
		try {
			// Get file info before deleting
			const [fileRecord] = await db
				.select()
				.from(movieFiles)
				.where(eq(movieFiles.id, fileId))
				.limit(1);

			if (!fileRecord) {
				return { success: false, error: 'File record not found' };
			}

			// Get movie to build full path
			const [movie] = await db.select().from(movies).where(eq(movies.id, movieId)).limit(1);

			if (!movie || !movie.rootFolderId) {
				return { success: false, error: 'Movie or root folder not found' };
			}

			// Get root folder
			const [rootFolder] = await db
				.select()
				.from(rootFolders)
				.where(eq(rootFolders.id, movie.rootFolderId))
				.limit(1);

			if (!rootFolder) {
				return { success: false, error: 'Root folder not found' };
			}

			// Build full path
			const fullPath = join(rootFolder.path, movie.path, fileRecord.relativePath);

			// Delete physical file if it exists
			try {
				if (await fileExists(fullPath)) {
					await unlink(fullPath);
					logger.info({ fileId, path: fullPath }, 'Deleted old movie file');
				}
			} catch (error) {
				logger.warn(
					{
						fileId,
						path: fullPath,
						err: error
					},
					'Failed to delete physical file (continuing anyway)'
				);
			}

			// Delete database record
			await db.delete(movieFiles).where(eq(movieFiles.id, fileId));

			// Emit event for SSE clients
			this.emit('file:deleted', {
				mediaType: 'movie',
				movieId,
				fileId
			});

			logger.info({ fileId, movieId }, 'Deleted movie file record');
			return { success: true };
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			logger.error({ fileId, err: error }, 'Failed to delete movie file');
			return { success: false, error: errorMessage };
		}
	}

	/**
	 * Delete an episode file (both database record and physical file)
	 */
	private async deleteEpisodeFile(
		fileId: string,
		seriesId: string
	): Promise<{ success: boolean; error?: string }> {
		try {
			// Get file info before deleting
			const [fileRecord] = await db
				.select()
				.from(episodeFiles)
				.where(eq(episodeFiles.id, fileId))
				.limit(1);

			if (!fileRecord) {
				return { success: false, error: 'File record not found' };
			}

			// Get series to build full path
			const [seriesData] = await db.select().from(series).where(eq(series.id, seriesId)).limit(1);

			if (!seriesData || !seriesData.rootFolderId) {
				return { success: false, error: 'Series or root folder not found' };
			}

			// Get root folder
			const [rootFolder] = await db
				.select()
				.from(rootFolders)
				.where(eq(rootFolders.id, seriesData.rootFolderId))
				.limit(1);

			if (!rootFolder) {
				return { success: false, error: 'Root folder not found' };
			}

			// Build full path
			const fullPath = join(rootFolder.path, seriesData.path, fileRecord.relativePath);

			// Delete physical file if it exists
			try {
				if (await fileExists(fullPath)) {
					await unlink(fullPath);
					logger.info({ fileId, path: fullPath }, 'Deleted old episode file');
				}
			} catch (error) {
				logger.warn(
					{
						fileId,
						path: fullPath,
						err: error
					},
					'Failed to delete physical file (continuing anyway)'
				);
			}

			// Delete database record
			await db.delete(episodeFiles).where(eq(episodeFiles.id, fileId));

			// Update episode hasFile flags
			for (const episodeId of fileRecord.episodeIds ?? []) {
				// Check if episode has other files
				const otherFiles = await db
					.select()
					.from(episodeFiles)
					.where(eq(episodeFiles.seriesId, seriesId));

				const hasOtherFile = otherFiles.some((f) => f.episodeIds?.includes(episodeId) ?? false);

				if (!hasOtherFile) {
					await db.update(episodes).set({ hasFile: false }).where(eq(episodes.id, episodeId));
				}
			}

			// Update series stats
			await this.updateSeriesStats(seriesId);

			// Emit event for SSE clients
			this.emit('file:deleted', {
				mediaType: 'episode',
				seriesId,
				fileId,
				episodeIds: fileRecord.episodeIds ?? []
			});

			logger.info({ fileId, seriesId }, 'Deleted episode file record');
			return { success: true };
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			logger.error({ fileId, err: error }, 'Failed to delete episode file');
			return { success: false, error: errorMessage };
		}
	}

	/**
	 * Trigger subtitle search for newly imported media
	 * Runs asynchronously and doesn't block import completion
	 */
	private async triggerSubtitleSearch(
		mediaType: 'movie' | 'episode',
		mediaId: string
	): Promise<void> {
		try {
			// Check if subtitle search on import is enabled
			const settings = await monitoringScheduler.getSettings();
			if (!settings.subtitleSearchOnImportEnabled) {
				logger.debug(
					{
						mediaType,
						mediaId
					},
					'[ImportService] Subtitle search on import is disabled'
				);
				return;
			}

			// Use the standalone import service for subtitle search
			const result = await searchSubtitlesForNewMedia(mediaType, mediaId);

			logger.info(
				{
					mediaType,
					mediaId,
					downloaded: result.downloaded,
					errors: result.errors.length
				},
				'[ImportService] Post-import subtitle search completed'
			);
		} catch (error) {
			// Log but don't fail - subtitle search is supplementary
			logger.warn(
				{
					mediaType,
					mediaId,
					error: error instanceof Error ? error.message : String(error)
				},
				'[ImportService] Post-import subtitle search failed'
			);
		}
	}

	/**
	 * Trigger subtitle search for episodes associated with imported episode files
	 */
	private async triggerSubtitleSearchForEpisodeFiles(fileIds: string[]): Promise<void> {
		// Check if subtitle search on import is enabled
		const settings = await monitoringScheduler.getSettings();
		if (!settings.subtitleSearchOnImportEnabled) {
			logger.debug('[ImportService] Subtitle search on import is disabled');
			return;
		}

		// Collect unique episode IDs from all files
		const uniqueEpisodeIds = new Set<string>();

		for (const fileId of fileIds) {
			const [file] = await db
				.select()
				.from(episodeFiles)
				.where(eq(episodeFiles.id, fileId))
				.limit(1);

			if (file?.episodeIds) {
				for (const epId of file.episodeIds) {
					uniqueEpisodeIds.add(epId);
				}
			}
		}

		if (uniqueEpisodeIds.size === 0) {
			return;
		}

		// Trigger subtitle search for each episode
		let totalDownloaded = 0;
		let totalErrors = 0;

		for (const episodeId of uniqueEpisodeIds) {
			try {
				const result = await searchSubtitlesForNewMedia('episode', episodeId);
				totalDownloaded += result.downloaded;
				totalErrors += result.errors.length;
			} catch (error) {
				totalErrors++;
				logger.warn(
					{
						episodeId,
						error: error instanceof Error ? error.message : String(error)
					},
					'[ImportService] Failed to search subtitles for episode'
				);
			}
		}

		logger.info(
			{
				episodeCount: uniqueEpisodeIds.size,
				downloaded: totalDownloaded,
				errors: totalErrors
			},
			'[ImportService] Post-import episode subtitle search completed'
		);
	}

	/**
	 * Create a history record for a completed import
	 */
	private async createHistoryRecord(
		queueItem: typeof downloadQueue.$inferSelect,
		status: 'imported' | 'failed' | 'rejected' | 'removed',
		extras: {
			statusReason?: string;
			importedPath?: string;
			movieFileId?: string;
			episodeFileIds?: string[];
			title?: string;
			releaseGroup?: string;
			quality?: typeof downloadQueue.$inferSelect.quality;
		} = {}
	): Promise<void> {
		// Get download client name
		const [client] = await db
			.select()
			.from(downloadClients)
			.where(eq(downloadClients.id, queueItem.downloadClientId))
			.limit(1);

		// Calculate download time
		let downloadTimeSeconds: number | undefined;
		if (queueItem.startedAt && queueItem.completedAt) {
			const startTime = new Date(queueItem.startedAt).getTime();
			const endTime = new Date(queueItem.completedAt).getTime();
			downloadTimeSeconds = Math.floor((endTime - startTime) / 1000);
		}

		const historyValues: Partial<typeof downloadHistory.$inferInsert> = {
			downloadClientId: queueItem.downloadClientId,
			downloadClientName: client?.name,
			downloadId: queueItem.downloadId,
			title: extras.title ?? queueItem.title,
			indexerId: queueItem.indexerId,
			indexerName: queueItem.indexerName,
			protocol: queueItem.protocol,
			movieId: queueItem.movieId,
			seriesId: queueItem.seriesId,
			episodeIds: queueItem.episodeIds ?? undefined,
			seasonNumber: queueItem.seasonNumber,
			status,
			statusReason: extras.statusReason,
			size: queueItem.size,
			downloadTimeSeconds,
			finalRatio: queueItem.ratio,
			quality: (extras.quality ?? queueItem.quality) as typeof downloadHistory.$inferInsert.quality,
			importedPath: extras.importedPath,
			movieFileId: extras.movieFileId,
			episodeFileIds: extras.episodeFileIds,
			grabbedAt: queueItem.addedAt,
			completedAt: queueItem.completedAt,
			releaseGroup: extras.releaseGroup ?? queueItem.releaseGroup,
			importedAt: new Date().toISOString()
		};

		// If this queue attempt was previously recorded as failed, convert that row
		// to imported/recovered instead of creating duplicate activity rows.
		if (status === 'imported' && queueItem.addedAt) {
			const failedCandidates = await db
				.select({
					id: downloadHistory.id,
					downloadId: downloadHistory.downloadId,
					title: downloadHistory.title,
					movieId: downloadHistory.movieId,
					seriesId: downloadHistory.seriesId
				})
				.from(downloadHistory)
				.where(
					and(
						eq(downloadHistory.status, 'failed'),
						eq(downloadHistory.grabbedAt, queueItem.addedAt)
					)
				);

			const failedRecord = failedCandidates.find((candidate) => {
				const sameDownloadId =
					candidate.downloadId &&
					queueItem.downloadId &&
					candidate.downloadId === queueItem.downloadId;
				if (sameDownloadId) return true;

				const sameTitleAndMedia =
					candidate.title === queueItem.title &&
					candidate.movieId === queueItem.movieId &&
					candidate.seriesId === queueItem.seriesId;
				return sameTitleAndMedia;
			});

			if (failedRecord) {
				await db
					.update(downloadHistory)
					.set({
						...historyValues,
						status: 'imported',
						statusReason: null
					})
					.where(eq(downloadHistory.id, failedRecord.id));
				return;
			}
		}

		await db.insert(downloadHistory).values(historyValues as typeof downloadHistory.$inferInsert);
	}

	/**
	 * Cleanup source folder for usenet downloads.
	 * Usenet downloads don't need to be kept for seeding, so we can delete
	 * the source folder after successful import to save disk space.
	 */
	private async cleanupUsenetSource(sourcePath: string): Promise<void> {
		try {
			// Safety check: Don't delete paths that are too short or look like base directories
			// A valid usenet download path should have the download name as a subfolder
			const pathParts = sourcePath.split('/').filter((p) => p.length > 0);
			if (pathParts.length < 4) {
				logger.warn(
					{
						sourcePath,
						pathDepth: pathParts.length
					},
					'[ImportService] Refusing to delete path that looks like a base directory'
				);
				return;
			}

			// Check if it exists first
			const exists = await fileExists(sourcePath);
			if (!exists) {
				logger.debug({ sourcePath }, '[ImportService] Usenet source already cleaned up');
				return;
			}

			// Check if it's a file or directory
			const stats = await stat(sourcePath);

			if (stats.isDirectory()) {
				await rm(sourcePath, { recursive: true, force: true });
			} else {
				await unlink(sourcePath);
			}

			logger.info(
				{
					sourcePath,
					wasDirectory: stats.isDirectory()
				},
				'[ImportService] Deleted usenet source after import'
			);
		} catch (err) {
			// Log but don't throw - cleanup failure shouldn't fail the import
			logger.warn(
				{
					sourcePath,
					error: err instanceof Error ? err.message : String(err)
				},
				'[ImportService] Failed to delete usenet source'
			);
		}
	}
}

// Singleton getter - preferred way to access the service
export function getImportService(): ImportService {
	return ImportService.getInstance();
}

// Reset singleton (for testing)
export function resetImportService(): void {
	ImportService.resetInstance();
}

// Backward-compatible export (prefer getImportService())
export const importService = ImportService.getInstance();
