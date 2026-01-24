/**
 * Subtitle Download Service
 *
 * Handles downloading subtitles from providers, saving to disk,
 * and registering them in the database.
 */

import { db } from '$lib/server/db';
import {
	subtitles,
	subtitleHistory,
	subtitleBlacklist,
	movies,
	episodes,
	series,
	movieFiles,
	episodeFiles,
	rootFolders
} from '$lib/server/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join, basename, extname } from 'path';
import { logger } from '$lib/logging';
import { normalizeLanguageCode } from '$lib/shared/languages';
import type {
	SubtitleSearchResult,
	SubtitleDownloadResult,
	SubtitleFormat,
	BlacklistReason
} from '../types';
import { getSubtitleProviderManager } from './SubtitleProviderManager';
import AdmZip from 'adm-zip';

/**
 * Service for downloading and managing subtitle files
 */
export class SubtitleDownloadService {
	private static instance: SubtitleDownloadService | null = null;

	private constructor() {}

	static getInstance(): SubtitleDownloadService {
		if (!SubtitleDownloadService.instance) {
			SubtitleDownloadService.instance = new SubtitleDownloadService();
		}
		return SubtitleDownloadService.instance;
	}

	/**
	 * Download a subtitle for a movie
	 */
	async downloadForMovie(
		movieId: string,
		result: SubtitleSearchResult
	): Promise<SubtitleDownloadResult> {
		// Get movie and file info
		const movie = await db.select().from(movies).where(eq(movies.id, movieId)).limit(1);
		if (!movie[0]) {
			throw new Error(`Movie not found: ${movieId}`);
		}

		const files = await db.select().from(movieFiles).where(eq(movieFiles.movieId, movieId));
		const file = files[0];
		if (!file) {
			throw new Error(`No file found for movie: ${movieId}`);
		}

		// Get root folder
		const rootFolder = movie[0].rootFolderId
			? await db
					.select()
					.from(rootFolders)
					.where(eq(rootFolders.id, movie[0].rootFolderId))
					.limit(1)
			: null;

		// Check if root folder is read-only
		if (rootFolder?.[0]?.readOnly) {
			throw new Error('Cannot download subtitles to read-only folder');
		}

		const rootPath = rootFolder?.[0]?.path || '';
		const mediaPath = join(rootPath, movie[0].path);

		// Download and save
		return this.downloadAndSave(result, {
			movieId,
			mediaPath,
			videoFileName: basename(file.relativePath),
			format: result.format
		});
	}

	/**
	 * Download a subtitle for an episode
	 */
	async downloadForEpisode(
		episodeId: string,
		result: SubtitleSearchResult
	): Promise<SubtitleDownloadResult> {
		// Get episode, series, and file info
		const episode = await db.select().from(episodes).where(eq(episodes.id, episodeId)).limit(1);
		if (!episode[0]) {
			throw new Error(`Episode not found: ${episodeId}`);
		}

		const seriesData = await db
			.select()
			.from(series)
			.where(eq(series.id, episode[0].seriesId))
			.limit(1);
		if (!seriesData[0]) {
			throw new Error(`Series not found for episode: ${episodeId}`);
		}

		const files = await db
			.select()
			.from(episodeFiles)
			.where(eq(episodeFiles.seriesId, episode[0].seriesId));
		const file = files.find((f) => {
			const ids = f.episodeIds as string[] | null;
			return ids?.includes(episodeId);
		});
		if (!file) {
			throw new Error(`No file found for episode: ${episodeId}`);
		}

		// Get root folder
		const rootFolder = seriesData[0].rootFolderId
			? await db
					.select()
					.from(rootFolders)
					.where(eq(rootFolders.id, seriesData[0].rootFolderId))
					.limit(1)
			: null;

		// Check if root folder is read-only
		if (rootFolder?.[0]?.readOnly) {
			throw new Error('Cannot download subtitles to read-only folder');
		}

		const rootPath = rootFolder?.[0]?.path || '';
		const mediaPath = this.resolveEpisodeMediaDir(rootPath, seriesData[0].path, file.relativePath);

		// Download and save
		return this.downloadAndSave(result, {
			episodeId,
			mediaPath,
			videoFileName: basename(file.relativePath),
			format: result.format
		});
	}

