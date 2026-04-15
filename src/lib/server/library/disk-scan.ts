/**
 * Disk Scan Service
 *
 * Recursively scans root folders for video files, filters out samples/extras,
 * and detects new, changed, or removed files by comparing against the database.
 */

import { readdir, stat } from 'fs/promises';
import { join, dirname, relative } from 'path';
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
import { createChildLogger } from '$lib/logging';
import { DOWNLOAD } from '$lib/config/constants';
import {
	findOverlappingRootFolder,
	getRootFolderOverlapMessage
} from '$lib/server/filesystem/root-folder-overlap.js';
import { libraryMediaEvents } from './LibraryMediaEvents.js';
import {
	getMediaParseStem,
	matchEpisodesByIdentifier,
	resolveTvEpisodeIdentifier
} from './tv-episode-resolver.js';

const logger = createChildLogger({ logDomain: 'scans' as const });

/**
 * Patterns to filter out sample/extra files
 * Based on Radarr/Sonarr patterns
 */
const EXCLUDED_PATTERNS = {
	samples: [/\bsample\b/i],
	excludedFolders: [
		/^\./,
		/^@/,
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
		/^specials?$/i,
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
	rootFolderPath: string;
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

	get scanning(): boolean {
		return this.isScanning;
	}

	get activeScanId(): string | null {
		return this.currentScanId;
	}

	private shouldExcludeFolder(folderName: string): boolean {
		return EXCLUDED_PATTERNS.excludedFolders.some((pattern) => pattern.test(folderName));
	}

	private shouldExcludeFile(fileName: string, filePath: string): boolean {
		if (EXCLUDED_PATTERNS.samples.some((pattern) => pattern.test(fileName))) {
			return true;
		}

		const pathParts = filePath.split('/');
		for (const part of pathParts) {
			if (this.shouldExcludeFolder(part)) {
				return true;
			}
		}

		return false;
	}

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
					if (this.shouldExcludeFolder(entry.name)) {
						continue;
					}

					const subFiles = await this.discoverFiles(rootPath, fullPath);
					files.push(...subFiles);
				} else if (entry.isFile()) {
					if (!isVideoFile(entry.name)) {
						continue;
					}

					const relativePath = relative(rootPath, fullPath);
					if (this.shouldExcludeFile(entry.name, relativePath)) {
						continue;
					}

					try {
						const stats = await stat(fullPath);

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
						logger.warn(
							{
								fullPath,
								error: statError instanceof Error ? statError.message : String(statError)
							},
							'[DiskScan] Could not stat file'
						);
					}
				} else if (entry.isSymbolicLink()) {
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
						logger.warn(
							{
								fullPath,
								error: statError instanceof Error ? statError.message : String(statError)
							},
							'[DiskScan] Could not stat symlinked file'
						);
					}
				}
			}
		} catch (error) {
			logger.error(
				{ err: error instanceof Error ? error : undefined, ...{ currentPath } },
				'[DiskScan] Error reading directory'
			);
		}

		return files;
	}

	async scanRootFolder(rootFolderId: string): Promise<ScanResult> {
		if (this.isScanning) {
			throw new Error('A scan is already in progress');
		}

		const startTime = Date.now();
		this.isScanning = true;

		const [rootFolder] = await db
			.select()
			.from(rootFolders)
			.where(eq(rootFolders.id, rootFolderId));

		if (!rootFolder) {
			this.isScanning = false;
			throw new Error(`Root folder not found: ${rootFolderId}`);
		}

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
			await this.assertNoRootFolderOverlap(rootFolderId, rootFolder.path);

			const discoveredFiles = await this.discoverFiles(rootFolder.path);
			progress.filesFound = discoveredFiles.length;
			progress.phase = 'processing';
			this.emit('progress', progress);

			const existingFiles = await this.getExistingFiles(rootFolderId, rootFolder.mediaType);
			const seenPaths = new Set<string>();

			for (const file of discoveredFiles) {
				progress.currentFile = file.relativePath;
				this.emit('progress', progress);

				seenPaths.add(file.path);
				const existingFile = existingFiles.get(file.path);

				if (!existingFile) {
					let wasLinked = false;

					if (rootFolder.mediaType === 'tv') {
						wasLinked = await this.tryAutoLinkTvFile(file, rootFolderId, rootFolder.path);
					}

					if (!wasLinked) {
						await this.addUnmatchedFile(file, rootFolderId, rootFolder.mediaType);
						progress.unmatchedCount++;
					}

					progress.filesAdded++;
				} else if (existingFile.size !== file.size) {
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

			for (const [path, existingFile] of existingFiles) {
				if (!seenPaths.has(path)) {
					await this.removeFile(existingFile.id, rootFolder.mediaType);
					progress.filesRemoved++;
				}
			}

			await this.reconcileMediaPresence(rootFolderId, rootFolder.mediaType);

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
				rootFolderPath: rootFolder.path,
				filesScanned: progress.filesFound,
				filesAdded: progress.filesAdded,
				filesUpdated: progress.filesUpdated,
				filesRemoved: progress.filesRemoved,
				unmatchedFiles: progress.unmatchedCount,
				duration: Date.now() - startTime
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';

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
				rootFolderPath: rootFolder.path,
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

	private chunkArray<T>(values: T[], chunkSize = DB_CHUNK_SIZE): T[][] {
		if (values.length === 0) return [];
		const chunks: T[][] = [];
		for (let i = 0; i < values.length; i += chunkSize) {
			chunks.push(values.slice(i, i + chunkSize));
		}
		return chunks;
	}

	private async assertNoRootFolderOverlap(
		rootFolderId: string,
		rootFolderPath: string
	): Promise<void> {
		const existingFolders = await db
			.select({
				id: rootFolders.id,
				path: rootFolders.path,
				name: rootFolders.name
			})
			.from(rootFolders);
		const overlap = await findOverlappingRootFolder(rootFolderPath, existingFolders, rootFolderId);
		if (overlap) {
			throw new Error(getRootFolderOverlapMessage(rootFolderPath, overlap));
		}
	}

	private async reconcileMediaPresence(rootFolderId: string, mediaType: string): Promise<void> {
		if (mediaType === 'movie') {
			await this.reconcileMoviePresence(rootFolderId);
			return;
		}

		if (mediaType === 'tv') {
			await this.reconcileEpisodePresence(rootFolderId);
		}
	}

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
			logger.info(
				{
					rootFolderId,
					changedMovies: changedMovieIds.length
				},
				'[DiskScan] Reconciled movie file state'
			);

			for (const movieId of changedMovieIds) {
				libraryMediaEvents.emitMovieUpdated(movieId);
			}
		}
	}

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

		for (const seriesId of seriesIds) {
			await this.updateSeriesAndSeasonStats(seriesId);
		}

		if (episodeIdsToSetTrue.length > 0 || episodeIdsToSetFalse.length > 0) {
			logger.info(
				{
					rootFolderId,
					episodesSetTrue: episodeIdsToSetTrue.length,
					episodesSetFalse: episodeIdsToSetFalse.length
				},
				'[DiskScan] Reconciled episode file state'
			);
		}

		for (const seriesId of touchedSeriesIds) {
			libraryMediaEvents.emitSeriesUpdated(seriesId);
		}
	}

	async scanAll(): Promise<ScanResult[]> {
		const allRootFolders = await db.select().from(rootFolders);
		const results: ScanResult[] = [];

		for (const folder of allRootFolders) {
			try {
				const result = await this.scanRootFolder(folder.id);
				results.push(result);
			} catch (error) {
				logger.error(
					{ err: error instanceof Error ? error : undefined, ...{ folderPath: folder.path } },
					'[DiskScan] Error scanning folder'
				);
			}
		}

		return results;
	}

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

	private async tryAutoLinkTvFile(
		file: DiscoveredFile,
		rootFolderId: string,
		rootFolderPath: string
	): Promise<boolean> {
		const seriesInFolder = await db
			.select({
				id: series.id,
				path: series.path,
				seasonFolder: series.seasonFolder,
				seriesType: series.seriesType
			})
			.from(series)
			.where(eq(series.rootFolderId, rootFolderId));

		for (const s of seriesInFolder) {
			const seriesFullPath = join(rootFolderPath, s.path);

			if (file.path.startsWith(seriesFullPath + '/')) {
				const relativePath = relative(seriesFullPath, file.path);
				const fileName = getMediaParseStem(file.path);
				const parsed = this.parser.parse(fileName);
				const identifier = resolveTvEpisodeIdentifier({
					filePath: file.path,
					parsed,
					seriesType:
						s.seriesType === 'anime' || s.seriesType === 'daily' ? s.seriesType : 'standard'
				});

				if (!identifier) {
					logger.debug({ fileName }, '[DiskScan] Could not resolve episode mapping from filename');
					return false;
				}

				const existingFile = await db
					.select()
					.from(episodeFiles)
					.where(and(eq(episodeFiles.seriesId, s.id), eq(episodeFiles.relativePath, relativePath)))
					.limit(1);

				if (existingFile.length > 0) {
					logger.debug({ relativePath }, '[DiskScan] File already linked');
					return true;
				}

				const seriesEpisodes = await db.select().from(episodes).where(eq(episodes.seriesId, s.id));
				const matchingEpisodes = matchEpisodesByIdentifier(seriesEpisodes, identifier);
				const episodeIds = matchingEpisodes.map((ep) => ep.id);
				const seasonNum = matchingEpisodes[0]?.seasonNumber;
				const episodeNums = matchingEpisodes.map((ep) => ep.episodeNumber);

				if (episodeIds.length === 0 || seasonNum === undefined) {
					logger.debug(
						{
							fileName,
							identifier,
							seriesId: s.id
						},
						'[DiskScan] No matching episodes in DB for file'
					);
					return false;
				}

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

				for (const epId of episodeIds) {
					await db.update(episodes).set({ hasFile: true }).where(eq(episodes.id, epId));
				}

				await this.updateSeriesAndSeasonStats(s.id);

				logger.info(
					{
						relativePath,
						season: seasonNum,
						episodes: episodeNums
					},
					'[DiskScan] Auto-linked episode file'
				);
				return true;
			}
		}

		return false;
	}

	private async updateSeriesAndSeasonStats(seriesId: string): Promise<void> {
		const allEpisodes = await db.select().from(episodes).where(eq(episodes.seriesId, seriesId));

		const [seriesData] = await db
			.select({ monitorSpecials: series.monitorSpecials })
			.from(series)
			.where(eq(series.id, seriesId));
		const monitorSpecials = seriesData?.monitorSpecials ?? false;

		const today = new Date().toISOString().split('T')[0];
		const isAired = (episode: typeof episodes.$inferSelect) =>
			episode.airDate && episode.airDate !== '' && episode.airDate <= today;

		const episodesForStats = allEpisodes.filter(
			(episode) => isAired(episode) && (monitorSpecials || episode.seasonNumber !== 0)
		);
		const episodesWithFiles = episodesForStats.filter((episode) => episode.hasFile);

		await db
			.update(series)
			.set({
				episodeFileCount: episodesWithFiles.length,
				episodeCount: episodesForStats.length
			})
			.where(eq(series.id, seriesId));

		const seasonMap = new Map<number, { total: number; withFiles: number }>();
		for (const episode of allEpisodes) {
			if (!isAired(episode)) continue;
			const stats = seasonMap.get(episode.seasonNumber) || { total: 0, withFiles: 0 };
			stats.total++;
			if (episode.hasFile) stats.withFiles++;
			seasonMap.set(episode.seasonNumber, stats);
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

	private async addUnmatchedFile(
		file: DiscoveredFile,
		rootFolderId: string,
		mediaType: string
	): Promise<void> {
		const fileName = getMediaParseStem(file.path);
		const parsed = this.parser.parse(fileName);
		const identifier = resolveTvEpisodeIdentifier({
			filePath: file.path,
			parsed
		});

		await db.insert(unmatchedFiles).values({
			path: file.path,
			rootFolderId,
			mediaType,
			size: file.size,
			parsedTitle: parsed.cleanTitle || null,
			parsedYear: parsed.year || null,
			parsedSeason: identifier?.numbering === 'standard' ? identifier.seasonNumber : null,
			parsedEpisode: identifier?.numbering === 'standard' ? identifier.episodeNumbers[0] : null,
			reason: 'no_match'
		});
	}

	private async updateFileMediaInfo(
		fileId: string,
		file: DiscoveredFile,
		mediaType: string,
		allowStrmProbe = true
	): Promise<void> {
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

	private async removeFile(fileId: string, mediaType: string): Promise<void> {
		if (mediaType === 'movie') {
			await db.delete(movieFiles).where(eq(movieFiles.id, fileId));
		} else {
			await db.delete(episodeFiles).where(eq(episodeFiles.id, fileId));
		}

		await db.delete(unmatchedFiles).where(eq(unmatchedFiles.id, fileId));
	}
}

export const diskScanService = DiskScanService.getInstance();
