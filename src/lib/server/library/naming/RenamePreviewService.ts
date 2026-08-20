/**
 * Rename Preview Service
 *
 * Provides dry-run preview and execution of file renames based on naming settings.
 * Allows users to see what would change before applying renames.
 */

import { db } from '$lib/server/db';
import {
	movies,
	movieFiles,
	series,
	seasons,
	episodes,
	episodeFiles,
	rootFolders,
	renameHistory,
	renamingFailures
} from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { extname, join, dirname, basename, resolve } from 'path';
import { createChildLogger } from '$lib/logging';
import { todayDateString } from '$lib/utils/format.js';
import { randomUUID } from 'node:crypto';

const logger = createChildLogger({ logDomain: 'scans' as const });
import { NamingService, type MediaNamingInfo } from './NamingService';
import { namingSettingsService } from './NamingSettingsService';
import { moveFile, fileExists } from '$lib/server/downloadClients/import/FileTransfer';
import { ReleaseParser } from '$lib/server/indexers/parser/ReleaseParser';
import { rename, stat, readdir, rmdir } from 'node:fs/promises';
import { chooseBestParsedRelease } from './preview-metadata';
import {
	getMediaBrowserManager,
	getMediaBrowserNotifier
} from '$lib/server/notifications/mediabrowser';

// Types are defined in $lib/library/naming/types.ts (outside the server
// bundle) so .svelte files can import them without pulling server code
// into the client. Re-exported here for server-internal consumers.
export type {
	RenameStatus,
	RenamePreviewItem,
	RenamePreviewResult,
	RenameExecuteResult,
	ReorganizeRequestItem,
	ReorganizeBatchResult
} from '$lib/library/naming/types.js';

import type {
	RenamePreviewItem,
	RenamePreviewResult,
	RenameExecuteResult
} from '$lib/library/naming/types.js';

/**
 * Create an empty preview result
 */
function emptyPreviewResult(): RenamePreviewResult {
	return {
		willChange: [],
		alreadyCorrect: [],
		collisions: [],
		errors: [],
		totalFiles: 0,
		totalWillChange: 0,
		totalAlreadyCorrect: 0,
		totalCollisions: 0,
		totalErrors: 0
	};
}

/**
 * Convert audio channels number to string format (e.g., 6 -> "5.1")
 */
function formatAudioChannels(channels?: number): string | undefined {
	if (!channels) return undefined;

	const channelMap: Record<number, string> = {
		1: '1.0',
		2: '2.0',
		6: '5.1',
		8: '7.1'
	};

	return channelMap[channels] || `${channels}.0`;
}

async function recordRenamingFailure(opts: {
	fileId: string;
	fileType: 'movie' | 'episode';
	sourcePath: string;
	intendedPath: string;
	reason: string;
	reasonDetail?: string;
}): Promise<void> {
	await db.insert(renamingFailures).values({
		id: randomUUID(),
		correlationId: randomUUID(),
		fileId: opts.fileId,
		fileType: opts.fileType,
		sourcePath: opts.sourcePath,
		intendedPath: opts.intendedPath,
		reason: opts.reason,
		reasonDetail: opts.reasonDetail ?? null,
		failedAt: new Date().toISOString(),
		status: 'failed'
	});
}

/**
 * Rename Preview Service
 */
export class RenamePreviewService {
	private namingService: NamingService;

	constructor() {
		const config = namingSettingsService.getConfigSync();
		this.namingService = new NamingService(config);
	}

	/**
	 * Parse quality info from filename when stored data is missing
	 */
	private parseFilenameForQuality(filename: string): {
		resolution?: string;
		source?: string;
		codec?: string;
		hdr?: string;
		bitDepth?: string;
		audioCodec?: string;
		audioChannels?: string;
		releaseGroup?: string;
		edition?: string;
		proper?: boolean;
		repack?: boolean;
	} {
		const parser = new ReleaseParser();
		const parsed = parser.parse(filename);

		return {
			resolution: parsed.resolution ?? undefined,
			source: parsed.source ?? undefined,
			codec: parsed.codec ?? undefined,
			hdr: parsed.hdr ?? undefined,
			bitDepth: parsed.bitDepth !== 'unknown' ? parsed.bitDepth : undefined,
			audioCodec: parsed.audioCodec ?? undefined,
			audioChannels: parsed.audioChannels ?? undefined,
			releaseGroup: parsed.releaseGroup ?? undefined,
			edition: parsed.edition ?? undefined,
			proper: parsed.isProper,
			repack: parsed.isRepack
		};
	}

	/**
	 * Preview renames for all movies.
	 * Batches DB queries to avoid N+1 per-movie lookups on large libraries.
	 */
	async previewAllMovies(): Promise<RenamePreviewResult> {
		const allMovies = db.select().from(movies).all();
		const allRootFolders = db.select().from(rootFolders).all();
		const allFiles = db.select().from(movieFiles).all();

		const rootFolderById = new Map(allRootFolders.map((rf) => [rf.id, rf]));
		const filesByMovieId = new Map<string, (typeof movieFiles.$inferSelect)[]>();
		for (const file of allFiles) {
			const list = filesByMovieId.get(file.movieId) || [];
			list.push(file);
			filesByMovieId.set(file.movieId, list);
		}

		const result = emptyPreviewResult();

		for (const movie of allMovies) {
			const rootFolder = movie.rootFolderId ? rootFolderById.get(movie.rootFolderId) : undefined;
			const rootFolderPath = rootFolder?.path ?? '';
			const rootFolderReadOnly = rootFolder?.readOnly ?? false;
			const files = filesByMovieId.get(movie.id) ?? [];

			for (const file of files) {
				const item = this.buildMoviePreviewItem(movie, file, rootFolderPath, rootFolderReadOnly);
				result.totalFiles++;

				if (item.status === 'error') {
					result.errors.push(item);
					result.totalErrors++;
				} else if (
					item.currentRelativePath === item.newRelativePath &&
					item.currentParentPath === item.newParentPath
				) {
					item.status = 'already_correct';
					result.alreadyCorrect.push(item);
					result.totalAlreadyCorrect++;
				} else {
					item.status = 'will_change';
					result.willChange.push(item);
					result.totalWillChange++;
				}
			}
		}

		this.detectCollisions(result);
		return result;
	}

	/**
	 * Preview renames for all episode files.
	 * Batches DB queries to avoid N+1 per-series lookups on large libraries.
	 */
	async previewAllEpisodes(): Promise<RenamePreviewResult> {
		const allSeries = db.select().from(series).all();
		const allRootFolders = db.select().from(rootFolders).all();
		const allFiles = db.select().from(episodeFiles).all();
		const allEpisodes = db.select().from(episodes).all();

		const rootFolderById = new Map(allRootFolders.map((rf) => [rf.id, rf]));
		const filesBySeriesId = new Map<string, (typeof episodeFiles.$inferSelect)[]>();
		for (const file of allFiles) {
			const list = filesBySeriesId.get(file.seriesId) || [];
			list.push(file);
			filesBySeriesId.set(file.seriesId, list);
		}
		const episodesBySeriesId = new Map<string, (typeof episodes.$inferSelect)[]>();
		for (const ep of allEpisodes) {
			const list = episodesBySeriesId.get(ep.seriesId) || [];
			list.push(ep);
			episodesBySeriesId.set(ep.seriesId, list);
		}

		const result = emptyPreviewResult();

		for (const show of allSeries) {
			const rootFolder = show.rootFolderId ? rootFolderById.get(show.rootFolderId) : undefined;
			const rootFolderPath = rootFolder?.path ?? '';
			const rootFolderReadOnly = rootFolder?.readOnly ?? false;
			const files = filesBySeriesId.get(show.id) ?? [];
			const seriesEpisodes = episodesBySeriesId.get(show.id) ?? [];
			const episodeMap = new Map(seriesEpisodes.map((ep) => [ep.id, ep]));
			const absoluteEpisodeMap = this.buildAbsoluteEpisodeFallbackMap(seriesEpisodes);

			for (const file of files) {
				const item = this.buildEpisodePreviewItem(
					show,
					file,
					episodeMap,
					rootFolderPath,
					absoluteEpisodeMap,
					rootFolderReadOnly
				);
				result.totalFiles++;

				if (item.status === 'error') {
					result.errors.push(item);
					result.totalErrors++;
				} else if (
					item.currentRelativePath === item.newRelativePath &&
					item.currentParentPath === item.newParentPath
				) {
					item.status = 'already_correct';
					result.alreadyCorrect.push(item);
					result.totalAlreadyCorrect++;
				} else {
					item.status = 'will_change';
					result.willChange.push(item);
					result.totalWillChange++;
				}
			}
		}

		this.detectCollisions(result);
		return result;
	}

