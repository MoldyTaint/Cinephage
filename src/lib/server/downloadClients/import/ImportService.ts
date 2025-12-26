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
import { join, basename, extname } from 'path';
import { randomUUID } from 'node:crypto';
import { db } from '$lib/server/db';
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
import { eq, and } from 'drizzle-orm';
import { downloadMonitor } from '../monitoring/DownloadMonitorService';
import {
	transferFile,
	findVideoFiles,
	ensureDirectory,
	fileExists,
	VIDEO_EXTENSIONS
} from './FileTransfer';
import { unlink } from 'fs/promises';
import { ReleaseParser } from '$lib/server/indexers/parser/ReleaseParser';
import { mediaInfoService } from '$lib/server/library/media-info';
import {
	NamingService,
	releaseToNamingInfo,
	type MediaNamingInfo
} from '$lib/server/library/naming/NamingService';
import { namingSettingsService } from '$lib/server/library/naming/NamingSettingsService';
import { logger } from '$lib/logging';
import { DOWNLOAD, EXCLUDED_FILE_PATTERNS } from '$lib/config/constants';
import { ImportWorker, workerManager } from '$lib/server/workers';
import { monitoringScheduler } from '$lib/server/monitoring/MonitoringScheduler.js';
import { searchSubtitlesForNewMedia } from '$lib/server/subtitles/services/SubtitleImportService.js';

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

/**
 * Import Service
 *
 * Listens to the download monitor for completed downloads and
 * automatically imports them to the library.
 */
export class ImportService extends EventEmitter {
	private static instance: ImportService | null = null;
	private parser: ReleaseParser;
	private isProcessing = false;
	private processingQueue: string[] = [];

	private constructor() {
		super();
		this.parser = new ReleaseParser();
	}

	static getInstance(): ImportService {
		if (!ImportService.instance) {
			ImportService.instance = new ImportService();
		}
		return ImportService.instance;
	}

	/** Reset the singleton instance (for testing) */
	static resetInstance(): void {
		ImportService.instance = null;
	}

	/**
	 * Start the import service
	 * Note: Imports are triggered directly by DownloadMonitorService now,
	 * so this just checks for any pending imports from previous runs.
	 */
	start(): void {
		logger.info('Starting import service');

		// Check for any completed items that weren't imported (from previous runs)
		this.checkPendingImports();
	}

	/**
	 * Check for downloads that completed but weren't imported
	 */
	private async checkPendingImports(): Promise<void> {
		const pendingItems = await db
			.select()
			.from(downloadQueue)
			.where(eq(downloadQueue.status, 'completed'));

		for (const item of pendingItems) {
			this.queueImport(item.id);
		}
	}

	/**
	 * Queue an import job
	 */
	queueImport(queueItemId: string): void {
		if (!this.processingQueue.includes(queueItemId)) {
			this.processingQueue.push(queueItemId);
			this.processNext();
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
			logger.error('Import processing error', {
				queueItemId,
				error: error instanceof Error ? error.message : String(error)
			});
		}

		this.isProcessing = false;
		this.processNext();
	}

	/**
	 * Process a single import
	 */
	async processImport(queueItemId: string): Promise<ImportJobResult> {
		logger.info('Processing import', { queueItemId, category: 'imports' });

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
		if (queueItem.status === 'imported') {
			return {
				success: true,
				queueItemId,
				importedFiles: [],
				failedFiles: [],
				totalSize: 0,
				error: 'Already imported'
			};
		}

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
			logger.warn('Could not create import worker', {
				queueItemId,
				error: e instanceof Error ? e.message : String(e),
				category: 'imports'
			});
		}

		// Mark as importing
		await downloadMonitor.markImporting(queueItemId);

