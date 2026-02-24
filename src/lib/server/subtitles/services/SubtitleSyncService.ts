/**
 * Subtitle Sync Service
 *
 * Integrates with ffsubsync for automatic subtitle timing correction.
 * Syncs subtitles against video audio track or reference subtitle.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { join, dirname, basename, extname } from 'node:path';
import { db } from '$lib/server/db';
import {
	subtitles,
	subtitleHistory,
	movies,
	series,
	episodes,
	movieFiles,
	episodeFiles,
	rootFolders
} from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '$lib/logging';
import type { SubtitleSyncResult } from '../types';

const execFileAsync = promisify(execFile);

/** Sync options */
export interface SyncOptions {
	/** Reference type: 'video' (audio track) or 'subtitle' (another subtitle file) */
	referenceType?: 'video' | 'subtitle';
	/** Path to reference subtitle (if referenceType is 'subtitle') */
	referencePath?: string;
	/** Maximum offset in seconds to apply */
	maxOffsetSeconds?: number;
	/** Whether to skip framerate correction */
	noFixFramerate?: boolean;
	/** Use Golden Section Search (more accurate but slower) */
	gss?: boolean;
}

/**
 * Service for syncing subtitle timing
 */
export class SubtitleSyncService {
	private static instance: SubtitleSyncService | null = null;
	private ffsubsyncAvailable: boolean | null = null;
	/** Resolved binary name ('ffsubsync' or 'ffs') */
	private ffsubsyncBinary: string = 'ffsubsync';

	private constructor() {}

	static getInstance(): SubtitleSyncService {
		if (!SubtitleSyncService.instance) {
			SubtitleSyncService.instance = new SubtitleSyncService();
		}
		return SubtitleSyncService.instance;
	}

	/**
	 * Check if ffsubsync is installed and available
	 */
	async isAvailable(): Promise<boolean> {
		if (this.ffsubsyncAvailable !== null) {
			return this.ffsubsyncAvailable;
		}

		try {
			await execFileAsync('ffsubsync', ['--version']);
			this.ffsubsyncBinary = 'ffsubsync';
			this.ffsubsyncAvailable = true;
			logger.info('ffsubsync is available');
		} catch {
			// Try alternative: ffs (shorter command)
			try {
				await execFileAsync('ffs', ['--version']);
				this.ffsubsyncBinary = 'ffs';
				this.ffsubsyncAvailable = true;
				logger.info('ffsubsync (ffs) is available');
			} catch {
				this.ffsubsyncAvailable = false;
				logger.warn('ffsubsync is not available - subtitle sync will be disabled');
			}
		}

		return this.ffsubsyncAvailable;
	}

	/**
	 * Sync a subtitle by ID
	 */
	async syncSubtitle(subtitleId: string, options?: SyncOptions): Promise<SubtitleSyncResult> {
		// Check availability
		if (!(await this.isAvailable())) {
			return {
				success: false,
				offsetMs: 0,
				error: 'ffsubsync is not installed'
			};
		}

		// Get subtitle record
		const subtitle = await db.select().from(subtitles).where(eq(subtitles.id, subtitleId)).limit(1);
		if (!subtitle[0]) {
			return {
				success: false,
				offsetMs: 0,
				error: `Subtitle not found: ${subtitleId}`
			};
		}

		// Get paths
		const { subtitlePath, videoPath } = await this.getSubtitlePaths(subtitle[0]);
		if (!subtitlePath || !existsSync(subtitlePath)) {
			return {
				success: false,
				offsetMs: 0,
				error: 'Subtitle file not found'
			};
		}

		if (!videoPath || !existsSync(videoPath)) {
			return {
				success: false,
				offsetMs: 0,
				error: 'Video file not found for syncing'
			};
		}

		// Perform sync
		const result = await this.performSync(subtitlePath, videoPath, options);

		// Update database if successful
		if (result.success) {
			await db
				.update(subtitles)
				.set({
					syncOffset: result.offsetMs,
					wasSynced: true
				})
				.where(eq(subtitles.id, subtitleId));

			// Log to history
			await db.insert(subtitleHistory).values({
				movieId: subtitle[0].movieId,
				episodeId: subtitle[0].episodeId,
				action: 'synced',
				language: subtitle[0].language,
				providerId: subtitle[0].providerId,
				matchScore: subtitle[0].matchScore
			});

			logger.info('Subtitle synced successfully', {
				subtitleId,
				offsetMs: result.offsetMs
			});
		}

		return result;
	}

