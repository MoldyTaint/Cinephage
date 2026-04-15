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
	rootFolders
} from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { extname, join, dirname, basename } from 'path';
import { createChildLogger } from '$lib/logging';

const logger = createChildLogger({ logDomain: 'scans' as const });
import { NamingService, type MediaNamingInfo } from './NamingService';
import { namingSettingsService } from './NamingSettingsService';
import { moveFile, fileExists } from '$lib/server/downloadClients/import/FileTransfer';
import { ReleaseParser } from '$lib/server/indexers/parser/ReleaseParser';
import { rename } from 'node:fs/promises';
import { chooseBestParsedRelease } from './preview-metadata';

/**
 * Status of a rename preview item
 */
export type RenameStatus = 'will_change' | 'already_correct' | 'collision' | 'error';

/**
 * A single file's rename preview
 */
export interface RenamePreviewItem {
	fileId: string;
	mediaType: 'movie' | 'episode';
	mediaId: string;
	mediaTitle: string;

	// Current paths
	currentParentPath: string;
	currentRelativePath: string;
	currentFullPath: string;

	// New paths (what it would be renamed to)
	newParentPath: string;
	newRelativePath: string;
	newFullPath: string;

	// Status
	status: RenameStatus;
	collisionsWith?: string[]; // fileIds that would collide
	error?: string;
}

/**
 * Result of a rename preview operation
 */
export interface RenamePreviewResult {
	willChange: RenamePreviewItem[];
	alreadyCorrect: RenamePreviewItem[];
	collisions: RenamePreviewItem[];
	errors: RenamePreviewItem[];

	// Summary stats
	totalFiles: number;
	totalWillChange: number;
	totalAlreadyCorrect: number;
	totalCollisions: number;
	totalErrors: number;
}

/**
 * Result of executing renames
 */
export interface RenameExecuteResult {
	success: boolean;
	processed: number;
	succeeded: number;
	failed: number;
	results: Array<{
		fileId: string;
		mediaType: 'movie' | 'episode';
		success: boolean;
		oldPath: string;
		newPath: string;
		error?: string;
	}>;
}

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
 * Merge two preview results
 */