	/**
	 * Preview renames for a single movie
	 */
	async previewMovie(movieId: string): Promise<RenamePreviewResult> {
		const result = emptyPreviewResult();

		const movie = db.select().from(movies).where(eq(movies.id, movieId)).get();
		if (!movie) {
			return result;
		}

		// Get root folder path and read-only status
		let rootFolderPath = '';
		let rootFolderReadOnly = false;
		if (movie.rootFolderId) {
			const rootFolder = db
				.select()
				.from(rootFolders)
				.where(eq(rootFolders.id, movie.rootFolderId))
				.get();
			if (rootFolder) {
				rootFolderPath = rootFolder.path;
				rootFolderReadOnly = rootFolder.readOnly ?? false;
			}
		}

		// Warn when the folder template uses {Collection} but this movie has no
		// collection data — the token resolves to empty string, so the preview
		// will show the movie moving OUT of its collection folder.
		const namingConfig = namingSettingsService.getConfigSync();
		if (namingConfig.movieFolderFormat?.includes('{Collection}') && !movie.collectionName) {
			result.missingCollectionData = true;
		}

		const files = db.select().from(movieFiles).where(eq(movieFiles.movieId, movieId)).all();

		for (const file of files) {
			const item = this.buildMoviePreviewItem(movie, file, rootFolderPath, rootFolderReadOnly);
			result.totalFiles++;

			if (item.status === 'error') {
				result.errors.push(item);
				result.totalErrors++;
			} else if (
				item.currentRelativePath === item.newRelativePath &&
				item.currentParentPath === item.newParentPath
			) {
				item.status = 'already_correct';
				result.alreadyCorrect.push(item);
				result.totalAlreadyCorrect++;
			} else {
				item.status = 'will_change';
				result.willChange.push(item);
				result.totalWillChange++;
			}
		}

		// Detect collisions within this movie's files
		this.detectCollisions(result);

		return result;
	}

	/**
	 * Preview renames for a series (all episode files)
	 */
	async previewSeries(seriesId: string): Promise<RenamePreviewResult> {
		const result = emptyPreviewResult();

		const show = db.select().from(series).where(eq(series.id, seriesId)).get();
		if (!show) {
			return result;
		}

		// Get root folder path and read-only status
		let rootFolderPath = '';
		let rootFolderReadOnly = false;
		if (show.rootFolderId) {
			const rootFolder = db
				.select()
				.from(rootFolders)
				.where(eq(rootFolders.id, show.rootFolderId))
				.get();
			if (rootFolder) {
				rootFolderPath = rootFolder.path;
				rootFolderReadOnly = rootFolder.readOnly ?? false;
			}
		}

		const files = db.select().from(episodeFiles).where(eq(episodeFiles.seriesId, seriesId)).all();

		// Load all episodes for this series for title lookup
		const allEpisodes = db.select().from(episodes).where(eq(episodes.seriesId, seriesId)).all();
		const episodeMap = new Map(allEpisodes.map((ep) => [ep.id, ep]));
		const absoluteEpisodeMap = this.buildAbsoluteEpisodeFallbackMap(allEpisodes);

		for (const file of files) {
			const item = this.buildEpisodePreviewItem(
				show,
				file,
				episodeMap,
				rootFolderPath,
				absoluteEpisodeMap,
				rootFolderReadOnly
			);
			result.totalFiles++;

			if (item.status === 'error') {
				result.errors.push(item);
				result.totalErrors++;
			} else if (
				item.currentRelativePath === item.newRelativePath &&
				item.currentParentPath === item.newParentPath
			) {
				item.status = 'already_correct';
				result.alreadyCorrect.push(item);
				result.totalAlreadyCorrect++;
			} else {
				item.status = 'will_change';
				result.willChange.push(item);
				result.totalWillChange++;
			}
		}

		// Detect collisions within this series' files
		this.detectCollisions(result);

		return result;
	}