		try {
			// Set source path
			const downloadPath = queueItem.outputPath || queueItem.clientDownloadPath;
			if (downloadPath) {
				worker.setSourcePath(downloadPath);
			}

			// Determine what to import based on linked media
			let result: ImportJobResult;
			if (queueItem.movieId) {
				result = await this.importMovie(queueItem, worker);
			} else if (queueItem.seriesId) {
				result = await this.importSeries(queueItem, worker);
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
	 */
	private async importMovie(
		queueItem: typeof downloadQueue.$inferSelect,
		worker: ImportWorker
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

		// Find video files in download
		const videoFiles = await this.findImportableFiles(downloadPath);

		if (videoFiles.length === 0) {
			result.error = 'No video files found in download';
			await downloadMonitor.markFailed(queueItem.id, result.error);
			return result;
		}

		worker.setTotalFiles(1); // Movies typically have 1 main file

		// For movies, typically take the largest file
		const mainFile = videoFiles.sort((a, b) => b.size - a.size)[0];

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
			logger.info('Upgrade detected - will replace existing files after successful import', {
				movieId: movie.id,
				existingCount: existingFiles.length
			});
		}

		// Transfer the file FIRST (keep old file until new one is successfully imported)
		worker.log('info', `Transferring file to: ${destPath}`);
		const preserveSymlinks = rootFolder.preserveSymlinks ?? false;
		const transferResult = await transferFile(mainFile.path, destPath, true, preserveSymlinks);

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

		// Extract media info
		const mediaInfo = await mediaInfoService.extractMediaInfo(destPath);

		// Parse quality from release name
		const parsed = this.parser.parse(queueItem.title);

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
			sceneName: queueItem.title,
			releaseGroup: parsed.releaseGroup ?? undefined,
			quality: {
				resolution: parsed.resolution ?? undefined,
				source: parsed.source ?? undefined,
				codec: parsed.codec ?? undefined,
				hdr: parsed.hdr ?? undefined
			},
			mediaInfo
		};

		let fileId: string;
		if (existingFileRecord.length > 0) {
			// Update existing record instead of creating duplicate
			fileId = existingFileRecord[0].id;
			await db.update(movieFiles).set(fileData).where(eq(movieFiles.id, fileId));
			logger.info('Updated existing movie file record', { movieId: movie.id, fileId });
		} else {
			// Create new file record
			fileId = randomUUID();
			await db.insert(movieFiles).values({ id: fileId, ...fileData });
		}

		// Update movie hasFile flag
		await db.update(movies).set({ hasFile: true }).where(eq(movies.id, movie.id));

		result.totalSize = transferResult.sizeBytes || 0;
		result.success = true;

		// Mark as imported
		await downloadMonitor.markImported(queueItem.id, destPath);

		// NOW delete old files (after successful import - so media is never missing)
		const deletedFileIds: string[] = [];
		if (existingFiles.length > 0 && isUpgrade) {
			logger.info('Import successful - now deleting old files', {
				movieId: movie.id,
				existingCount: existingFiles.length
			});

			for (const oldFile of existingFiles) {
				// Don't delete the file we just created/updated
				if (oldFile.id === fileId) continue;

				const deleteResult = await this.deleteMovieFile(oldFile.id, movie.id);
				if (deleteResult.success) {
					logger.info('Deleted old movie file after upgrade', {
						movieId: movie.id,
						oldFileId: oldFile.id,
						oldPath: oldFile.relativePath
					});
					deletedFileIds.push(oldFile.id);
				} else {
					logger.warn('Failed to delete old movie file after upgrade', {
						movieId: movie.id,
						oldFileId: oldFile.id,
						error: deleteResult.error
					});
				}
			}
		}

		result.importedFiles.push({
			success: true,
			sourcePath: mainFile.path,
			destPath,
			fileId,
			wasUpgrade: isUpgrade,
			replacedFileIds: deletedFileIds.length > 0 ? deletedFileIds : undefined
		});

		worker.fileProcessed(basename(destPath), true);
		if (isUpgrade && deletedFileIds.length > 0) {
			worker.upgrade('previous version', basename(destPath));
		}

		// Create history record
		await this.createHistoryRecord(queueItem, 'imported', {
			importedPath: destPath,
			movieFileId: fileId
		});

		logger.info('Movie imported successfully', {
			movieId: movie.id,
			title: movie.title,
			destPath,
			wasUpgrade: isUpgrade,
			replacedFiles: deletedFileIds.length,
			category: 'imports'
		});

		// Trigger subtitle search asynchronously (don't await to avoid blocking)
		this.triggerSubtitleSearch('movie', movie.id).catch((err) => {
			logger.warn('[ImportService] Failed to trigger subtitle search for movie', {
				movieId: movie.id,
				error: err instanceof Error ? err.message : String(err)
			});
		});

		return result;
	}

