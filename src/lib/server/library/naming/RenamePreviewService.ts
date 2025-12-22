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
	episodes,
	episodeFiles,
	rootFolders
} from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { extname, join, dirname, basename } from 'path';
import { logger } from '$lib/logging';
import { NamingService, type MediaNamingInfo } from './NamingService';
import { namingSettingsService } from './NamingSettingsService';
import { moveFile, fileExists } from '$lib/server/downloadClients/import/FileTransfer';
import { ReleaseParser } from '$lib/server/indexers/parser/ReleaseParser';

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
	currentRelativePath: string;
	currentFullPath: string;

	// New paths (what it would be renamed to)
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
		audioCodec?: string;
		audioChannels?: string;
		releaseGroup?: string;
	} {
		const parser = new ReleaseParser();
		const parsed = parser.parse(filename);

		return {
			resolution: parsed.resolution ?? undefined,
			source: parsed.source ?? undefined,
			codec: parsed.codec ?? undefined,
			hdr: parsed.hdr ?? undefined,
			audioCodec: parsed.audioCodec ?? undefined,
			audioChannels: parsed.audioChannels ?? undefined,
			releaseGroup: parsed.releaseGroup ?? undefined
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
			} else if (item.currentRelativePath === item.newRelativePath) {
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

		for (const file of files) {
			const item = this.buildEpisodePreviewItem(show, file, episodeMap, rootFolderPath);
			result.totalFiles++;

			if (item.status === 'error') {
				result.errors.push(item);
				result.totalErrors++;
			} else if (item.currentRelativePath === item.newRelativePath) {
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
		for (const fileId of fileIds) {
			const item = renameMap.get(fileId);

			if (!item) {
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
				continue;
			}

			// Skip collision items
			if (item.status === 'collision') {
				result.results.push({
					fileId,
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
				logger.warn('[RenamePreviewService] Cannot rename file in read-only folder', {
					fileId: item.fileId,
					mediaType: item.mediaType,
					path: item.currentFullPath
				});
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
				logger.warn('[RenamePreviewService] Source file not found', {
					fileId: item.fileId,
					mediaType: item.mediaType,
					path: item.currentFullPath
				});
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
				logger.warn('[RenamePreviewService] Destination file already exists', {
					fileId: item.fileId,
					mediaType: item.mediaType,
					currentPath: item.currentFullPath,
					newPath: item.newFullPath
				});
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
				logger.warn('[RenamePreviewService] Move operation failed', {
					fileId: item.fileId,
					mediaType: item.mediaType,
					from: item.currentFullPath,
					to: item.newFullPath,
					error: moveResult.error
				});
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

			logger.info('[RenamePreviewService] File renamed successfully', {
				fileId: item.fileId,
				mediaType: item.mediaType,
				from: item.currentRelativePath,
				to: item.newRelativePath
			});

			return {
				fileId: item.fileId,
				mediaType: item.mediaType,
				success: true,
				oldPath: item.currentFullPath,
				newPath: item.newFullPath
			};
		} catch (error) {
			logger.error('[RenamePreviewService] Failed to rename file', {
				fileId: item.fileId,
				error: error instanceof Error ? error.message : String(error)
			});

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

			// Parse current filename to extract quality info as a fallback
			const parsedFromFilename = this.parseFilenameForQuality(currentFileName);

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
				edition: file.edition ?? undefined,

				// Video info: prefer release parsing, fall back to filename, then mediaInfo
				resolution: file.quality?.resolution ?? parsedFromFilename.resolution,
				source: file.quality?.source ?? parsedFromFilename.source,
				codec: file.quality?.codec ?? parsedFromFilename.codec ?? file.mediaInfo?.videoCodec,
				hdr: file.quality?.hdr ?? parsedFromFilename.hdr ?? file.mediaInfo?.videoHdrFormat,
				bitDepth: file.mediaInfo?.videoBitDepth?.toString(),

				// Audio info: prefer mediaInfo (actual file scan) over filename parsing
				// This ensures renamed files reflect the true audio codec, not mislabeled release names
				audioCodec: file.mediaInfo?.audioCodec ?? parsedFromFilename.audioCodec,
				audioChannels:
					formatAudioChannels(file.mediaInfo?.audioChannels) ?? parsedFromFilename.audioChannels,
				audioLanguages: file.mediaInfo?.audioLanguages,

				releaseGroup: file.releaseGroup ?? parsedFromFilename.releaseGroup,
				originalExtension: extname(file.relativePath)
			};

			// Generate new filename
			const newFileName = this.namingService.generateMovieFileName(namingInfo);

			// Full paths - join root folder path with movie folder and file path
			const movieFolderPath = join(rootFolderPath, movie.path);
			const currentFullPath = join(movieFolderPath, file.relativePath);
			const newFullPath = join(movieFolderPath, newFileName);

			return {
				fileId: file.id,
				mediaType: 'movie',
				mediaId: movie.id,
				mediaTitle: movie.title,
				currentRelativePath: currentFileName,
				currentFullPath,
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
				currentRelativePath: file.relativePath,
				currentFullPath: join(movieFolderPath, file.relativePath),
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
		rootFolderPath: string
	): RenamePreviewItem {
		try {
			// Get current filename for fallback parsing
			const currentFileName = basename(file.relativePath);

			// Parse current filename to extract quality info when stored data is missing
			const parsedFromFilename = this.parseFilenameForQuality(currentFileName);

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
				absoluteNumber: firstEpisode.absoluteEpisodeNumber ?? undefined,
				airDate: firstEpisode.airDate ?? undefined,
				isAnime,
				isDaily,

				// Video info: prefer release parsing, fall back to filename, then mediaInfo
				resolution: file.quality?.resolution ?? parsedFromFilename.resolution,
				source: file.quality?.source ?? parsedFromFilename.source,
				codec: file.quality?.codec ?? parsedFromFilename.codec ?? file.mediaInfo?.videoCodec,
				hdr: file.quality?.hdr ?? parsedFromFilename.hdr ?? file.mediaInfo?.videoHdrFormat,
				bitDepth: file.mediaInfo?.videoBitDepth?.toString(),

				// Audio info: prefer mediaInfo (actual file scan) over filename parsing
				// This ensures renamed files reflect the true audio codec, not mislabeled release names
				audioCodec: file.mediaInfo?.audioCodec ?? parsedFromFilename.audioCodec,
				audioChannels:
					formatAudioChannels(file.mediaInfo?.audioChannels) ?? parsedFromFilename.audioChannels,
				audioLanguages: file.mediaInfo?.audioLanguages,
				releaseGroup: file.releaseGroup ?? parsedFromFilename.releaseGroup,
				originalExtension: extname(file.relativePath)
			};

			// Generate new filename
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
			const seriesFolderPath = join(rootFolderPath, show.path);
			const currentFullPath = join(seriesFolderPath, file.relativePath);
			const newFullPath = join(seriesFolderPath, newRelativePath);

			return {
				fileId: file.id,
				mediaType: 'episode',
				mediaId: show.id,
				mediaTitle: `${show.title} - S${String(file.seasonNumber).padStart(2, '0')}E${String(episodeNumbers[0]).padStart(2, '0')}`,
				currentRelativePath: file.relativePath,
				currentFullPath,
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
				currentRelativePath: file.relativePath,
				currentFullPath: join(seriesFolderPath, file.relativePath),
				newRelativePath: file.relativePath,
				newFullPath: join(seriesFolderPath, file.relativePath),
				status: 'error',
				error: error instanceof Error ? error.message : 'Failed to generate filename'
			};
		}
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