	/**
	 * Execute approved file renames.
	 *
	 * Renames only the files themselves within their existing parent folder.
	 * Folder reorganization is a SEPARATE operation (see reorganizeFolder).
	 * This separation eliminates the ordering race condition that can destroy
	 * files when folder and file renames are combined.
	 *
	 * Pattern: Radarr's RenameMovieFileService (files only).
	 */
	async executeRenames(
		fileIds: string[],
		_mediaType: 'movie' | 'episode' | 'mixed' = 'mixed'
	): Promise<RenameExecuteResult> {
		const result: RenameExecuteResult = {
			success: true,
			processed: 0,
			succeeded: 0,
			failed: 0,
			results: [],
			warnings: []
		};

		if (fileIds.length === 0) {
			return result;
		}

		// Build target paths only for the requested files (not the entire library).
		const renameMap = await this.buildTargetMap(fileIds, result);
		if (renameMap.size === 0) {
			return result;
		}

		// Audit log: record every file's original path and target before any
		// I/O so a recovery trail exists if something goes wrong.
		logger.info(
			{
				renameCount: renameMap.size,
				files: [...renameMap.entries()].map(([fileId, item]) => ({
					fileId,
					mediaType: item.mediaType,
					mediaId: item.mediaId,
					from: item.currentFullPath,
					to: item.newFullPath,
					status: item.status
				}))
			},
			'[RenamePreviewService] Rename audit log — pre-execution state'
		);

		// Group items by mediaId for parallel processing.
		const groups = new Map<string, RenamePreviewItem[]>();
		for (const item of renameMap.values()) {
			const group = groups.get(item.mediaId) || [];
			group.push(item);
			groups.set(item.mediaId, group);
		}

		const touchedMovieIds = new Set<string>();
		const touchedSeriesIds = new Set<string>();

		// Process each media group concurrently. Files in the same group are
		// processed sequentially to avoid filesystem races in the same folder.
		const groupResults = await Promise.allSettled(
			[...groups.entries()].map(async ([mediaId, items]) => {
				const firstItem = items[0];
				if (firstItem?.mediaType === 'movie') {
					touchedMovieIds.add(mediaId);
				} else if (firstItem?.mediaType === 'episode') {
					touchedSeriesIds.add(mediaId);
				}

				const groupResult: RenameExecuteResult['results'] = [];

				for (const item of items) {
					if (item.status === 'collision') {
						const failResult = {
							fileId: item.fileId,
							mediaType: item.mediaType,
							success: false,
							oldPath: item.currentFullPath,
							newPath: item.newFullPath,
							error: 'Cannot rename: collision with another file'
						};
						groupResult.push(failResult);
						await this.writeRenameHistory(item, failResult.success, failResult.error);
						recordRenamingFailure({
							fileId: item.fileId,
							fileType: item.mediaType,
							sourcePath: item.currentFullPath,
							intendedPath: item.newFullPath,
							reason: 'collision',
							reasonDetail: failResult.error
						}).catch((err) =>
							logger.warn({ err }, '[RenamePreviewService] Failed to record renaming failure')
						);
						continue;
					}

					if (item.status === 'error') {
						const failResult = {
							fileId: item.fileId,
							mediaType: item.mediaType,
							success: false,
							oldPath: item.currentFullPath,
							newPath: item.newFullPath,
							error: item.error ?? 'Cannot rename file'
						};
						groupResult.push(failResult);
						await this.writeRenameHistory(item, failResult.success, failResult.error);
						recordRenamingFailure({
							fileId: item.fileId,
							fileType: item.mediaType,
							sourcePath: item.currentFullPath,
							intendedPath: item.newFullPath,
							reason: 'preview_error',
							reasonDetail: failResult.error
						}).catch((err) =>
							logger.warn({ err }, '[RenamePreviewService] Failed to record renaming failure')
						);
						continue;
					}

					const renameResult = await this.executeFileRename(item);
					groupResult.push(renameResult);
					await this.writeRenameHistory(item, renameResult.success, renameResult.error);
					if (!renameResult.success) {
						recordRenamingFailure({
							fileId: item.fileId,
							fileType: item.mediaType,
							sourcePath: item.currentFullPath,
							intendedPath: item.newFullPath,
							reason: 'io_error',
							reasonDetail: renameResult.error
						}).catch((err) =>
							logger.warn({ err }, '[RenamePreviewService] Failed to record renaming failure')
						);
					}
				}

				// After all files in this group are processed, handle any folder rename.
				// A folder rename occurs when at least one file successfully moved to a
				// new parent path. We update the DB path record, move remaining extra
				// files (artwork, nfo, etc.) to the new folder, and clean up empty dirs.
				const successfulFolderChange = items.find((item) => {
					const matched = groupResult.find((r) => r.fileId === item.fileId);
					return matched?.success && item.currentParentPath !== item.newParentPath;
				});
				if (successfulFolderChange && firstItem) {
					const originalStem = basename(
						successfulFolderChange.currentFullPath,
						extname(successfulFolderChange.currentFullPath)
					);
					const folderWarnings = await this.applyFolderRename(
						mediaId,
						firstItem.mediaType as 'movie' | 'episode',
						successfulFolderChange.currentParentPath,
						successfulFolderChange.newParentPath,
						originalStem
					);
					if (folderWarnings.length > 0) {
						result.warnings ??= [];
						result.warnings.push(...folderWarnings);
					}
				}

				// Clean up empty season subdirectories left behind when files moved
				// between season folders within the same series folder (e.g. Season 00
				// -> Specials). The series-level parent path is unchanged so
				// applyFolderRename never runs, but the old season dir may now be empty.
				const oldSeasonDirs = new Set<string>();
				for (const item of items) {
					const matched = groupResult.find((r) => r.fileId === item.fileId);
					if (!matched?.success) continue;
					const oldSeasonDir = dirname(item.currentFullPath);
					const newSeasonDir = dirname(item.newFullPath);
					if (oldSeasonDir !== newSeasonDir) {
						oldSeasonDirs.add(oldSeasonDir);
					}
				}
				for (const dir of oldSeasonDirs) {
					await this.tryRemoveEmptyDir(dir);
				}

				return groupResult;
			})
		);

		// Aggregate results from parallel groups.
		for (const settled of groupResults) {
			if (settled.status === 'fulfilled') {
				for (const r of settled.value) {
					result.results.push(r);
					result.processed++;
					if (r.success) {
						result.succeeded++;
					} else {
						result.failed++;
						result.success = false;
					}
				}
			} else {
				result.success = false;
			}
		}

		await this.reconcileTouchedMedia(touchedMovieIds, touchedSeriesIds);

		return result;
	}

	/**
	 * Write a permanent rename_history record for audit and recovery.
	 */
	private async writeRenameHistory(
		item: RenamePreviewItem,
		success: boolean,
		error?: string
	): Promise<void> {
		try {
			db.insert(renameHistory)
				.values({
					id: randomUUID(),
					fileId: item.fileId,
					mediaType: item.mediaType,
					oldPath: item.currentFullPath,
					newPath: item.newFullPath,
					success: success ? 1 : 0,
					error: error ?? null,
					operation: 'rename',
					createdAt: new Date().toISOString()
				})
				.run();
		} catch (writeError) {
			logger.error(
				{
					error: writeError instanceof Error ? writeError.message : String(writeError),
					fileId: item.fileId
				},
				'[RenamePreviewService] Failed to write rename history'
			);
		}
	}

	/**
	 * Reorganize the parent folder for a single movie or series.
	 *
	 * This is a SEPARATE operation from file renaming.  The naming config is
	 * re-evaluated, and if the folder name would differ from the current
	 * on-disk folder, the folder is renamed and the DB record updated.
	 *
	 * Pattern: Radarr's MoveMovieService / Sonarr's MoveSeriesService.
	 *
	 * Returns true if the folder was reorganized (or already correct).
	 */
	async reorganizeFolder(
		mediaId: string,
		mediaType: 'movie' | 'series'
	): Promise<{ success: boolean; oldPath?: string; newPath?: string; error?: string }> {
		try {
			let rootFolderPath = '';
			let currentPath = '';
			let rootFolderId: string | undefined;
			let mediaTmdbId: number | null = null;

			if (mediaType === 'movie') {
				const movie = db.select().from(movies).where(eq(movies.id, mediaId)).get();
				if (!movie) return { success: false, error: 'Movie not found' };
				currentPath = movie.path;
				rootFolderId = movie.rootFolderId ?? undefined;
				mediaTmdbId = movie.tmdbId;
			} else {
				const show = db.select().from(series).where(eq(series.id, mediaId)).get();
				if (!show) return { success: false, error: 'Series not found' };
				currentPath = show.path;
				rootFolderId = show.rootFolderId ?? undefined;
				mediaTmdbId = show.tmdbId;
			}

			if (!rootFolderId) {
				return { success: false, error: 'No root folder assigned' };
			}

			const rootFolder = db
				.select()
				.from(rootFolders)
				.where(eq(rootFolders.id, rootFolderId))
				.get();
			if (!rootFolder) return { success: false, error: 'Root folder not found' };
			rootFolderPath = rootFolder.path;

			// Compute the target folder name using the current naming config.
			const config = namingSettingsService.getConfigSync();
			const naming = new NamingService(config);

			let newFolderName: string;
			if (mediaType === 'movie') {
				const movie = db.select().from(movies).where(eq(movies.id, mediaId)).get()!;
				newFolderName = naming.generateMovieFolderName({
					title: movie.title,
					originalTitle: movie.originalTitle ?? undefined,
					year: movie.year ?? undefined,
					tmdbId: movie.tmdbId,
					imdbId: movie.imdbId ?? undefined,
					collectionName: movie.collectionName ?? undefined
				});
			} else {
				const show = db.select().from(series).where(eq(series.id, mediaId)).get()!;
				newFolderName = naming.generateSeriesFolderName({
					title: show.title,
					originalTitle: show.originalTitle ?? undefined,
					year: show.year ?? undefined,
					tvdbId: show.tvdbId ?? undefined,
					tmdbId: show.tmdbId,
					imdbId: show.imdbId ?? undefined
				});
			}

			if (currentPath === newFolderName) {
				return { success: true, oldPath: currentPath, newPath: newFolderName };
			}

			const actualOldFolder = join(rootFolderPath, currentPath);
			const actualNewFolder = join(rootFolderPath, newFolderName);

			if (actualOldFolder === actualNewFolder) {
				return { success: true, oldPath: currentPath, newPath: newFolderName };
			}

			const dirExisted = await fileExists(actualOldFolder);
			if (!dirExisted) {
				return { success: false, error: 'Source folder does not exist', oldPath: currentPath };
			}

			// Before renaming the folder, delete the old entry from all enabled
			// Jellyfin/Emby servers so the stale item is cleanly removed (cascades
			// to child rows). This prevents the ghost-entry resurrection loop when
			// Jellyfin's scanner finds orphaned Season/Episode rows at the old path
			// after the folder move (jellyfin#16883). Plex is unaffected.
			// Best-effort: failures don't block the rename.
			if (mediaTmdbId) {
				const manager = getMediaBrowserManager();
				await manager.deleteMediaItemByTmdb(mediaTmdbId, mediaType as 'movie' | 'series');
			}

			// Atomically rename the folder on disk.
			await rename(actualOldFolder, actualNewFolder);

			// Verify the destination exists before updating DB.
			const destExists = await fileExists(actualNewFolder);
			if (!destExists) {
				return {
					success: false,
					error: 'Folder rename verification failed',
					oldPath: currentPath,
					newPath: newFolderName
				};
			}

			// Update the DB record.
			if (mediaType === 'movie') {
				db.update(movies).set({ path: newFolderName }).where(eq(movies.id, mediaId)).run();
			} else {
				db.update(series).set({ path: newFolderName }).where(eq(series.id, mediaId)).run();
			}

			// Notify media servers of the new folder path so Jellyfin/Emby
			// discovers the renamed folder as a fresh item.
			getMediaBrowserNotifier().queueUpdate(actualNewFolder, 'Modified');

			logger.info(
				{ mediaId, mediaType, from: actualOldFolder, to: actualNewFolder },
				'[RenamePreviewService] Folder reorganized'
			);

			return { success: true, oldPath: currentPath, newPath: newFolderName };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logger.error(
				{ mediaId, mediaType, error: message },
				'[RenamePreviewService] Folder reorganize failed'
			);
			return { success: false, error: message };
		}
	}