	/**
	 * Sync a subtitle file directly (without database record)
	 */
	async syncFile(
		subtitlePath: string,
		videoPath: string,
		options?: SyncOptions
	): Promise<SubtitleSyncResult> {
		if (!(await this.isAvailable())) {
			return {
				success: false,
				offsetMs: 0,
				error: 'ffsubsync is not installed'
			};
		}

		return this.performSync(subtitlePath, videoPath, options);
	}

	/**
	 * Apply a manual offset to a subtitle file
	 */
	async applyManualOffset(subtitleId: string, offsetMs: number): Promise<SubtitleSyncResult> {
		// Get subtitle record
		const subtitle = await db.select().from(subtitles).where(eq(subtitles.id, subtitleId)).limit(1);
		if (!subtitle[0]) {
			return {
				success: false,
				offsetMs: 0,
				error: `Subtitle not found: ${subtitleId}`
			};
		}

		// Get path
		const { subtitlePath } = await this.getSubtitlePaths(subtitle[0]);
		if (!subtitlePath || !existsSync(subtitlePath)) {
			return {
				success: false,
				offsetMs: 0,
				error: 'Subtitle file not found'
			};
		}

		try {
			// Read and shift subtitle
			const content = await readFile(subtitlePath, 'utf-8');
			const shifted = this.shiftSrtTiming(content, offsetMs);
			await writeFile(subtitlePath, shifted, 'utf-8');

			// Update database
			await db
				.update(subtitles)
				.set({
					syncOffset: offsetMs,
					wasSynced: true
				})
				.where(eq(subtitles.id, subtitleId));

			// Log to history
			await db.insert(subtitleHistory).values({
				movieId: subtitle[0].movieId,
				episodeId: subtitle[0].episodeId,
				action: 'synced',
				language: subtitle[0].language,
				providerId: subtitle[0].providerId,
				matchScore: subtitle[0].matchScore
			});

			return {
				success: true,
				offsetMs
			};
		} catch (error) {
			return {
				success: false,
				offsetMs: 0,
				error: error instanceof Error ? error.message : String(error)
			};
		}
	}

	/**
	 * Perform the actual sync using ffsubsync
	 */
	private async performSync(
		subtitlePath: string,
		videoPath: string,
		options?: SyncOptions
	): Promise<SubtitleSyncResult> {
		// Create output path (same location with .synced suffix before extension)
		const dir = dirname(subtitlePath);
		const ext = extname(subtitlePath);
		const base = basename(subtitlePath, ext);
		const outputPath = join(dir, `${base}.synced${ext}`);

		// Build argument array (execFileAsync handles escaping — no shell involved)
		const execArgs: string[] = [];

		// Reference (video or subtitle)
		if (options?.referenceType === 'subtitle' && options.referencePath) {
			execArgs.push(options.referencePath);
		} else {
			execArgs.push(videoPath);
		}

		// Input subtitle
		execArgs.push('-i', subtitlePath);

		// Output
		execArgs.push('-o', outputPath);

		// Options
		if (options?.maxOffsetSeconds) {
			execArgs.push('--max-offset-seconds', options.maxOffsetSeconds.toString());
		}
		if (options?.noFixFramerate) {
			execArgs.push('--no-fix-framerate');
		}
		if (options?.gss) {
			execArgs.push('--gss');
		}

		try {
			logger.debug('Running ffsubsync', { binary: this.ffsubsyncBinary, args: execArgs });

			const { stdout, stderr } = await execFileAsync(this.ffsubsyncBinary, execArgs, {
				timeout: 300000 // 5 minute timeout
			});

			// Parse output for offset info
			const offsetMatch = stderr.match(/offset: ([-\d.]+)/i) || stdout.match(/offset: ([-\d.]+)/i);
			const offsetSeconds = offsetMatch ? parseFloat(offsetMatch[1]) : 0;
			const offsetMs = Math.round(offsetSeconds * 1000);

			// Check if output was created
			if (!existsSync(outputPath)) {
				return {
					success: false,
					offsetMs: 0,
					error: 'Sync failed - no output file created'
				};
			}

			// Replace original with synced version
			await rename(outputPath, subtitlePath);

			return {
				success: true,
				offsetMs,
				confidence: this.parseConfidence(stdout + stderr)
			};
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			logger.error('ffsubsync failed', { error: errorMsg });

			// Clean up partial output
			if (existsSync(outputPath)) {
				try {
					await import('fs/promises').then((fs) => fs.unlink(outputPath));
				} catch {
					// Ignore cleanup errors
				}
			}

			return {
				success: false,
				offsetMs: 0,
				error: errorMsg
			};
		}
	}

