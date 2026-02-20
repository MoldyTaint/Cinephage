/**
 * Disk Scan Service
 *
 * Recursively scans root folders for video files, filters out samples/extras,
 * and detects new, changed, or removed files by comparing against the database.
 */

import { readdir, stat } from 'fs/promises';
import { join, basename, dirname, relative, extname } from 'path';
import { db } from '$lib/server/db/index.js';
import {
	rootFolders,
	movies,
	movieFiles,
	series,
	seasons,
	episodes,
	episodeFiles,
	unmatchedFiles,
	libraryScanHistory
} from '$lib/server/db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { isVideoFile, mediaInfoService } from './media-info.js';
import { ReleaseParser } from '$lib/server/indexers/parser/ReleaseParser.js';
import { EventEmitter } from 'events';
import { logger } from '$lib/logging';
import { DOWNLOAD } from '$lib/config/constants';
import { libraryMediaEvents } from './LibraryMediaEvents.js';

/**
 * Patterns to filter out sample/extra files
 * Based on Radarr/Sonarr patterns
 */
const EXCLUDED_PATTERNS = {
	// Sample files
	samples: [/\bsample\b/i, /\btrailer\b/i, /\bteaser\b/i, /\bpromo\b/i, /\bpreview\b/i],
	// Extras/featurettes
	extras: [
		/\bfeaturette\b/i,
		/\bbehind[\s._-]?the[\s._-]?scenes?\b/i,
		/\bdeleted[\s._-]?scenes?\b/i,
		/\bbloopers?\b/i,
		/\bgag[\s._-]?reel\b/i,
		/\binterview\b/i,
		/\bcommentary\b/i,
		/\bmaking[\s._-]?of\b/i,
		/\bbonus\b/i,
		/\bextras?\b/i,
		/\bspecial[\s._-]?features?\b/i
	],
	// Folders to skip entirely
	excludedFolders: [
		/^\./, // Hidden folders
		/^@/, // System folders like @eaDir (Synology)
		/^#recycle$/i,
		/^lost\+found$/i,
		/^\$recycle\.bin$/i,
		/^system volume information$/i,
		/^thumbs\.db$/i,
		/^\.ds_store$/i,
		/^samples?$/i,
		/^extras?$/i,
		/^featurettes?$/i,
		/^behind[\s._-]?the[\s._-]?scenes?$/i,
		/^deleted[\s._-]?scenes?$/i,
		/^specials?$/i, // Note: May need to handle /Season 00/ specially for TV
		/^subs?$/i,
		/^subtitles?$/i
	]
};

/**
 * SQLite has a practical limit on bound parameters; keep IN queries chunked.
 */
const DB_CHUNK_SIZE = 400;

/**
 * Discovered file information
 */
export interface DiscoveredFile {
	path: string;
	relativePath: string;
	size: number;
	modifiedAt: Date;
	parentFolder: string;
}

/**
 * Scan progress information
 */
export interface ScanProgress {
	phase: 'scanning' | 'processing' | 'matching' | 'complete';
	rootFolderId: string;
	rootFolderPath: string;
	filesFound: number;
	filesProcessed: number;
	filesAdded: number;
	filesUpdated: number;
	filesRemoved: number;
	unmatchedCount: number;
	currentFile?: string;
	error?: string;
}

/**
 * Scan result summary
 */
export interface ScanResult {
	success: boolean;
	scanId: string;
	rootFolderId: string;
	filesScanned: number;
	filesAdded: number;
	filesUpdated: number;
	filesRemoved: number;
	unmatchedFiles: number;
	duration: number;
	error?: string;
}

/**
 * DiskScanService - Scan filesystem for media files
 */
export class DiskScanService extends EventEmitter {
	private static instance: DiskScanService;
	private parser: ReleaseParser;
	private isScanning = false;
	private currentScanId: string | null = null;

	private constructor() {
		super();
		this.parser = new ReleaseParser();
	}

	static getInstance(): DiskScanService {
		if (!DiskScanService.instance) {
			DiskScanService.instance = new DiskScanService();
		}
		return DiskScanService.instance;
	}

	/**
	 * Check if a scan is currently running
	 */
	get scanning(): boolean {
		return this.isScanning;
	}