	/**
	 * Build a fileId → RenamePreviewItem map for a set of file IDs,
	 * computing target paths for only those files.
	 * Unknown or already-correct files are recorded as failures in `result`.
	 */
	private async buildTargetMap(
		fileIds: string[],
		result: RenameExecuteResult
	): Promise<Map<string, RenamePreviewItem>> {
		const renameMap = new Map<string, RenamePreviewItem>();

		// Pre-load root folder readOnly flags for cheap lookup.
		const allRootFolders = db.select().from(rootFolders).all();
		const readOnlyByFolderId = new Map(allRootFolders.map((rf) => [rf.id, rf.readOnly ?? false]));

		for (const fileId of fileIds) {
			// Try movie first
			const movieFile = db.select().from(movieFiles).where(eq(movieFiles.id, fileId)).get();
			if (movieFile) {
				const movie = db.select().from(movies).where(eq(movies.id, movieFile.movieId)).get();
				if (movie) {
					const rootFolderPath = this.resolveRootFolderPath(movie.rootFolderId, allRootFolders);
					const readOnly = readOnlyByFolderId.get(movie.rootFolderId ?? '') ?? false;
					const item = this.buildMoviePreviewItem(movie, movieFile, rootFolderPath, readOnly);
					if (
						item.status !== 'error' &&
						item.currentRelativePath === item.newRelativePath &&
						item.currentParentPath === item.newParentPath
					) {
						// Already correct – skip (recorded in caller's result)
						continue;
					}
					renameMap.set(fileId, item);
					continue;
				}
			}

			// Try episode
			const episodeFile = db.select().from(episodeFiles).where(eq(episodeFiles.id, fileId)).get();
			if (episodeFile) {
				const show = db.select().from(series).where(eq(series.id, episodeFile.seriesId)).get();
				if (show) {
					const allEpisodes = db
						.select()
						.from(episodes)
						.where(eq(episodes.seriesId, show.id))
						.all();
					const episodeMap = new Map(allEpisodes.map((ep) => [ep.id, ep]));
					const absoluteEpisodeMap = this.buildAbsoluteEpisodeFallbackMap(allEpisodes);
					const rootFolderPath = this.resolveRootFolderPath(show.rootFolderId, allRootFolders);
					const readOnly = readOnlyByFolderId.get(show.rootFolderId ?? '') ?? false;
					const item = this.buildEpisodePreviewItem(
						show,
						episodeFile,
						episodeMap,
						rootFolderPath,
						absoluteEpisodeMap,
						readOnly
					);
					if (
						item.status !== 'error' &&
						item.currentRelativePath === item.newRelativePath &&
						item.currentParentPath === item.newParentPath
					) {
						continue;
					}
					renameMap.set(fileId, item);
					continue;
				}
			}

			// File not found in either table
			result.results.push({
				fileId,
				mediaType: 'movie',
				success: false,
				oldPath: '',
				newPath: '',
				error: 'File not found in database'
			});
			result.failed++;
			result.processed++;
		}

		// Detect collisions among the requested file set.
		const pathMap = new Map<string, string[]>();
		for (const [fId, item] of renameMap) {
			if (item.status === 'error') continue;
			const paths = pathMap.get(item.newFullPath) || [];
			paths.push(fId);
			pathMap.set(item.newFullPath, paths);
		}
		for (const fileIds of pathMap.values()) {
			if (fileIds.length > 1) {
				for (const collisionFileId of fileIds) {
					const item = renameMap.get(collisionFileId);
					if (item) {
						item.status = 'collision';
						item.collisionsWith = fileIds.filter((id) => id !== collisionFileId);
					}
				}
			}
		}

		return renameMap;
	}

	/**
	 * Resolve a root folder's absolute path from pre-loaded rows.
	 */
	private resolveRootFolderPath(
		rootFolderId: string | null | undefined,
		allRootFolders: (typeof rootFolders.$inferSelect)[]
	): string {
		if (!rootFolderId) return '';
		const rf = allRootFolders.find((r) => r.id === rootFolderId);
		return rf?.path ?? '';
	}