	/**
	 * Import a series/episode download
	 */
	private async importSeries(
		queueItem: typeof downloadQueue.$inferSelect,
		worker: ImportWorker
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

		// Find video files
		const videoFiles = await this.findImportableFiles(downloadPath);

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
				const importResult = await this.importEpisodeFile(
					videoFile,
					seriesData,
					rootFolder,
					queueItem
				);

				if (importResult.success) {
					result.importedFiles.push(importResult);
					result.totalSize += videoFile.size;
					if (importResult.fileId) {
						importedFileIds.push(importResult.fileId);
					}
					worker.fileProcessed(basename(videoFile.path), true);
					if (importResult.wasUpgrade) {
						worker.upgrade('previous version', basename(importResult.destPath || videoFile.path));
					}
				} else {
					result.failedFiles.push(importResult);
					worker.fileProcessed(basename(videoFile.path), false, importResult.error);
					logger.warn('Failed to import episode file', {
						seriesId: seriesData.id,
						seriesTitle: seriesData.title,
						sourcePath: importResult.sourcePath,
						error: importResult.error,
						category: 'imports'
					});
				}
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				result.failedFiles.push({
					success: false,
					sourcePath: videoFile.path,
					error: errorMessage
				});
				worker.fileProcessed(basename(videoFile.path), false, errorMessage);
				logger.error('Exception while importing episode file', {
					seriesId: seriesData.id,
					seriesTitle: seriesData.title,
					sourcePath: videoFile.path,
					error: errorMessage,
					category: 'imports'
				});
			}
		}

		// Consider success if at least one file imported
		result.success = result.importedFiles.length > 0;

		if (result.success) {
			// Mark as imported
			const importedPath = result.importedFiles[0]?.destPath || downloadPath;
			await downloadMonitor.markImported(queueItem.id, importedPath);

			// Create history record
			await this.createHistoryRecord(queueItem, 'imported', {
				importedPath,
				episodeFileIds: importedFileIds
			});

			logger.info('Series episodes imported', {
				seriesId: seriesData.id,
				title: seriesData.title,
				importedCount: result.importedFiles.length,
				failedCount: result.failedFiles.length
			});

			// Trigger subtitle search for each imported episode asynchronously
			if (importedFileIds.length > 0) {
				this.triggerSubtitleSearchForEpisodeFiles(importedFileIds).catch((err) => {
					logger.warn('[ImportService] Failed to trigger subtitle search for episodes', {
						seriesId: seriesData.id,
						error: err instanceof Error ? err.message : String(err)
					});
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
	private async importEpisodeFile(
		videoFile: { path: string; size: number },
		seriesData: typeof series.$inferSelect,
		rootFolder: typeof rootFolders.$inferSelect,
		queueItem: typeof downloadQueue.$inferSelect
	): Promise<ImportResult> {
		// Parse episode info from filename
		const parsed = this.parser.parse(basename(videoFile.path));

		if (!parsed.episode) {
			return {
				success: false,
				sourcePath: videoFile.path,
				error: 'Could not parse episode info from filename'
			};
		}

		const seasonNum = parsed.episode.season ?? queueItem.seasonNumber ?? 1;
		const episodeNums = parsed.episode.episodes ?? [1];

		// Build destination path
		const seriesFolder = join(rootFolder.path, seriesData.path);
		const seasonFolder = seriesData.seasonFolder
			? join(seriesFolder, `Season ${String(seasonNum).padStart(2, '0')}`)
			: seriesFolder;

		const destFileName = this.buildEpisodeFileName(
			seriesData,
			seasonNum,
			episodeNums,
			videoFile.path,
			queueItem
		);
		const destPath = join(seasonFolder, destFileName);

		// Ensure season folder exists
		await ensureDirectory(seasonFolder);

		// Transfer file
		const preserveSymlinks = rootFolder.preserveSymlinks ?? false;
		const transferResult = await transferFile(videoFile.path, destPath, true, preserveSymlinks);

		if (!transferResult.success) {
			return {
				success: false,
				sourcePath: videoFile.path,
				error: transferResult.error
			};
		}

		// Extract media info
		const mediaInfo = await mediaInfoService.extractMediaInfo(destPath);

		// Find matching episodes in database
		const matchingEpisodes = await db
			.select()
			.from(episodes)
			.where(and(eq(episodes.seriesId, seriesData.id), eq(episodes.seasonNumber, seasonNum)));

		const episodeIds = matchingEpisodes
			.filter((ep) => episodeNums.includes(ep.episodeNumber))
			.map((ep) => ep.id);

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
				logger.info('Upgrade detected - will replace existing episode file(s)', {
					seriesId: seriesData.id,
					seasonNumber: seasonNum,
					episodeNumbers: episodeNums,
					filesToReplace
				});
			}
		}

		// Build relative path
		const relativePath = seriesData.seasonFolder
			? join(`Season ${String(seasonNum).padStart(2, '0')}`, destFileName)
			: destFileName;

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
			sceneName: queueItem.title,
			releaseGroup: parsed.releaseGroup ?? undefined,
			releaseType: episodeNums.length > 1 ? 'multiEpisode' : 'singleEpisode',
			quality: {
				resolution: parsed.resolution ?? undefined,
				source: parsed.source ?? undefined,
				codec: parsed.codec ?? undefined,
				hdr: parsed.hdr ?? undefined
			},
			mediaInfo
		};

		if (existingFileRecord.length > 0) {
			// Update existing record instead of creating duplicate
			fileId = existingFileRecord[0].id;
			await db.update(episodeFiles).set(fileData).where(eq(episodeFiles.id, fileId));
			logger.info('Updated existing episode file record', {
				fileId,
				relativePath,
				seriesId: seriesData.id
			});
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

		// Delete old files if this was an upgrade
		if (filesToReplace.length > 0) {
			for (const oldFileId of filesToReplace) {
				const deleteResult = await this.deleteEpisodeFile(oldFileId, seriesData.id);
				if (deleteResult.success) {
					logger.info('Successfully deleted old episode file during upgrade', {
						seriesId: seriesData.id,
						replacedFileId: oldFileId
					});
				} else {
					logger.warn('Failed to delete old episode file during upgrade', {
						seriesId: seriesData.id,
						replacedFileId: oldFileId,
						error: deleteResult.error
					});
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
			replacedFileId: filesToReplace.length > 0 ? filesToReplace[0] : undefined
		};
	}

	/**
	 * Find importable video files in a directory
	 */
	private async findImportableFiles(
		downloadPath: string
	): Promise<Array<{ path: string; size: number }>> {
		const files: Array<{ path: string; size: number }> = [];

		try {
			const stats = await stat(downloadPath);

			if (stats.isFile()) {
				// Single file download
				if (this.isImportableFile(downloadPath, stats.size)) {
					files.push({ path: downloadPath, size: stats.size });
				}
			} else if (stats.isDirectory()) {
				// Directory - find all video files
				const videoFiles = await findVideoFiles(downloadPath);

				for (const filePath of videoFiles) {
					try {
						const fileStats = await stat(filePath);
						if (this.isImportableFile(filePath, fileStats.size)) {
							files.push({ path: filePath, size: fileStats.size });
						}
					} catch {
						// Skip files we can't stat
					}
				}
			}
		} catch (error) {
			logger.error('Failed to scan download path', {
				downloadPath,
				error: error instanceof Error ? error.message : String(error)
			});
		}

		return files;
	}

	/**
	 * Check if a file should be imported
	 */
	private isImportableFile(filePath: string, size: number): boolean {
		// Check size
		if (size < DOWNLOAD.MIN_IMPORT_SIZE_BYTES) {
			return false;
		}

		// Check extension
		const ext = extname(filePath).toLowerCase();
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
	 * Get a NamingService instance with current database config
	 */
	private getNamingService(): NamingService {
		const config = namingSettingsService.getConfigSync();
		return new NamingService(config);
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
		episodeTitle?: string
	): string {
		const parsed = this.parser.parse(queueItem.title);

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
			episodeTitle: episodeTitle
		};

		return this.getNamingService().generateEpisodeFileName(namingInfo);
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
					logger.info('Deleted old movie file', { fileId, path: fullPath });
				}
			} catch (error) {
				logger.warn('Failed to delete physical file (continuing anyway)', {
					fileId,
					path: fullPath,
					error: error instanceof Error ? error.message : String(error)
				});
			}

			// Delete database record
			await db.delete(movieFiles).where(eq(movieFiles.id, fileId));

			logger.info('Deleted movie file record', { fileId, movieId });
			return { success: true };
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			logger.error('Failed to delete movie file', { fileId, error: errorMessage });
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
					logger.info('Deleted old episode file', { fileId, path: fullPath });
				}
			} catch (error) {
				logger.warn('Failed to delete physical file (continuing anyway)', {
					fileId,
					path: fullPath,
					error: error instanceof Error ? error.message : String(error)
				});
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

			logger.info('Deleted episode file record', { fileId, seriesId });
			return { success: true };
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			logger.error('Failed to delete episode file', { fileId, error: errorMessage });
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
				logger.debug('[ImportService] Subtitle search on import is disabled', {
					mediaType,
					mediaId
				});
				return;
			}

			// Use the standalone import service for subtitle search
			const result = await searchSubtitlesForNewMedia(mediaType, mediaId);

			logger.info('[ImportService] Post-import subtitle search completed', {
				mediaType,
				mediaId,
				downloaded: result.downloaded,
				errors: result.errors.length
			});
		} catch (error) {
			// Log but don't fail - subtitle search is supplementary
			logger.warn('[ImportService] Post-import subtitle search failed', {
				mediaType,
				mediaId,
				error: error instanceof Error ? error.message : String(error)
			});
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
				logger.warn('[ImportService] Failed to search subtitles for episode', {
					episodeId,
					error: error instanceof Error ? error.message : String(error)
				});
			}
		}

		logger.info('[ImportService] Post-import episode subtitle search completed', {
			episodeCount: uniqueEpisodeIds.size,
			downloaded: totalDownloaded,
			errors: totalErrors
		});
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

		await db.insert(downloadHistory).values({
			downloadClientId: queueItem.downloadClientId,
			downloadClientName: client?.name,
			downloadId: queueItem.downloadId,
			title: queueItem.title,
			indexerId: queueItem.indexerId,
			indexerName: queueItem.indexerName,
			protocol: queueItem.protocol,
			movieId: queueItem.movieId,
			seriesId: queueItem.seriesId,
			episodeIds: queueItem.episodeIds as string[],
			seasonNumber: queueItem.seasonNumber,
			status,
			statusReason: extras.statusReason,
			size: queueItem.size,
			downloadTimeSeconds,
			finalRatio: queueItem.ratio,
			quality: queueItem.quality as typeof downloadHistory.$inferInsert.quality,
			importedPath: extras.importedPath,
			movieFileId: extras.movieFileId,
			episodeFileIds: extras.episodeFileIds,
			grabbedAt: queueItem.addedAt,
			completedAt: queueItem.completedAt,
			importedAt: new Date().toISOString()
		});
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