	/**
	 * Parse confidence from ffsubsync output
	 */
	private parseConfidence(output: string): number | undefined {
		const match = output.match(/confidence: ([\d.]+)/i);
		return match ? parseFloat(match[1]) : undefined;
	}

	/**
	 * Shift SRT timing by offset (for manual sync)
	 */
	private shiftSrtTiming(content: string, offsetMs: number): string {
		// SRT timestamp format: 00:00:00,000 --> 00:00:00,000
		const timestampRegex = /(\d{2}):(\d{2}):(\d{2}),(\d{3})/g;

		return content.replace(timestampRegex, (match, hours, minutes, seconds, ms) => {
			const totalMs =
				parseInt(hours) * 3600000 +
				parseInt(minutes) * 60000 +
				parseInt(seconds) * 1000 +
				parseInt(ms);

			const newTotalMs = Math.max(0, totalMs + offsetMs);

			const newHours = Math.floor(newTotalMs / 3600000);
			const newMinutes = Math.floor((newTotalMs % 3600000) / 60000);
			const newSeconds = Math.floor((newTotalMs % 60000) / 1000);
			const newMs = newTotalMs % 1000;

			return `${newHours.toString().padStart(2, '0')}:${newMinutes.toString().padStart(2, '0')}:${newSeconds.toString().padStart(2, '0')},${newMs.toString().padStart(3, '0')}`;
		});
	}

	/**
	 * Get full paths for a subtitle record
	 */
	private async getSubtitlePaths(
		subtitle: typeof subtitles.$inferSelect
	): Promise<{ subtitlePath: string | null; videoPath: string | null }> {
		if (subtitle.movieId) {
			const movie = await db.select().from(movies).where(eq(movies.id, subtitle.movieId)).limit(1);
			if (!movie[0]) return { subtitlePath: null, videoPath: null };

			const files = await db
				.select()
				.from(movieFiles)
				.where(eq(movieFiles.movieId, subtitle.movieId));
			const file = files[0];

			const rootFolder = movie[0].rootFolderId
				? await db
						.select()
						.from(rootFolders)
						.where(eq(rootFolders.id, movie[0].rootFolderId))
						.limit(1)
				: null;

			const rootPath = rootFolder?.[0]?.path || '';
			const mediaPath = join(rootPath, movie[0].path);

			return {
				subtitlePath: join(mediaPath, subtitle.relativePath),
				videoPath: file ? join(mediaPath, file.relativePath) : null
			};
		}

		if (subtitle.episodeId) {
			const episode = await db
				.select()
				.from(episodes)
				.where(eq(episodes.id, subtitle.episodeId))
				.limit(1);
			if (!episode[0]) return { subtitlePath: null, videoPath: null };

			const seriesData = await db
				.select()
				.from(series)
				.where(eq(series.id, episode[0].seriesId))
				.limit(1);
			if (!seriesData[0]) return { subtitlePath: null, videoPath: null };

			const files = await db
				.select()
				.from(episodeFiles)
				.where(eq(episodeFiles.seriesId, episode[0].seriesId));
			const file = files.find((f) => {
				const ids = f.episodeIds as string[] | null;
				return ids?.includes(subtitle.episodeId!);
			});

			const rootFolder = seriesData[0].rootFolderId
				? await db
						.select()
						.from(rootFolders)
						.where(eq(rootFolders.id, seriesData[0].rootFolderId))
						.limit(1)
				: null;

			const rootPath = rootFolder?.[0]?.path || '';
			const basePath = join(rootPath, seriesData[0].path);

			return {
				subtitlePath: join(basePath, subtitle.relativePath),
				videoPath: file ? join(basePath, file.relativePath) : null
			};
		}

		return { subtitlePath: null, videoPath: null };
	}
}

/**
 * Get the singleton SubtitleSyncService
 */
export function getSubtitleSyncService(): SubtitleSyncService {
	return SubtitleSyncService.getInstance();
}