	/**
	 * Execute a single file rename with safety guards:
	 * - Skips no-op moves (source === dest).
	 * - Verifies the destination exists and has size after a successful move.
	 * - Does NOT delete DB records on failure — that is the reconcile pass's job.
	 */
	private async executeFileRename(
		item: RenamePreviewItem
	): Promise<RenameExecuteResult['results'][0]> {
		try {
			// Check if the file is in a read-only folder
			const isReadOnly = await this.isFileInReadOnlyFolder(item);
			if (isReadOnly) {
				logger.warn(
					{
						fileId: item.fileId,
						mediaType: item.mediaType,
						path: item.currentFullPath
					},
					'[RenamePreviewService] Cannot rename file in read-only folder'
				);
				return {
					fileId: item.fileId,
					mediaType: item.mediaType,
					success: false,
					oldPath: item.currentFullPath,
					newPath: item.newFullPath,
					error: 'Cannot rename files in read-only folder'
				};
			}

			// No-op: source and destination already match (resolved to catch path aliasing)
			if (resolve(item.currentFullPath) === resolve(item.newFullPath)) {
				return {
					fileId: item.fileId,
					mediaType: item.mediaType,
					success: true,
					oldPath: item.currentFullPath,
					newPath: item.newFullPath
				};
			}

			// Verify source file exists
			const sourceExists = await fileExists(item.currentFullPath);
			if (!sourceExists) {
				logger.warn(
					{
						fileId: item.fileId,
						mediaType: item.mediaType,
						path: item.currentFullPath
					},
					'[RenamePreviewService] Source file not found'
				);
				return {
					fileId: item.fileId,
					mediaType: item.mediaType,
					success: false,
					oldPath: item.currentFullPath,
					newPath: item.newFullPath,
					error: 'Source file not found'
				};
			}

			// Check if destination already exists (collision check)
			const destExists = await fileExists(item.newFullPath);
			if (destExists && resolve(item.currentFullPath) !== resolve(item.newFullPath)) {
				logger.warn(
					{
						fileId: item.fileId,
						mediaType: item.mediaType,
						currentPath: item.currentFullPath,
						newPath: item.newFullPath
					},
					'[RenamePreviewService] Destination file already exists'
				);
				return {
					fileId: item.fileId,
					mediaType: item.mediaType,
					success: false,
					oldPath: item.currentFullPath,
					newPath: item.newFullPath,
					error: 'Destination file already exists'
				};
			}

			// Perform the rename using moveFile
			const moveResult = await moveFile(item.currentFullPath, item.newFullPath);

			if (!moveResult.success) {
				logger.warn(
					{
						fileId: item.fileId,
						mediaType: item.mediaType,
						from: item.currentFullPath,
						to: item.newFullPath,
						error: moveResult.error
					},
					'[RenamePreviewService] Move operation failed'
				);

				// Rollback: clean up any incomplete destination and verify source
				// integrity.  Pattern: Radarr's RollbackPartialMove / RollbackCopy.
				try {
					const sourceStillExists = await fileExists(item.currentFullPath);
					const destIncomplete = await fileExists(item.newFullPath);

					if (!sourceStillExists && destIncomplete) {
						// Partial copy: source lost but destination exists incompletely.
						// Attempt to restore by moving the destination back.
						const { rename } = await import('node:fs/promises');
						await rename(item.newFullPath, item.currentFullPath);
						logger.info(
							{ fileId: item.fileId, from: item.currentFullPath },
							'[RenamePreviewService] Rolled back — restored from incomplete destination'
						);
					} else if (destIncomplete) {
						// Destination exists incompletely, source still safe — delete dest.
						const { unlink } = await import('node:fs/promises');
						await unlink(item.newFullPath);
						logger.info(
							{ fileId: item.fileId, path: item.newFullPath },
							'[RenamePreviewService] Rolled back — removed incomplete destination'
						);
					} else if (!sourceStillExists) {
						logger.error(
							{
								fileId: item.fileId,
								path: item.currentFullPath
							},
							'[RenamePreviewService] Source file lost during failed move — data may be unrecoverable'
						);
					}
				} catch (rollbackError) {
					logger.error(
						{
							fileId: item.fileId,
							error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
						},
						'[RenamePreviewService] Rollback failed'
					);
				}

				return {
					fileId: item.fileId,
					mediaType: item.mediaType,
					success: false,
					oldPath: item.currentFullPath,
					newPath: item.newFullPath,
					error: moveResult.error || 'Failed to rename file'
				};
			}

			// Post-rename verification: destination must exist and have content.
			let destSize: number | undefined;
			try {
				const destStat = await stat(item.newFullPath);
				destSize = destStat.size;
			} catch {
				logger.error(
					{
						fileId: item.fileId,
						mediaType: item.mediaType,
						destPath: item.newFullPath
					},
					'[RenamePreviewService] Destination file missing after successful move'
				);
				return {
					fileId: item.fileId,
					mediaType: item.mediaType,
					success: false,
					oldPath: item.currentFullPath,
					newPath: item.newFullPath,
					error: 'Destination file not found after move operation'
				};
			}

			if (destSize !== undefined && destSize === 0) {
				logger.warn(
					{
						fileId: item.fileId,
						mediaType: item.mediaType,
						path: item.newFullPath
					},
					'[RenamePreviewService] Destination file is empty after move'
				);
			}

			// Update database with new relative path
			if (item.mediaType === 'movie') {
				db.update(movieFiles)
					.set({ relativePath: item.newRelativePath })
					.where(eq(movieFiles.id, item.fileId))
					.run();
			} else {
				db.update(episodeFiles)
					.set({ relativePath: item.newRelativePath })
					.where(eq(episodeFiles.id, item.fileId))
					.run();
			}

			logger.info(
				{
					fileId: item.fileId,
					mediaType: item.mediaType,
					from: item.currentRelativePath,
					to: item.newRelativePath
				},
				'[RenamePreviewService] File renamed successfully'
			);

			getMediaBrowserNotifier().queueUpdate(item.newFullPath, 'Modified');

			return {
				fileId: item.fileId,
				mediaType: item.mediaType,
				success: true,
				oldPath: item.currentFullPath,
				newPath: item.newFullPath
			};
		} catch (error) {
			logger.error(
				{
					fileId: item.fileId,
					error: error instanceof Error ? error.message : String(error)
				},
				'[RenamePreviewService] Failed to rename file'
			);

			return {
				fileId: item.fileId,
				mediaType: item.mediaType,
				success: false,
				oldPath: item.currentFullPath,
				newPath: item.newFullPath,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * After file renames move media into a new parent folder:
	 * 1. Update movie.path / series.path in the DB so the library entry reflects the new location.
	 * 2. Move any remaining files (artwork, nfo, subtitles, etc.) from the old folder to the new one.
	 * 3. Remove the old folder tree if it is now empty.
	 */
	// Extensions that identify companion files (artwork, metadata, subtitles).
	// Used for stem-matched carry when the media file lives in the root folder.
	private static readonly COMPANION_EXTENSIONS = new Set([
		'.nfo',
		'.jpg',
		'.jpeg',
		'.png',
		'.webp',
		'.tbn',
		'.srt',
		'.sub',
		'.ass',
		'.ssa',
		'.vtt',
		'.sup',
		'.idx'
	]);

	private async applyFolderRename(
		mediaId: string,
		mediaType: 'movie' | 'episode',
		oldParentPath: string,
		newParentPath: string,
		originalFileStem: string
	): Promise<string[]> {
		const warnings: string[] = [];
		try {
			let rootFolderId: string | undefined;
			if (mediaType === 'movie') {
				const movie = db.select().from(movies).where(eq(movies.id, mediaId)).get();
				rootFolderId = movie?.rootFolderId ?? undefined;
			} else {
				const show = db.select().from(series).where(eq(series.id, mediaId)).get();
				rootFolderId = show?.rootFolderId ?? undefined;
			}
			if (!rootFolderId) return warnings;

			const rootFolder = db
				.select()
				.from(rootFolders)
				.where(eq(rootFolders.id, rootFolderId))
				.get();
			if (!rootFolder) return warnings;

			const rootFolderPath = rootFolder.path;
			const oldFolder = join(rootFolderPath, oldParentPath);
			const newFolder = join(rootFolderPath, newParentPath);
			const isRootFolder = resolve(oldFolder) === resolve(rootFolderPath);

			// 1. Update DB path record so the library entry shows the correct folder.
			if (mediaType === 'movie') {
				db.update(movies).set({ path: newParentPath }).where(eq(movies.id, mediaId)).run();
			} else {
				db.update(series).set({ path: newParentPath }).where(eq(series.id, mediaId)).run();
			}

			logger.info(
				{ mediaId, mediaType, from: oldFolder, to: newFolder, isRootFolder },
				'[RenamePreviewService] Folder path updated in DB after file renames'
			);

			// 2. Move companion files from the old folder to the new folder.
			// When the media file is in a dedicated subfolder, carry everything (the
			// whole folder belongs to this title). When it is in the root folder,
			// only carry files whose names start with the original media file's stem
			// to avoid carrying unrelated files into this title's new subfolder.
			try {
				const entries = await readdir(oldFolder, { withFileTypes: true });
				const unmatchedCompanions: string[] = [];

				for (const entry of entries) {
					if (!entry.isFile()) continue;

					if (isRootFolder) {
						const entryStem = basename(entry.name, extname(entry.name));
						const entryExt = extname(entry.name).toLowerCase();
						const stemMatches = entryStem.startsWith(originalFileStem);

						if (!stemMatches) {
							// Track companion-extension files we couldn't safely match.
							if (RenamePreviewService.COMPANION_EXTENSIONS.has(entryExt)) {
								unmatchedCompanions.push(entry.name);
							}
							continue;
						}
					}

					const src = join(oldFolder, entry.name);
					const dest = join(newFolder, entry.name);
					if (await fileExists(dest)) continue;
					try {
						await rename(src, dest);
					} catch {
						await moveFile(src, dest);
					}
				}

				if (unmatchedCompanions.length > 0) {
					warnings.push(
						`Some companion files could not be automatically matched to "${originalFileStem}" ` +
							`and were left in the root folder: ${unmatchedCompanions.join(', ')}. ` +
							`Move them manually if needed.`
					);
					logger.info(
						{ mediaId, unmatchedCompanions },
						'[RenamePreviewService] Unmatched companion files left in root folder'
					);
				}
			} catch {
				// Old folder may not exist or be unreadable — not fatal.
			}

			// 3. Remove the old folder tree if empty (handles empty season subfolders for series).
			// Skip when the old folder is the root — never remove the root folder.
			if (!isRootFolder) {
				await this.tryRemoveEmptyDir(oldFolder);
			}
		} catch (error) {
			logger.warn(
				{
					mediaId,
					mediaType,
					error: error instanceof Error ? error.message : String(error)
				},
				'[RenamePreviewService] applyFolderRename cleanup failed (non-fatal)'
			);
		}
		return warnings;
	}

	/**
	 * Recursively remove a directory only if it is entirely empty.
	 * Descends into subdirectories first so empty trees are cleaned bottom-up.
	 * Directories that still contain files are left untouched.
	 */
	private async tryRemoveEmptyDir(dirPath: string): Promise<void> {
		try {
			const entries = await readdir(dirPath, { withFileTypes: true });
			for (const entry of entries) {
				if (entry.isDirectory()) {
					await this.tryRemoveEmptyDir(join(dirPath, entry.name));
				}
			}
			await rmdir(dirPath); // no-op fails silently if not empty
		} catch {
			// Directory has remaining files or doesn't exist — both are fine.
		}
	}

	private async reconcileTouchedMedia(
		movieIds: Set<string>,
		seriesIds: Set<string>
	): Promise<void> {
		for (const movieId of movieIds) {
			await this.reconcileMovieFileRecords(movieId);
		}

		for (const seriesId of seriesIds) {
			await this.reconcileSeriesFileRecords(seriesId);
		}
	}

	private async reconcileMovieFileRecords(movieId: string): Promise<void> {
		const movie = db
			.select({ path: movies.path, rootFolderId: movies.rootFolderId, hasFile: movies.hasFile })
			.from(movies)
			.where(eq(movies.id, movieId))
			.get();

		if (!movie?.rootFolderId) {
			return;
		}

		const rootFolder = db
			.select({ path: rootFolders.path })
			.from(rootFolders)
			.where(eq(rootFolders.id, movie.rootFolderId))
			.get();

		if (!rootFolder) {
			return;
		}

		const files = db.select().from(movieFiles).where(eq(movieFiles.movieId, movieId)).all();
		let fileExistsCount = 0;

		for (const file of files) {
			const fullPath = join(rootFolder.path, movie.path, file.relativePath);
			if (await fileExists(fullPath)) {
				fileExistsCount++;
			}
		}

		// Non-destructive: only update hasFile status, never delete records.
		const currentHasFile = !!movie.hasFile;
		const shouldHaveFile = fileExistsCount > 0;

		if (currentHasFile !== shouldHaveFile) {
			db.update(movies).set({ hasFile: shouldHaveFile }).where(eq(movies.id, movieId)).run();
		}
	}

	private async reconcileSeriesFileRecords(seriesId: string): Promise<void> {
		const show = db
			.select({ path: series.path, rootFolderId: series.rootFolderId })
			.from(series)
			.where(eq(series.id, seriesId))
			.get();

		if (!show?.rootFolderId) {
			return;
		}

		const rootFolder = db
			.select({ path: rootFolders.path })
			.from(rootFolders)
			.where(eq(rootFolders.id, show.rootFolderId))
			.get();

		if (!rootFolder) {
			return;
		}

		const allEpisodes = db.select().from(episodes).where(eq(episodes.seriesId, seriesId)).all();
		const files = db.select().from(episodeFiles).where(eq(episodeFiles.seriesId, seriesId)).all();
		const episodeIdsWithFiles = new Set<string>();

		for (const file of files) {
			const fullPath = join(rootFolder.path, show.path, file.relativePath);
			if (await fileExists(fullPath)) {
				for (const episodeId of file.episodeIds ?? []) {
					episodeIdsWithFiles.add(episodeId);
				}
			}
			// Non-destructive: never delete file records.
		}

		for (const episode of allEpisodes) {
			const shouldHaveFile = episodeIdsWithFiles.has(episode.id);
			const hasFile = episode.hasFile ?? false;

			if (shouldHaveFile === hasFile) {
				continue;
			}

			db.update(episodes)
				.set({
					hasFile: shouldHaveFile,
					lastSearchTime: shouldHaveFile ? episode.lastSearchTime : null
				})
				.where(eq(episodes.id, episode.id))
				.run();
		}

		await this.recalculateSeriesEpisodeCounts(seriesId);
	}

	private async recalculateSeriesEpisodeCounts(seriesId: string): Promise<void> {
		const allEpisodes = db.select().from(episodes).where(eq(episodes.seriesId, seriesId)).all();

		const today = todayDateString();
		const isAired = (ep: typeof episodes.$inferSelect) =>
			Boolean(ep.airDate && ep.airDate !== '' && ep.airDate <= today);

		const regularEpisodes = allEpisodes.filter((e) => e.seasonNumber !== 0 && isAired(e));
		const regularEpisodesWithFiles = regularEpisodes.filter((episode) => episode.hasFile);

		db.update(series)
			.set({
				episodeFileCount: regularEpisodesWithFiles.length,
				episodeCount: regularEpisodes.length
			})
			.where(eq(series.id, seriesId))
			.run();

		const seasonCounts = new Map<number, { total: number; withFiles: number }>();
		for (const episode of allEpisodes) {
			if (!isAired(episode)) continue;
			const existing = seasonCounts.get(episode.seasonNumber) ?? { total: 0, withFiles: 0 };
			existing.total += 1;
			if (episode.hasFile) {
				existing.withFiles += 1;
			}
			seasonCounts.set(episode.seasonNumber, existing);
		}

		for (const [seasonNumber, counts] of seasonCounts) {
			db.update(seasons)
				.set({
					episodeCount: counts.total,
					episodeFileCount: counts.withFiles
				})
				.where(and(eq(seasons.seriesId, seriesId), eq(seasons.seasonNumber, seasonNumber)))
				.run();
		}
	}

	/**
	 * Build a preview item for a movie file
	 */
	private buildMoviePreviewItem(
		movie: typeof movies.$inferSelect,
		file: typeof movieFiles.$inferSelect,
		rootFolderPath: string,
		rootFolderReadOnly = false
	): RenamePreviewItem {
		if (rootFolderReadOnly) {
			const movieFolderPath = join(rootFolderPath, movie.path);
			return {
				fileId: file.id,
				mediaType: 'movie',
				mediaId: movie.id,
				mediaTitle: movie.title,
				currentParentPath: movie.path,
				currentRelativePath: file.relativePath,
				currentFullPath: join(movieFolderPath, file.relativePath),
				newParentPath: movie.path,
				newRelativePath: file.relativePath,
				newFullPath: join(movieFolderPath, file.relativePath),
				status: 'error',
				error: 'Cannot rename files in read-only folder'
			};
		}

		try {
			// Get current filename for fallback parsing
			const currentFileName = basename(file.relativePath);

			// Parse for quality info - prefer sceneName (original release name) over current filename
			// The sceneName contains the original release info (e.g., "Movie.2024.1080p.BluRay.x264-GROUP")
			// while relativePath may have been renamed and lost metadata (e.g., "Movie (2024) [BluRay-1080p].mkv")
			const parsedFromFilename = this.parseFilenameForQuality(
				chooseBestParsedRelease({
					sceneName: file.sceneName,
					currentFileName,
					actualTitle: movie.title,
					actualYear: movie.year ?? undefined
				}).value
			);

			// Build MediaNamingInfo with the following priority:
			//
			// For VIDEO (resolution, source, codec, HDR):
			//   1. file.quality (from release parsing at import time)
			//   2. parsedFromFilename (re-parsed from current filename)
			//   3. file.mediaInfo (from FFprobe scan - last resort for video)
			//
			// For AUDIO (codec, channels):
			//   1. file.mediaInfo (from FFprobe scan - PREFERRED, as release names are often wrong)
			//   2. parsedFromFilename (fallback if no scan data)
			//
			// Rationale: Audio codec in release names is frequently mislabeled (e.g., labeled as
			// DTS but actually contains EAC3). FFprobe scans the actual file and reports what's
			// really there, so renamed files will reflect the true audio format.
			const namingInfo: MediaNamingInfo = {
				title: movie.title,
				originalTitle: movie.originalTitle ?? undefined,
				year: movie.year ?? undefined,
				tmdbId: movie.tmdbId,
				imdbId: movie.imdbId ?? undefined,
				collectionName: movie.collectionName ?? undefined,
				edition: file.edition ?? parsedFromFilename.edition ?? undefined,

				// Video info: prefer release parsing, fall back to filename, then mediaInfo
				resolution: file.quality?.resolution ?? parsedFromFilename.resolution,
				source: file.quality?.source ?? parsedFromFilename.source,
				codec: file.quality?.codec ?? parsedFromFilename.codec ?? file.mediaInfo?.videoCodec,
				hdr: file.quality?.hdr ?? parsedFromFilename.hdr ?? file.mediaInfo?.videoHdrFormat,
				bitDepth: file.mediaInfo?.videoBitDepth?.toString() ?? parsedFromFilename.bitDepth,

				// Audio info: prefer mediaInfo (actual file scan) over filename parsing
				// This ensures renamed files reflect the true audio codec, not mislabeled release names
				audioCodec: file.mediaInfo?.audioCodec ?? parsedFromFilename.audioCodec,
				audioChannels:
					formatAudioChannels(file.mediaInfo?.audioChannels) ?? parsedFromFilename.audioChannels,
				audioLanguages: file.mediaInfo?.audioLanguages,

				releaseGroup: file.releaseGroup ?? parsedFromFilename.releaseGroup,
				proper: parsedFromFilename.proper,
				repack: parsedFromFilename.repack,
				originalExtension: extname(file.relativePath)
			};

			// Generate new filename and folder name
			const newFolderName = this.namingService.generateMovieFolderName(namingInfo);
			const newFileName = this.namingService.generateMovieFileName(namingInfo);

			// Full paths - join root folder path with movie folder and file path
			const currentFolderPath = join(rootFolderPath, movie.path);
			const newFolderPath = join(rootFolderPath, newFolderName);
			const currentFullPath = join(currentFolderPath, file.relativePath);
			// The new full path has the new folder name AND the new file name
			const newFullPath = join(newFolderPath, newFileName);

			return {
				fileId: file.id,
				mediaType: 'movie',
				mediaId: movie.id,
				mediaTitle: movie.title,
				currentParentPath: movie.path,
				currentRelativePath: currentFileName,
				currentFullPath,
				newParentPath: newFolderName,
				newRelativePath: newFileName,
				newFullPath,
				status: 'will_change' // Will be updated based on comparison
			};
		} catch (error) {
			const movieFolderPath = join(rootFolderPath, movie.path);
			return {
				fileId: file.id,
				mediaType: 'movie',
				mediaId: movie.id,
				mediaTitle: movie.title,
				currentParentPath: movie.path,
				currentRelativePath: file.relativePath,
				currentFullPath: join(movieFolderPath, file.relativePath),
				newParentPath: movie.path,
				newRelativePath: file.relativePath,
				newFullPath: join(movieFolderPath, file.relativePath),
				status: 'error',
				error: error instanceof Error ? error.message : 'Failed to generate filename'
			};
		}
	}

	/**
	 * Build a preview item for an episode file
	 */
	private buildEpisodePreviewItem(
		show: typeof series.$inferSelect,
		file: typeof episodeFiles.$inferSelect,
		episodeMap: Map<string, typeof episodes.$inferSelect>,
		rootFolderPath: string,
		absoluteEpisodeMap: Map<string, number>,
		rootFolderReadOnly = false
	): RenamePreviewItem {
		if (rootFolderReadOnly) {
			const seriesFolderPath = join(rootFolderPath, show.path);
			return {
				fileId: file.id,
				mediaType: 'episode',
				mediaId: show.id,
				mediaTitle: `${show.title} - S${String(file.seasonNumber).padStart(2, '0')}E${String(file.episodeIds?.[0] ?? '').padStart(2, '0')}`,
				currentParentPath: show.path,
				currentRelativePath: file.relativePath,
				currentFullPath: join(seriesFolderPath, file.relativePath),
				newParentPath: show.path,
				newRelativePath: file.relativePath,
				newFullPath: join(seriesFolderPath, file.relativePath),
				status: 'error',
				error: 'Cannot rename files in read-only folder'
			};
		}

		try {
			// Get current filename for fallback parsing
			const currentFileName = basename(file.relativePath);

			// Parse for quality info - prefer sceneName (original release name) over current filename
			// The sceneName contains the original release info (e.g., "Show.S01E01.1080p.WEB-DL.x264-GROUP")
			// while relativePath may have been renamed and lost metadata
			const parsedFromFilename = this.parseFilenameForQuality(
				chooseBestParsedRelease({
					sceneName: file.sceneName,
					currentFileName,
					actualTitle: show.title,
					actualYear: show.year ?? undefined
				}).value
			);

			// Get episode info from the file's episode IDs
			const episodeIds = file.episodeIds || [];
			const fileEpisodes = episodeIds
				.map((id) => episodeMap.get(id))
				.filter((ep): ep is typeof episodes.$inferSelect => ep !== undefined)
				.sort((a, b) => a.episodeNumber - b.episodeNumber);

			if (fileEpisodes.length === 0) {
				throw new Error('No episode data found for file');
			}

			const firstEpisode = fileEpisodes[0];
			const episodeNumbers = fileEpisodes.map((ep) => ep.episodeNumber);

			// Determine if anime/daily based on series type
			const isAnime = show.seriesType === 'anime';
			const isDaily = show.seriesType === 'daily';

			// Build MediaNamingInfo with the following priority:
			//
			// For VIDEO (resolution, source, codec, HDR):
			//   1. file.quality (from release parsing at import time)
			//   2. parsedFromFilename (re-parsed from current filename)
			//   3. file.mediaInfo (from FFprobe scan - last resort for video)
			//
			// For AUDIO (codec, channels):
			//   1. file.mediaInfo (from FFprobe scan - PREFERRED, as release names are often wrong)
			//   2. parsedFromFilename (fallback if no scan data)
			//
			// Rationale: Audio codec in release names is frequently mislabeled (e.g., labeled as
			// DTS but actually contains EAC3). FFprobe scans the actual file and reports what's
			// really there, so renamed files will reflect the true audio format.
			const namingInfo: MediaNamingInfo = {
				title: show.title,
				originalTitle: show.originalTitle ?? undefined,
				year: show.year ?? undefined,
				tvdbId: show.tvdbId ?? undefined,
				tmdbId: show.tmdbId,
				seasonNumber: file.seasonNumber,
				episodeNumbers,
				episodeTitle: firstEpisode.title ?? undefined,
				absoluteNumber:
					firstEpisode.absoluteEpisodeNumber ??
					absoluteEpisodeMap.get(firstEpisode.id) ??
					undefined,
				airDate: firstEpisode.airDate ?? undefined,
				isAnime,
				isDaily,
				edition: file.edition ?? parsedFromFilename.edition ?? undefined,

				// Video info: prefer release parsing, fall back to filename, then mediaInfo
				resolution: file.quality?.resolution ?? parsedFromFilename.resolution,
				source: file.quality?.source ?? parsedFromFilename.source,
				codec: file.quality?.codec ?? parsedFromFilename.codec ?? file.mediaInfo?.videoCodec,
				hdr: file.quality?.hdr ?? parsedFromFilename.hdr ?? file.mediaInfo?.videoHdrFormat,
				bitDepth: file.mediaInfo?.videoBitDepth?.toString() ?? parsedFromFilename.bitDepth,

				// Audio info: prefer mediaInfo (actual file scan) over filename parsing
				// This ensures renamed files reflect the true audio codec, not mislabeled release names
				audioCodec: file.mediaInfo?.audioCodec ?? parsedFromFilename.audioCodec,
				audioChannels:
					formatAudioChannels(file.mediaInfo?.audioChannels) ?? parsedFromFilename.audioChannels,
				audioLanguages: file.mediaInfo?.audioLanguages,
				releaseGroup: file.releaseGroup ?? parsedFromFilename.releaseGroup,
				proper: parsedFromFilename.proper,
				repack: parsedFromFilename.repack,
				originalExtension: extname(file.relativePath)
			};

			// Generate new filename and folder name
			const newFolderName = this.namingService.generateSeriesFolderName(namingInfo);
			const newFileName = this.namingService.generateEpisodeFileName(namingInfo);

			// Episode files may include season folder in relative path
			// e.g., "Season 01/Episode.mkv" or just "Episode.mkv"
			const _currentDir = dirname(file.relativePath);

			// Determine if we should use season folders
			const useSeasonFolders = show.seasonFolder ?? true;
			let newRelativePath: string;

			if (useSeasonFolders) {
				const seasonFolder = this.namingService.generateSeasonFolderName(file.seasonNumber);
				newRelativePath = join(seasonFolder, newFileName);
			} else {
				newRelativePath = newFileName;
			}

			// Full paths - join root folder path with series folder and file path
			const currentFolderPath = join(rootFolderPath, show.path);
			const newFolderPath = join(rootFolderPath, newFolderName);
			const currentFullPath = join(currentFolderPath, file.relativePath);
			const newFullPath = join(newFolderPath, newRelativePath);

			return {
				fileId: file.id,
				mediaType: 'episode',
				mediaId: show.id,
				mediaTitle: `${show.title} - S${String(file.seasonNumber).padStart(2, '0')}E${String(episodeNumbers[0]).padStart(2, '0')}`,
				currentParentPath: show.path,
				currentRelativePath: file.relativePath,
				currentFullPath,
				newParentPath: newFolderName,
				newRelativePath,
				newFullPath,
				status: 'will_change'
			};
		} catch (error) {
			const seriesFolderPath = join(rootFolderPath, show.path);
			return {
				fileId: file.id,
				mediaType: 'episode',
				mediaId: show.id,
				mediaTitle: show.title,
				currentParentPath: show.path,
				currentRelativePath: file.relativePath,
				currentFullPath: join(seriesFolderPath, file.relativePath),
				newParentPath: show.path,
				newRelativePath: file.relativePath,
				newFullPath: join(seriesFolderPath, file.relativePath),
				status: 'error',
				error: error instanceof Error ? error.message : 'Failed to generate filename'
			};
		}
	}

	private buildAbsoluteEpisodeFallbackMap(
		allEpisodes: Array<typeof episodes.$inferSelect>
	): Map<string, number> {
		const absoluteEpisodeMap = new Map<string, number>();
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
			if (typeof episode.absoluteEpisodeNumber === 'number' && episode.absoluteEpisodeNumber > 0) {
				lastAbsolute = episode.absoluteEpisodeNumber;
				absoluteEpisodeMap.set(episode.id, episode.absoluteEpisodeNumber);
				continue;
			}

			lastAbsolute += 1;
			absoluteEpisodeMap.set(episode.id, lastAbsolute);
		}

		return absoluteEpisodeMap;
	}

	/**
	 * Check if a file is in a read-only root folder
	 */
	private async isFileInReadOnlyFolder(item: RenamePreviewItem): Promise<boolean> {
		if (item.mediaType === 'movie') {
			// Get movie's root folder
			const movie = db
				.select({ rootFolderId: movies.rootFolderId })
				.from(movies)
				.where(eq(movies.id, item.mediaId))
				.get();

			if (movie?.rootFolderId) {
				const folder = db
					.select({ readOnly: rootFolders.readOnly })
					.from(rootFolders)
					.where(eq(rootFolders.id, movie.rootFolderId))
					.get();
				return folder?.readOnly ?? false;
			}
		} else {
			// Get series' root folder (mediaId is seriesId for episodes)
			const show = db
				.select({ rootFolderId: series.rootFolderId })
				.from(series)
				.where(eq(series.id, item.mediaId))
				.get();

			if (show?.rootFolderId) {
				const folder = db
					.select({ readOnly: rootFolders.readOnly })
					.from(rootFolders)
					.where(eq(rootFolders.id, show.rootFolderId))
					.get();
				return folder?.readOnly ?? false;
			}
		}
		return false;
	}

	/**
	 * Detect collisions in a preview result
	 * Two files collide if they would be renamed to the same path
	 */
	private detectCollisions(result: RenamePreviewResult): void {
		// Build a map of newFullPath -> items
		const pathMap = new Map<string, RenamePreviewItem[]>();

		for (const item of result.willChange) {
			const existing = pathMap.get(item.newFullPath) || [];
			existing.push(item);
			pathMap.set(item.newFullPath, existing);
		}

		// Find collisions (paths with more than one item)
		for (const [_path, items] of pathMap) {
			if (items.length > 1) {
				// Mark all items as collisions
				for (const item of items) {
					item.status = 'collision';
					item.collisionsWith = items.filter((i) => i.fileId !== item.fileId).map((i) => i.fileId);

					// Move from willChange to collisions
					const idx = result.willChange.indexOf(item);
					if (idx !== -1) {
						result.willChange.splice(idx, 1);
						result.collisions.push(item);
						result.totalWillChange--;
						result.totalCollisions++;
					}
				}
			}
		}
	}
}