	/**
	 * Get current scan ID if scanning
	 */
	get activeScanId(): string | null {
		return this.currentScanId;
	}

	/**
	 * Check if a folder name should be excluded from scanning
	 */
	private shouldExcludeFolder(folderName: string): boolean {
		return EXCLUDED_PATTERNS.excludedFolders.some((pattern) => pattern.test(folderName));
	}

	/**
	 * Check if a file should be excluded (sample, extra, etc.)
	 */
	private shouldExcludeFile(fileName: string, filePath: string): boolean {
		// Check samples
		if (EXCLUDED_PATTERNS.samples.some((pattern) => pattern.test(fileName))) {
			return true;
		}

		// Check extras
		if (EXCLUDED_PATTERNS.extras.some((pattern) => pattern.test(fileName))) {
			return true;
		}

		// Check if in excluded folder
		const pathParts = filePath.split('/');
		for (const part of pathParts) {
			if (this.shouldExcludeFolder(part)) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Recursively discover video files in a directory
	 */
	private async discoverFiles(
		rootPath: string,
		currentPath: string = rootPath
	): Promise<DiscoveredFile[]> {
		const files: DiscoveredFile[] = [];

		try {
			const entries = await readdir(currentPath, { withFileTypes: true });

			for (const entry of entries) {
				const fullPath = join(currentPath, entry.name);

				if (entry.isDirectory()) {
					// Skip excluded folders
					if (this.shouldExcludeFolder(entry.name)) {
						continue;
					}

					// Recurse into subdirectory
					const subFiles = await this.discoverFiles(rootPath, fullPath);
					files.push(...subFiles);
				} else if (entry.isFile()) {
					// Check if it's a video file
					if (!isVideoFile(entry.name)) {
						continue;
					}

					// Check if should be excluded
					const relativePath = relative(rootPath, fullPath);
					if (this.shouldExcludeFile(entry.name, relativePath)) {
						continue;
					}

					// Get file stats
					try {
						const stats = await stat(fullPath);

						// Skip files below minimum size (except .strm streaming placeholders)
						if (stats.size < DOWNLOAD.MIN_SCAN_SIZE_BYTES && !entry.name.endsWith('.strm')) {
							continue;
						}

						files.push({
							path: fullPath,
							relativePath,
							size: stats.size,
							modifiedAt: stats.mtime,
							parentFolder: dirname(relativePath) || '.'
						});
					} catch (statError) {
						logger.warn('[DiskScan] Could not stat file', {
							fullPath,
							error: statError instanceof Error ? statError.message : String(statError)
						});
					}
				} else if (entry.isSymbolicLink()) {
					// Include symlinked files (e.g., NZB-Mount/rclone strategies),
					// but avoid recursing through symlinked directories.
					if (!isVideoFile(entry.name)) {
						continue;
					}

					const relativePath = relative(rootPath, fullPath);
					if (this.shouldExcludeFile(entry.name, relativePath)) {
						continue;
					}

					try {
						const stats = await stat(fullPath);
						if (!stats.isFile()) {
							continue;
						}

						// Skip files below minimum size (except .strm streaming placeholders)
						if (stats.size < DOWNLOAD.MIN_SCAN_SIZE_BYTES && !entry.name.endsWith('.strm')) {
							continue;
						}

						files.push({
							path: fullPath,
							relativePath,
							size: stats.size,
							modifiedAt: stats.mtime,
							parentFolder: dirname(relativePath) || '.'
						});
					} catch (statError) {
						logger.warn('[DiskScan] Could not stat symlinked file', {
							fullPath,
							error: statError instanceof Error ? statError.message : String(statError)
						});
					}
				}
			}
		} catch (error) {
			logger.error(
				'[DiskScan] Error reading directory',
				error instanceof Error ? error : undefined,
				{ currentPath }
			);
		}

		return files;
	}

	/**
	 * Scan a root folder for media files
	 */
	async scanRootFolder(rootFolderId: string): Promise<ScanResult> {
		if (this.isScanning) {
			throw new Error('A scan is already in progress');
		}

		const startTime = Date.now();
		this.isScanning = true;

		// Get root folder details
		const [rootFolder] = await db
			.select()
			.from(rootFolders)
			.where(eq(rootFolders.id, rootFolderId));

		if (!rootFolder) {
			this.isScanning = false;
			throw new Error(`Root folder not found: ${rootFolderId}`);
		}

		// Create scan history record
		const [scanRecord] = await db
			.insert(libraryScanHistory)
			.values({
				scanType: 'folder',
				rootFolderId,
				status: 'running'
			})
			.returning();

		this.currentScanId = scanRecord.id;

		const progress: ScanProgress = {
			phase: 'scanning',
			rootFolderId,
			rootFolderPath: rootFolder.path,
			filesFound: 0,
			filesProcessed: 0,
			filesAdded: 0,
			filesUpdated: 0,
			filesRemoved: 0,
			unmatchedCount: 0
		};

		try {
			this.emit('progress', progress);

			// Discover files
			const discoveredFiles = await this.discoverFiles(rootFolder.path);
			progress.filesFound = discoveredFiles.length;
			progress.phase = 'processing';
			this.emit('progress', progress);

			// Get existing files from database
			const existingFiles = await this.getExistingFiles(rootFolderId, rootFolder.mediaType);

			// Track which files we've seen
			const seenPaths = new Set<string>();

			// Process each discovered file
			for (const file of discoveredFiles) {
				progress.currentFile = file.relativePath;
				this.emit('progress', progress);

				seenPaths.add(file.path);
				const existingFile = existingFiles.get(file.path);

				if (!existingFile) {
					// New file - try to auto-link if TV, otherwise add to unmatched
					let wasLinked = false;

					if (rootFolder.mediaType === 'tv') {
						// Try to auto-link TV file to known series
						wasLinked = await this.tryAutoLinkTvFile(file, rootFolderId, rootFolder.path);
					}

					if (!wasLinked) {
						// Add to unmatched for MediaMatcherService to handle
						await this.addUnmatchedFile(file, rootFolderId, rootFolder.mediaType);
						progress.unmatchedCount++;
					}

					progress.filesAdded++;
				} else if (existingFile.size !== file.size) {
					// File changed - update media info
					await this.updateFileMediaInfo(
						existingFile.id,
						file,
						rootFolder.mediaType,
						existingFile.allowStrmProbe
					);
					progress.filesUpdated++;
				}

				progress.filesProcessed++;
				this.emit('progress', progress);
			}

			// Find removed files
			for (const [path, existingFile] of existingFiles) {
				if (!seenPaths.has(path)) {
					await this.removeFile(existingFile.id, rootFolder.mediaType);
					progress.filesRemoved++;
				}
			}

			// Reconcile denormalized hasFile flags and cached counts with actual file records.
			// This keeps manual scans and watcher-triggered scans consistent with filesystem reality.
			await this.reconcileMediaPresence(rootFolderId, rootFolder.mediaType);

			// Update scan record
			await db
				.update(libraryScanHistory)
				.set({
					status: 'completed',
					completedAt: new Date().toISOString(),
					filesScanned: progress.filesFound,
					filesAdded: progress.filesAdded,
					filesUpdated: progress.filesUpdated,
					filesRemoved: progress.filesRemoved,
					unmatchedFiles: progress.unmatchedCount
				})
				.where(eq(libraryScanHistory.id, scanRecord.id));

			progress.phase = 'complete';
			this.emit('progress', progress);

			return {
				success: true,
				scanId: scanRecord.id,
				rootFolderId,
				filesScanned: progress.filesFound,
				filesAdded: progress.filesAdded,
				filesUpdated: progress.filesUpdated,
				filesRemoved: progress.filesRemoved,
				unmatchedFiles: progress.unmatchedCount,
				duration: Date.now() - startTime
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';

			// Update scan record with error
			await db
				.update(libraryScanHistory)
				.set({
					status: 'failed',
					completedAt: new Date().toISOString(),
					errorMessage
				})
				.where(eq(libraryScanHistory.id, scanRecord.id));

			progress.phase = 'complete';
			progress.error = errorMessage;
			this.emit('progress', progress);

			return {
				success: false,
				scanId: scanRecord.id,
				rootFolderId,
				filesScanned: progress.filesFound,
				filesAdded: progress.filesAdded,
				filesUpdated: progress.filesUpdated,
				filesRemoved: progress.filesRemoved,
				unmatchedFiles: progress.unmatchedCount,
				duration: Date.now() - startTime,
				error: errorMessage
			};
		} finally {
			this.isScanning = false;
			this.currentScanId = null;
		}
	}

	/**
	 * Split large IN-list operations into safe chunks for SQLite.
	 */
	private chunkArray<T>(values: T[], chunkSize = DB_CHUNK_SIZE): T[][] {
		if (values.length === 0) return [];
		const chunks: T[][] = [];
		for (let i = 0; i < values.length; i += chunkSize) {
			chunks.push(values.slice(i, i + chunkSize));
		}
		return chunks;
	}

	/**
	 * Reconcile hasFile booleans with current file records.
	 * This repairs stale state caused by external filesystem changes and keeps
	 * Missing Content task inputs accurate.
	 */
	private async reconcileMediaPresence(rootFolderId: string, mediaType: string): Promise<void> {
		if (mediaType === 'movie') {
			await this.reconcileMoviePresence(rootFolderId);
			return;
		}

		if (mediaType === 'tv') {
			await this.reconcileEpisodePresence(rootFolderId);
			return;
		}
	}

	/**
	 * Reconcile movie hasFile flags from movieFiles rows.
	 */
	private async reconcileMoviePresence(rootFolderId: string): Promise<void> {
		const moviesInFolder = await db
			.select({ id: movies.id, hasFile: movies.hasFile })
			.from(movies)
			.where(eq(movies.rootFolderId, rootFolderId));

		if (moviesInFolder.length === 0) {
			return;
		}

		const movieIds = moviesInFolder.map((movie) => movie.id);
		const moviesWithFiles = new Set<string>();

		for (const idChunk of this.chunkArray(movieIds)) {
			const fileRows = await db
				.select({ movieId: movieFiles.movieId })
				.from(movieFiles)
				.where(inArray(movieFiles.movieId, idChunk));

			for (const row of fileRows) {
				moviesWithFiles.add(row.movieId);
			}
		}

		const changedMovieIds: string[] = [];
		for (const movie of moviesInFolder) {
			const shouldHaveFile = moviesWithFiles.has(movie.id);
			const currentlyHasFile = movie.hasFile ?? false;
			if (shouldHaveFile === currentlyHasFile) {
				continue;
			}

			const lostFile = currentlyHasFile && !shouldHaveFile;
			await db
				.update(movies)
				.set({
					hasFile: shouldHaveFile,
					...(lostFile ? { lastSearchTime: null } : {})
				})
				.where(eq(movies.id, movie.id));
			changedMovieIds.push(movie.id);
		}

		if (changedMovieIds.length > 0) {
			logger.info('[DiskScan] Reconciled movie file state', {
				rootFolderId,
				changedMovies: changedMovieIds.length
			});

			for (const movieId of changedMovieIds) {
				libraryMediaEvents.emitMovieUpdated(movieId);
			}
		}
	}

	/**
	 * Reconcile episode hasFile flags from episodeFiles rows and refresh series/season counts.
	 */
	private async reconcileEpisodePresence(rootFolderId: string): Promise<void> {
		const seriesInFolder = await db
			.select({ id: series.id })
			.from(series)
			.where(eq(series.rootFolderId, rootFolderId));

		if (seriesInFolder.length === 0) {
			return;
		}

		const seriesIds = seriesInFolder.map((show) => show.id);
		const episodesInFolder: Array<{ id: string; seriesId: string; hasFile: boolean | null }> = [];

		for (const seriesChunk of this.chunkArray(seriesIds)) {
			const rows = await db
				.select({
					id: episodes.id,
					seriesId: episodes.seriesId,
					hasFile: episodes.hasFile
				})
				.from(episodes)
				.where(inArray(episodes.seriesId, seriesChunk));
			episodesInFolder.push(...rows);
		}

		const episodeIdsWithFiles = new Set<string>();
		for (const seriesChunk of this.chunkArray(seriesIds)) {
			const fileRows = await db
				.select({ episodeIds: episodeFiles.episodeIds })
				.from(episodeFiles)
				.where(inArray(episodeFiles.seriesId, seriesChunk));

			for (const file of fileRows) {
				const ids = file.episodeIds as string[] | null;
				for (const episodeId of ids ?? []) {
					episodeIdsWithFiles.add(episodeId);
				}
			}
		}

		const episodeIdsToSetTrue: string[] = [];
		const episodeIdsToSetFalse: string[] = [];
		const touchedSeriesIds = new Set<string>();

		for (const episode of episodesInFolder) {
			const shouldHaveFile = episodeIdsWithFiles.has(episode.id);
			const currentlyHasFile = episode.hasFile ?? false;

			if (shouldHaveFile && !currentlyHasFile) {
				episodeIdsToSetTrue.push(episode.id);
				touchedSeriesIds.add(episode.seriesId);
			} else if (!shouldHaveFile && currentlyHasFile) {
				episodeIdsToSetFalse.push(episode.id);
				touchedSeriesIds.add(episode.seriesId);
			}
		}

		for (const idChunk of this.chunkArray(episodeIdsToSetTrue)) {
			await db.update(episodes).set({ hasFile: true }).where(inArray(episodes.id, idChunk));
		}

		for (const idChunk of this.chunkArray(episodeIdsToSetFalse)) {
			await db
				.update(episodes)
				.set({ hasFile: false, lastSearchTime: null })
				.where(inArray(episodes.id, idChunk));
		}

		// Always refresh cached counts for series in this root folder.
		for (const seriesId of seriesIds) {
			await this.updateSeriesAndSeasonStats(seriesId);
		}

		if (episodeIdsToSetTrue.length > 0 || episodeIdsToSetFalse.length > 0) {
			logger.info('[DiskScan] Reconciled episode file state', {
				rootFolderId,
				episodesSetTrue: episodeIdsToSetTrue.length,
				episodesSetFalse: episodeIdsToSetFalse.length
			});
		}

		for (const seriesId of touchedSeriesIds) {
			libraryMediaEvents.emitSeriesUpdated(seriesId);
		}
	}

	/**
	 * Scan all root folders
	 */
	async scanAll(): Promise<ScanResult[]> {
		const allRootFolders = await db.select().from(rootFolders);
		const results: ScanResult[] = [];

		for (const folder of allRootFolders) {
			try {
				const result = await this.scanRootFolder(folder.id);
				results.push(result);
			} catch (error) {
				logger.error(
					'[DiskScan] Error scanning folder',
					error instanceof Error ? error : undefined,
					{ folderPath: folder.path }
				);
			}
		}

		return results;
	}

	/**
	 * Get existing files from database for a root folder
	 */
	private async getExistingFiles(
		rootFolderId: string,
		mediaType: string
	): Promise<
		Map<string, { id: string; path: string; size: number | null; allowStrmProbe: boolean }>
	> {
		const existingMap = new Map<
			string,
			{ id: string; path: string; size: number | null; allowStrmProbe: boolean }
		>();

		if (mediaType === 'movie') {
			// Get movie files via movies table
			const moviesInFolder = await db
				.select({ id: movies.id, path: movies.path, scoringProfileId: movies.scoringProfileId })
				.from(movies)
				.where(eq(movies.rootFolderId, rootFolderId));

			const movieIds = moviesInFolder.map((m) => m.id);
			if (movieIds.length > 0) {
				const files = await db
					.select({
						id: movieFiles.id,
						movieId: movieFiles.movieId,
						relativePath: movieFiles.relativePath,
						size: movieFiles.size
					})
					.from(movieFiles)
					.where(inArray(movieFiles.movieId, movieIds));

				// Get root folder path
				const [folder] = await db
					.select({ path: rootFolders.path })
					.from(rootFolders)
					.where(eq(rootFolders.id, rootFolderId));

				if (folder) {
					for (const file of files) {
						const movie = moviesInFolder.find((m) => m.id === file.movieId);
						if (movie) {
							const fullPath = join(folder.path, movie.path, file.relativePath);
							existingMap.set(fullPath, {
								id: file.id,
								path: fullPath,
								size: file.size,
								allowStrmProbe: movie.scoringProfileId !== 'streamer'
							});
						}
					}
				}
			}
		} else {
			// Get episode files via series table
			const seriesInFolder = await db
				.select({ id: series.id, path: series.path, scoringProfileId: series.scoringProfileId })
				.from(series)
				.where(eq(series.rootFolderId, rootFolderId));

			const seriesIds = seriesInFolder.map((s) => s.id);
			if (seriesIds.length > 0) {
				const files = await db
					.select({
						id: episodeFiles.id,
						seriesId: episodeFiles.seriesId,
						relativePath: episodeFiles.relativePath,
						size: episodeFiles.size
					})
					.from(episodeFiles)
					.where(inArray(episodeFiles.seriesId, seriesIds));

				const [folder] = await db
					.select({ path: rootFolders.path })
					.from(rootFolders)
					.where(eq(rootFolders.id, rootFolderId));

				if (folder) {
					for (const file of files) {
						const seriesItem = seriesInFolder.find((s) => s.id === file.seriesId);
						if (seriesItem) {
							const fullPath = join(folder.path, seriesItem.path, file.relativePath);
							existingMap.set(fullPath, {
								id: file.id,
								path: fullPath,
								size: file.size,
								allowStrmProbe: seriesItem.scoringProfileId !== 'streamer'
							});
						}
					}
				}
			}
		}

		// Also include unmatched files
		const unmatched = await db
			.select({ id: unmatchedFiles.id, path: unmatchedFiles.path, size: unmatchedFiles.size })
			.from(unmatchedFiles)
			.where(eq(unmatchedFiles.rootFolderId, rootFolderId));

		for (const file of unmatched) {
			existingMap.set(file.path, {
				id: file.id,
				path: file.path,
				size: file.size,
				allowStrmProbe: true
			});
		}

		return existingMap;
	}

	/**
	 * Try to auto-link a TV file to a known series
	 * Returns true if successfully linked, false if should be added to unmatched
	 */
	private async tryAutoLinkTvFile(
		file: DiscoveredFile,
		rootFolderId: string,
		rootFolderPath: string
	): Promise<boolean> {
		// Get all series in this root folder
		const seriesInFolder = await db
			.select({ id: series.id, path: series.path, seasonFolder: series.seasonFolder })
			.from(series)
			.where(eq(series.rootFolderId, rootFolderId));

		// Check if this file is inside any series folder
		for (const s of seriesInFolder) {
			const seriesFullPath = join(rootFolderPath, s.path);

			if (file.path.startsWith(seriesFullPath + '/')) {
				// File is inside this series folder!
				const relativePath = relative(seriesFullPath, file.path);
				const fileName = basename(file.path, extname(file.path));
				const parsed = this.parser.parse(fileName);

				// Need season/episode info to proceed
				if (!parsed.episode?.season || !parsed.episode?.episodes?.length) {
					logger.debug('[DiskScan] Could not parse S/E from filename', { fileName });
					return false; // Fall back to unmatched
				}

				const seasonNum = parsed.episode.season;
				const episodeNums = parsed.episode.episodes;

				// Check if episode_file already exists
				const existingFile = await db
					.select()
					.from(episodeFiles)
					.where(and(eq(episodeFiles.seriesId, s.id), eq(episodeFiles.relativePath, relativePath)))
					.limit(1);

				if (existingFile.length > 0) {
					// Already linked, skip
					logger.debug('[DiskScan] File already linked', { relativePath });
					return true;
				}

				// Find matching episodes
				const matchingEpisodes = await db
					.select()
					.from(episodes)
					.where(and(eq(episodes.seriesId, s.id), eq(episodes.seasonNumber, seasonNum)));

				const episodeIds = matchingEpisodes
					.filter((ep) => episodeNums.includes(ep.episodeNumber))
					.map((ep) => ep.id);

				// If no episodes found in DB, we can't link this file - let it become unmatched
				// This prevents creating orphaned episode_files with empty episodeIds
				if (episodeIds.length === 0) {
					logger.debug('[DiskScan] No matching episodes in DB for file', {
						fileName,
						seasonNum,
						episodeNums,
						seriesId: s.id
					});
					return false; // Fall back to unmatched
				}

				// Determine quality - for .strm files, we only know it's streaming (quality determined at playback)
				const isStrmFile = file.path.endsWith('.strm');
				const quality = isStrmFile
					? {
							resolution: undefined,
							source: 'Streaming',
							codec: undefined,
							hdr: undefined
						}
					: {
							resolution: parsed.resolution ?? undefined,
							source: parsed.source ?? undefined,
							codec: parsed.codec ?? undefined,
							hdr: parsed.hdr ?? undefined
						};

				// Create episode_file record
				await db.insert(episodeFiles).values({
					seriesId: s.id,
					seasonNumber: seasonNum,
					episodeIds,
					relativePath,
					size: file.size,
					dateAdded: new Date().toISOString(),
					releaseGroup: isStrmFile ? 'Streaming' : (parsed.releaseGroup ?? undefined),
					releaseType: episodeNums.length > 1 ? 'multiEpisode' : 'singleEpisode',
					quality
				});

				// Update hasFile on matched episodes
				for (const epId of episodeIds) {
					await db.update(episodes).set({ hasFile: true }).where(eq(episodes.id, epId));
				}

				// Update series and season stats
				await this.updateSeriesAndSeasonStats(s.id);

				logger.info('[DiskScan] Auto-linked episode file', {
					relativePath,
					season: seasonNum,
					episodes: episodeNums
				});
				return true;
			}
		}

		return false; // File not in any known series folder
	}

	/**
	 * Update series and season episode counts (similar to ImportService)
	 */
	private async updateSeriesAndSeasonStats(seriesId: string): Promise<void> {
		const allEpisodes = await db.select().from(episodes).where(eq(episodes.seriesId, seriesId));

		// Exclude specials (season 0) from series-level counts
		const regularEpisodes = allEpisodes.filter((ep) => ep.seasonNumber !== 0);
		const regularEpisodesWithFiles = regularEpisodes.filter((ep) => ep.hasFile);

		// Update series
		await db
			.update(series)
			.set({
				episodeFileCount: regularEpisodesWithFiles.length,
				episodeCount: regularEpisodes.length
			})
			.where(eq(series.id, seriesId));

		// Group by season and update each
		const seasonMap = new Map<number, { total: number; withFiles: number }>();
		for (const ep of allEpisodes) {
			const stats = seasonMap.get(ep.seasonNumber) || { total: 0, withFiles: 0 };
			stats.total++;
			if (ep.hasFile) stats.withFiles++;
			seasonMap.set(ep.seasonNumber, stats);
		}

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
	 * Add a new file to the unmatched files table
	 */
	private async addUnmatchedFile(
		file: DiscoveredFile,
		rootFolderId: string,
		mediaType: string
	): Promise<void> {
		// Parse the filename to extract info
		const fileName = basename(file.path, extname(file.path));
		const parsed = this.parser.parse(fileName);

		await db.insert(unmatchedFiles).values({
			path: file.path,
			rootFolderId,
			mediaType,
			size: file.size,
			parsedTitle: parsed.cleanTitle || null,
			parsedYear: parsed.year || null,
			parsedSeason: parsed.episode?.season || null,
			parsedEpisode: parsed.episode?.episodes?.[0] || null,
			reason: 'no_match' // Will be updated by MediaMatcherService
		});
	}

	/**
	 * Update media info for an existing file
	 */
	private async updateFileMediaInfo(
		fileId: string,
		file: DiscoveredFile,
		mediaType: string,
		allowStrmProbe = true
	): Promise<void> {
		// Extract fresh media info
		const mediaInfo = await mediaInfoService.extractMediaInfo(file.path, { allowStrmProbe });

		if (mediaType === 'movie') {
			await db
				.update(movieFiles)
				.set({
					size: file.size,
					mediaInfo
				})
				.where(eq(movieFiles.id, fileId));
		} else {
			await db
				.update(episodeFiles)
				.set({
					size: file.size,
					mediaInfo
				})
				.where(eq(episodeFiles.id, fileId));
		}
	}

	/**
	 * Remove a file record from the database
	 */
	private async removeFile(fileId: string, mediaType: string): Promise<void> {
		if (mediaType === 'movie') {
			await db.delete(movieFiles).where(eq(movieFiles.id, fileId));
		} else {
			await db.delete(episodeFiles).where(eq(episodeFiles.id, fileId));
		}

		// Also try to remove from unmatched (in case it was there)
		await db.delete(unmatchedFiles).where(eq(unmatchedFiles.id, fileId));
	}
}

export const diskScanService = DiskScanService.getInstance();