	/**
	 * Delete a subtitle
	 */
	async delete(
		subtitleId: string,
		addToBlacklist: boolean = false,
		reason?: BlacklistReason
	): Promise<void> {
		// Get subtitle record
		const subtitle = await db.select().from(subtitles).where(eq(subtitles.id, subtitleId)).limit(1);
		if (!subtitle[0]) {
			throw new Error(`Subtitle not found: ${subtitleId}`);
		}

		// Get full path and delete file
		const fullPath = await this.getSubtitleFullPath(subtitle[0]);
		if (fullPath && existsSync(fullPath)) {
			await unlink(fullPath);
			logger.debug('Deleted subtitle file', { path: fullPath });
		}

		// Add to blacklist if requested
		if (addToBlacklist && subtitle[0].providerId && subtitle[0].providerSubtitleId) {
			await db.insert(subtitleBlacklist).values({
				movieId: subtitle[0].movieId,
				episodeId: subtitle[0].episodeId,
				providerId: subtitle[0].providerId,
				providerSubtitleId: subtitle[0].providerSubtitleId,
				language: subtitle[0].language,
				reason
			});
		}

		// Log to history
		await db.insert(subtitleHistory).values({
			movieId: subtitle[0].movieId,
			episodeId: subtitle[0].episodeId,
			action: 'deleted',
			language: subtitle[0].language,
			providerId: subtitle[0].providerId,
			providerName: undefined,
			providerSubtitleId: subtitle[0].providerSubtitleId
		});

		// Delete from database
		await db.delete(subtitles).where(eq(subtitles.id, subtitleId));

		logger.info('Subtitle deleted', {
			subtitleId,
			blacklisted: addToBlacklist
		});
	}

	/**
	 * Remove from blacklist
	 */
	async removeFromBlacklist(blacklistId: string): Promise<void> {
		await db.delete(subtitleBlacklist).where(eq(subtitleBlacklist.id, blacklistId));
	}

	/**
	 * Download and save a subtitle file
	 */
	private async downloadAndSave(
		result: SubtitleSearchResult,
		options: {
			movieId?: string;
			episodeId?: string;
			mediaPath: string;
			videoFileName: string;
			format: SubtitleFormat;
		}
	): Promise<SubtitleDownloadResult> {
		const providerManager = getSubtitleProviderManager();

		// Get provider instance
		const provider = await providerManager.getProviderInstance(result.providerId);
		if (!provider) {
			throw new Error(`Provider not available: ${result.providerId}`);
		}

		// Download subtitle content
		let content: Buffer;
		try {
			content = await provider.download(result);
		} catch (error) {
			logger.error('Failed to download subtitle', {
				provider: result.providerName,
				error: error instanceof Error ? error.message : String(error)
			});
			throw error;
		}

		// Handle zip files
		if (this.isZipFile(content)) {
			content = await this.extractFromZip(content);
		}

		const normalizedLanguage = normalizeLanguageCode(result.language);

		// Generate filename
		const subtitleFileName = this.generateFileName(
			options.videoFileName,
			normalizedLanguage,
			result.isForced,
			result.isHearingImpaired,
			result.format
		);

		// Ensure directory exists
		await mkdir(options.mediaPath, { recursive: true });

		// Save file
		const subtitlePath = join(options.mediaPath, subtitleFileName);
		await writeFile(subtitlePath, content);

		logger.debug('Saved subtitle file', {
			path: subtitlePath,
			size: content.length
		});

		// Check for existing subtitle to upgrade
		const existingSubtitle = await this.findExistingSubtitle(
			options.movieId,
			options.episodeId,
			normalizedLanguage,
			result.isForced,
			result.isHearingImpaired
		);

		let wasUpgrade = false;
		let replacedSubtitleId: string | undefined;

		if (existingSubtitle) {
			wasUpgrade = true;
			replacedSubtitleId = existingSubtitle.id;

			// Delete old file if it exists
			const oldPath = await this.getSubtitleFullPath(existingSubtitle);
			if (oldPath && existsSync(oldPath) && oldPath !== subtitlePath) {
				await unlink(oldPath);
			}

			// Delete old record
			await db.delete(subtitles).where(eq(subtitles.id, existingSubtitle.id));
		}

		// Create database record
		const subtitleId = randomUUID();
		await db.insert(subtitles).values({
			id: subtitleId,
			movieId: options.movieId,
			episodeId: options.episodeId,
			relativePath: subtitleFileName,
			language: normalizedLanguage,
			isForced: result.isForced,
			isHearingImpaired: result.isHearingImpaired,
			format: result.format,
			providerId: result.providerId,
			providerSubtitleId: result.providerSubtitleId,
			matchScore: result.matchScore,
			isHashMatch: result.isHashMatch,
			size: content.length
		});

		// Log to history
		await db.insert(subtitleHistory).values({
			movieId: options.movieId,
			episodeId: options.episodeId,
			action: wasUpgrade ? 'upgraded' : 'downloaded',
			language: normalizedLanguage,
			providerId: result.providerId,
			providerName: result.providerName,
			providerSubtitleId: result.providerSubtitleId,
			matchScore: result.matchScore,
			wasHashMatch: result.isHashMatch,
			replacedSubtitleId
		});

		logger.info('Subtitle downloaded', {
			subtitleId,
			provider: result.providerName,
			language: normalizedLanguage,
			wasUpgrade
		});

		return {
			subtitleId,
			path: subtitlePath,
			language: normalizedLanguage,
			format: result.format,
			wasUpgrade,
			replacedSubtitleId
		};
	}