function mergePreviewResults(a: RenamePreviewResult, b: RenamePreviewResult): RenamePreviewResult {
	return {
		willChange: [...a.willChange, ...b.willChange],
		alreadyCorrect: [...a.alreadyCorrect, ...b.alreadyCorrect],
		collisions: [...a.collisions, ...b.collisions],
		errors: [...a.errors, ...b.errors],
		totalFiles: a.totalFiles + b.totalFiles,
		totalWillChange: a.totalWillChange + b.totalWillChange,
		totalAlreadyCorrect: a.totalAlreadyCorrect + b.totalAlreadyCorrect,
		totalCollisions: a.totalCollisions + b.totalCollisions,
		totalErrors: a.totalErrors + b.totalErrors
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
	 * Preview renames for all movies
	 */
	async previewAllMovies(): Promise<RenamePreviewResult> {
		const allMovies = db.select().from(movies).all();

		const result = emptyPreviewResult();

		for (const movie of allMovies) {
			const moviePreview = await this.previewMovie(movie.id);
			Object.assign(result, mergePreviewResults(result, moviePreview));
		}

		// Detect collisions across all items
		this.detectCollisions(result);

		return result;
	}

	/**
	 * Preview renames for all episode files
	 */
	async previewAllEpisodes(): Promise<RenamePreviewResult> {
		const allSeries = db.select().from(series).all();

		const result = emptyPreviewResult();

		for (const show of allSeries) {
			const seriesPreview = await this.previewSeries(show.id);
			Object.assign(result, mergePreviewResults(result, seriesPreview));
		}

		// Detect collisions across all items
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

		// Get root folder path
		let rootFolderPath = '';
		if (movie.rootFolderId) {
			const rootFolder = db
				.select()
				.from(rootFolders)
				.where(eq(rootFolders.id, movie.rootFolderId))
				.get();
			if (rootFolder) {
				rootFolderPath = rootFolder.path;
			}
		}

		const files = db.select().from(movieFiles).where(eq(movieFiles.movieId, movieId)).all();

		for (const file of files) {
			const item = this.buildMoviePreviewItem(movie, file, rootFolderPath);
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

		// Get root folder path
		let rootFolderPath = '';
		if (show.rootFolderId) {
			const rootFolder = db
				.select()
				.from(rootFolders)
				.where(eq(rootFolders.id, show.rootFolderId))
				.get();
			if (rootFolder) {
				rootFolderPath = rootFolder.path;
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
				absoluteEpisodeMap
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
	 * Execute approved renames
	 */
	async executeRenames(
		fileIds: string[],
		mediaType: 'movie' | 'episode' | 'mixed' = 'mixed'
	): Promise<RenameExecuteResult> {
		const result: RenameExecuteResult = {
			success: true,
			processed: 0,
			succeeded: 0,
			failed: 0,
			results: []
		};

		if (fileIds.length === 0) {
			return result;
		}

		// First, generate preview to get the rename mappings
		// This ensures we use the exact same logic as preview
		let preview: RenamePreviewResult;

		if (mediaType === 'movie') {
			preview = await this.previewAllMovies();
		} else if (mediaType === 'episode') {
			preview = await this.previewAllEpisodes();
		} else {
			// Mixed: combine both
			const moviePreview = await this.previewAllMovies();
			const episodePreview = await this.previewAllEpisodes();
			preview = mergePreviewResults(moviePreview, episodePreview);
		}

		// Build a map of fileId -> preview item (only willChange items)
		const renameMap = new Map<string, RenamePreviewItem>();
		for (const item of preview.willChange) {
			renameMap.set(item.fileId, item);
		}

		// Execute each rename
		// Group items by mediaId to process folder renames first
		const groups = new Map<string, RenamePreviewItem[]>();
		for (const fileId of fileIds) {
			const item = renameMap.get(fileId);
			if (item) {
				const group = groups.get(item.mediaId) || [];
				group.push(item);
				groups.set(item.mediaId, group);
			} else {
				// File not found in preview or already correct
				result.results.push({
					fileId,
					mediaType: 'movie', // Unknown, but provide something
					success: false,
					oldPath: '',
					newPath: '',
					error: 'File not found in rename preview or already correctly named'
				});
				result.failed++;
				result.processed++;
			}
		}

		const touchedMovieIds = new Set<string>();
		const touchedSeriesIds = new Set<string>();

		for (const [mediaId, items] of groups) {
			const firstItem = items[0];
			if (firstItem?.mediaType === 'movie') {
				touchedMovieIds.add(mediaId);
			} else if (firstItem?.mediaType === 'episode') {
				touchedSeriesIds.add(mediaId);
			}

			// Check if we need to rename the parent folder
			if (
				firstItem &&
				firstItem.currentParentPath !== firstItem.newParentPath &&
				firstItem.status !== 'collision'
			) {
				try {
					// We need to resolve the root folder path carefully
					let rootFolderPath = '';

					if (firstItem.mediaType === 'movie') {
						const movie = db
							.select({ rootFolderId: movies.rootFolderId })
							.from(movies)
							.where(eq(movies.id, mediaId))
							.get();
						if (movie?.rootFolderId) {
							const rf = db
								.select()
								.from(rootFolders)
								.where(eq(rootFolders.id, movie.rootFolderId))
								.get();
							if (rf) rootFolderPath = rf.path;
						}
					} else {
						const show = db
							.select({ rootFolderId: series.rootFolderId })
							.from(series)
							.where(eq(series.id, mediaId))
							.get();
						if (show?.rootFolderId) {
							const rf = db
								.select()
								.from(rootFolders)
								.where(eq(rootFolders.id, show.rootFolderId))
								.get();
							if (rf) rootFolderPath = rf.path;
						}
					}

					if (!rootFolderPath) {
						throw new Error(`Could not find root folder for media ${mediaId}`);
					}

					const actualOldFolder = join(rootFolderPath, firstItem.currentParentPath);
					const actualNewFolder = join(rootFolderPath, firstItem.newParentPath);

					logger.info(
						{
							mediaId,
							mediaType: firstItem.mediaType,
							from: actualOldFolder,
							to: actualNewFolder
						},
						'[RenamePreviewService] Renaming parent folder'
					);

					// Verify source exists before renaming folder
					const dirExisted = await fileExists(actualOldFolder);
					if (dirExisted && actualOldFolder !== actualNewFolder) {
						await rename(actualOldFolder, actualNewFolder);
					}

					// Update db
					if (firstItem.mediaType === 'movie') {
						db.update(movies)
							.set({ path: firstItem.newParentPath })
							.where(eq(movies.id, mediaId))
							.run();
					} else {
						db.update(series)
							.set({ path: firstItem.newParentPath })
							.where(eq(series.id, mediaId))
							.run();
					}

					if (dirExisted) {
						// Update currentFullPath for all items in this group
						// because the folder they are in has now been renamed
						for (const item of items) {
							// For movies, currentRelativePath is just the file name
							// For episodes, it might be "Season 1/Episode.mkv"
							// We need to replace the old parent with the new parent
							item.currentFullPath = join(actualNewFolder, item.currentRelativePath);
							item.currentParentPath = item.newParentPath;
						}
					}
				} catch (error) {
					logger.error(
						{
							mediaId,
							error: error instanceof Error ? error.message : String(error)
						},
						'[RenamePreviewService] Failed to rename parent folder'
					);
					// If folder rename fails, we should fail all items in this group
					for (const item of items) {
						result.results.push({
							fileId: item.fileId,
							mediaType: item.mediaType,
							success: false,
							oldPath: item.currentFullPath,
							newPath: item.newFullPath,
							error: `Parent folder rename failed: ${error instanceof Error ? error.message : 'Unknown error'}`
						});
						result.failed++;
						result.processed++;
					}
					continue; // skip the rest of the loop for this group
				}
			}

			// Now process each file in the group
			for (const item of items) {
				// Skip collision items
				if (item.status === 'collision') {
					result.results.push({
						fileId: item.fileId,
						mediaType: item.mediaType,
						success: false,
						oldPath: item.currentFullPath,
						newPath: item.newFullPath,
						error: 'Cannot rename: collision with another file'
					});
					result.failed++;
					result.processed++;
					continue;
				}

				// Execute the rename
				const renameResult = await this.executeFileRename(item);
				result.results.push(renameResult);
				result.processed++;

				if (renameResult.success) {
					result.succeeded++;
				} else {
					result.failed++;
					result.success = false;
				}
			}
		}

		await this.reconcileTouchedMedia(touchedMovieIds, touchedSeriesIds);

		return result;
	}

	/**
	 * Execute a single file rename
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

			// Verify source file exists
			const sourceExists = await fileExists(item.currentFullPath);
			if (!sourceExists) {
				await this.reconcileMissingSourceRecord(item);
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
			if (destExists && item.currentFullPath !== item.newFullPath) {
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
				return {
					fileId: item.fileId,
					mediaType: item.mediaType,
					success: false,
					oldPath: item.currentFullPath,
					newPath: item.newFullPath,
					error: moveResult.error || 'Failed to rename file'
				};
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

	private async reconcileMissingSourceRecord(item: RenamePreviewItem): Promise<void> {
		if (item.mediaType === 'movie') {
			await this.reconcileMissingMovieFile(item.fileId, item.mediaId);
			return;
		}

		await this.reconcileMissingEpisodeFile(item.fileId, item.mediaId);
	}

	private async reconcileMissingMovieFile(fileId: string, movieId: string): Promise<void> {
		const fileRecord = db.select().from(movieFiles).where(eq(movieFiles.id, fileId)).get();
		if (!fileRecord) {
			return;
		}

		db.delete(movieFiles).where(eq(movieFiles.id, fileId)).run();

		const remainingFiles = db
			.select({ id: movieFiles.id })
			.from(movieFiles)
			.where(eq(movieFiles.movieId, movieId))
			.all();

		db.update(movies)
			.set({ hasFile: remainingFiles.length > 0 })
			.where(eq(movies.id, movieId))
			.run();
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
			.select({ path: movies.path, rootFolderId: movies.rootFolderId })
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
		const existingFileIds = new Set<string>();

		for (const file of files) {
			const fullPath = join(rootFolder.path, movie.path, file.relativePath);
			if (await fileExists(fullPath)) {
				existingFileIds.add(file.id);
				continue;
			}

			db.delete(movieFiles).where(eq(movieFiles.id, file.id)).run();
		}

		db.update(movies)
			.set({ hasFile: existingFileIds.size > 0 })
			.where(eq(movies.id, movieId))
			.run();
	}

	private async reconcileMissingEpisodeFile(fileId: string, seriesId: string): Promise<void> {
		const fileRecord = db.select().from(episodeFiles).where(eq(episodeFiles.id, fileId)).get();
		if (!fileRecord) {
			return;
		}

		db.delete(episodeFiles).where(eq(episodeFiles.id, fileId)).run();

		for (const episodeId of fileRecord.episodeIds ?? []) {
			const remainingEpisodeFiles = db
				.select({ id: episodeFiles.id, episodeIds: episodeFiles.episodeIds })
				.from(episodeFiles)
				.where(eq(episodeFiles.seriesId, seriesId))
				.all();

			const stillHasFile = remainingEpisodeFiles.some(
				(file) => file.episodeIds?.includes(episodeId) ?? false
			);

			db.update(episodes).set({ hasFile: stillHasFile }).where(eq(episodes.id, episodeId)).run();
		}

		await this.recalculateSeriesEpisodeCounts(seriesId);
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
				continue;
			}

			db.delete(episodeFiles).where(eq(episodeFiles.id, file.id)).run();
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

		const today = new Date().toISOString().split('T')[0];
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
		rootFolderPath: string
	): RenamePreviewItem {
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
				year: movie.year ?? undefined,
				tmdbId: movie.tmdbId,
				imdbId: movie.imdbId ?? undefined,
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
		absoluteEpisodeMap: Map<string, number>
	): RenamePreviewItem {
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

/**
 * Singleton instance
 */
let instance: RenamePreviewService | null = null;

export function getRenamePreviewService(): RenamePreviewService {
	if (!instance) {
		instance = new RenamePreviewService();
	}
	return instance;
}

/**
 * Reset the singleton (useful for tests)
 */
export function resetRenamePreviewService(): void {
	instance = null;
}