	/**
	 * Generate subtitle filename following naming convention
	 * Format: {VideoName}.{lang}.{flags}.{ext}
	 */
	private generateFileName(
		videoFileName: string,
		language: string,
		isForced: boolean,
		isHi: boolean,
		format: SubtitleFormat
	): string {
		const videoBaseName = basename(videoFileName, extname(videoFileName));
		const ext = format === 'unknown' ? 'srt' : format;

		let flags = '';
		if (isForced) flags += '.forced';
		if (isHi) flags += '.hi';

		return `${videoBaseName}.${language}${flags}.${ext}`;
	}

	/**
	 * Check if content is a zip file
	 */
	private isZipFile(content: Buffer): boolean {
		// ZIP magic bytes: PK (0x50 0x4B)
		return content.length >= 2 && content[0] === 0x50 && content[1] === 0x4b;
	}

	/**
	 * Extract subtitle from zip file
	 */
	private async extractFromZip(zipContent: Buffer): Promise<Buffer> {
		const zip = new AdmZip(zipContent);
		const entries = zip.getEntries();

		// Find subtitle file in zip
		const subtitleExtensions = ['.srt', '.ass', '.ssa', '.sub', '.vtt'];
		const subtitleEntry = entries.find((entry) => {
			const ext = extname(entry.entryName).toLowerCase();
			return subtitleExtensions.includes(ext) && !entry.isDirectory;
		});

		if (!subtitleEntry) {
			throw new Error('No subtitle file found in zip archive');
		}

		return subtitleEntry.getData();
	}

	/**
	 * Find existing subtitle with same language/flags
	 */
	private async findExistingSubtitle(
		movieId: string | undefined,
		episodeId: string | undefined,
		language: string,
		isForced: boolean,
		isHi: boolean
	): Promise<typeof subtitles.$inferSelect | null> {
		const normalizedLanguage = normalizeLanguageCode(language);
		const languageValues =
			normalizedLanguage === language ? [language] : [language, normalizedLanguage];

		const conditions = [
			inArray(subtitles.language, languageValues),
			eq(subtitles.isForced, isForced),
			eq(subtitles.isHearingImpaired, isHi)
		];

		if (movieId) {
			conditions.push(eq(subtitles.movieId, movieId));
		}
		if (episodeId) {
			conditions.push(eq(subtitles.episodeId, episodeId));
		}

		const existing = await db
			.select()
			.from(subtitles)
			.where(and(...conditions))
			.limit(1);

		return existing[0] || null;
	}

	/**
	 * Get full path for a subtitle record
	 */
	private async getSubtitleFullPath(
		subtitle: typeof subtitles.$inferSelect
	): Promise<string | null> {
		if (subtitle.movieId) {
			const movie = await db.select().from(movies).where(eq(movies.id, subtitle.movieId)).limit(1);
			if (!movie[0]) return null;

			const rootFolder = movie[0].rootFolderId
				? await db
						.select()
						.from(rootFolders)
						.where(eq(rootFolders.id, movie[0].rootFolderId))
						.limit(1)
				: null;

			const rootPath = rootFolder?.[0]?.path || '';
			return join(rootPath, movie[0].path, subtitle.relativePath);
		}

		if (subtitle.episodeId) {
			const episode = await db
				.select()
				.from(episodes)
				.where(eq(episodes.id, subtitle.episodeId))
				.limit(1);
			if (!episode[0]) return null;

			const seriesData = await db
				.select()
				.from(series)
				.where(eq(series.id, episode[0].seriesId))
				.limit(1);
			if (!seriesData[0]) return null;

			const rootFolder = seriesData[0].rootFolderId
				? await db
						.select()
						.from(rootFolders)
						.where(eq(rootFolders.id, seriesData[0].rootFolderId))
						.limit(1)
				: null;

			const rootPath = rootFolder?.[0]?.path || '';

			// Find the episode file to get the correct directory (includes season folder)
			const files = await db
				.select()
				.from(episodeFiles)
				.where(eq(episodeFiles.seriesId, episode[0].seriesId));
			const file = files.find((f) => {
				const ids = f.episodeIds as string[] | null;
				return ids?.includes(subtitle.episodeId!);
			});

			if (file) {
				const mediaDir = this.resolveEpisodeMediaDir(
					rootPath,
					seriesData[0].path,
					file.relativePath
				);
				return join(mediaDir, subtitle.relativePath);
			}

			// Fallback: use series path if no file found
			return join(rootPath, seriesData[0].path, subtitle.relativePath);
		}

		return null;
	}

	private resolveEpisodeMediaDir(
		rootPath: string,
		seriesPath: string | null,
		fileRelativePath: string
	): string {
		const seriesRel = (seriesPath ?? '').replace(/^[/\\]+/, '');
		let fileDir = dirname(fileRelativePath).replace(/^[/\\]+/, '');

		if (seriesRel && !(fileDir === seriesRel || fileDir.startsWith(`${seriesRel}/`))) {
			fileDir = join(seriesRel, fileDir);
		}

		return join(rootPath, fileDir);
	}
}

/**
 * Get the singleton SubtitleDownloadService
 */
export function getSubtitleDownloadService(): SubtitleDownloadService {
	return SubtitleDownloadService.getInstance();
}
