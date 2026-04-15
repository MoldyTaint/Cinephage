/**
 * Subtitle Scanner Service
 *
 * Discovers and registers existing subtitle files on disk.
 * Integrates with the library scanner to detect subtitles alongside video files.
 */

import { readdir, stat } from 'fs/promises';
import { join, basename, dirname, extname } from 'path';
import { db } from '$lib/server/db';
import {
	subtitles,
	subtitleHistory,
	movies,
	episodeFiles,
	rootFolders,
	series
} from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import type { SubtitleFormat, LanguageCode } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { getSubtitleSettingsService } from './SubtitleSettingsService';
import { createChildLogger } from '$lib/logging';

const logger = createChildLogger({ logDomain: 'subtitles' as const });
import { normalizeLanguageCode } from '$lib/shared/languages';

/** Common subtitle file extensions */
const SUBTITLE_EXTENSIONS = ['.srt', '.sub', '.ass', '.ssa', '.vtt', '.idx'];

/**
 * Language patterns in subtitle filenames
 * Ordered from most specific to least specific to ensure correct matching
 * Regional variants (like pt-br, zh-tw) are checked before base languages
 */
const LANGUAGE_PATTERNS: Array<{ pattern: RegExp; code: LanguageCode }> = [
	// Regional variants - must come FIRST (more specific patterns)
	{ pattern: /\.(?:pt[-_]?br|brazilian|bra)\./i, code: 'pt-br' },
	{ pattern: /\.(?:pt[-_]?pt|portuguese[-_]?portugal)\./i, code: 'pt' },
	{ pattern: /\.(?:zh[-_]?tw|zh[-_]?hant|traditional[-_]?chinese|cht)\./i, code: 'zh-tw' },
	{ pattern: /\.(?:zh[-_]?cn|zh[-_]?hans|simplified[-_]?chinese|chs)\./i, code: 'zh-cn' },
	{ pattern: /\.(?:es[-_]?la|spanish[-_]?latin|lat)\./i, code: 'es-la' },
	{ pattern: /\.(?:fr[-_]?ca|french[-_]?canada)\./i, code: 'fr-ca' },
	// Full language names
	{ pattern: /\.english\./i, code: 'en' },
	{ pattern: /\.spanish\./i, code: 'es' },
	{ pattern: /\.french\./i, code: 'fr' },
	{ pattern: /\.german\./i, code: 'de' },
	{ pattern: /\.italian\./i, code: 'it' },
	{ pattern: /\.portuguese\./i, code: 'pt' },
	{ pattern: /\.russian\./i, code: 'ru' },
	{ pattern: /\.chinese\./i, code: 'zh' },
	{ pattern: /\.japanese\./i, code: 'ja' },
	{ pattern: /\.korean\./i, code: 'ko' },
	{ pattern: /\.arabic\./i, code: 'ar' },
	{ pattern: /\.hindi\./i, code: 'hi' },
	{ pattern: /\.dutch\./i, code: 'nl' },
	{ pattern: /\.polish\./i, code: 'pl' },
	{ pattern: /\.swedish\./i, code: 'sv' },
	{ pattern: /\.norwegian\./i, code: 'no' },
	{ pattern: /\.danish\./i, code: 'da' },
	{ pattern: /\.finnish\./i, code: 'fi' },
	{ pattern: /\.greek\./i, code: 'el' },
	{ pattern: /\.turkish\./i, code: 'tr' },
	{ pattern: /\.hebrew\./i, code: 'he' },
	{ pattern: /\.thai\./i, code: 'th' },
	{ pattern: /\.vietnamese\./i, code: 'vi' },
	{ pattern: /\.czech\./i, code: 'cs' },
	{ pattern: /\.hungarian\./i, code: 'hu' },
	{ pattern: /\.romanian\./i, code: 'ro' },
	{ pattern: /\.bulgarian\./i, code: 'bg' },
	{ pattern: /\.ukrainian\./i, code: 'uk' },
	{ pattern: /\.indonesian\./i, code: 'id' },
	{ pattern: /\.malay\./i, code: 'ms' },
	{ pattern: /\.croatian\./i, code: 'hr' },
	{ pattern: /\.serbian\./i, code: 'sr' },
	{ pattern: /\.slovak\./i, code: 'sk' },
	{ pattern: /\.slovenian\./i, code: 'sl' },
	{ pattern: /\.persian\./i, code: 'fa' },
	{ pattern: /\.farsi\./i, code: 'fa' },
	{ pattern: /\.bengali\./i, code: 'bn' },
	{ pattern: /\.tamil\./i, code: 'ta' },
	{ pattern: /\.telugu\./i, code: 'te' },
	{ pattern: /\.icelandic\./i, code: 'is' },
	{ pattern: /\.catalan\./i, code: 'ca' },
	// ISO 639-1 codes (2-letter) - order matters, check longer variants first
	{ pattern: /\.en\./i, code: 'en' },
	{ pattern: /\.es\./i, code: 'es' },
	{ pattern: /\.fr\./i, code: 'fr' },
	{ pattern: /\.de\./i, code: 'de' },
	{ pattern: /\.it\./i, code: 'it' },
	{ pattern: /\.pt\./i, code: 'pt' },
	{ pattern: /\.ru\./i, code: 'ru' },
	{ pattern: /\.zh\./i, code: 'zh' },
	{ pattern: /\.ja\./i, code: 'ja' },
	{ pattern: /\.ko\./i, code: 'ko' },
	{ pattern: /\.ar\./i, code: 'ar' },
	// Note: .hi. is ambiguous - could be Hindi or Hearing Impaired. Handled specially.
	{ pattern: /\.nl\./i, code: 'nl' },
	{ pattern: /\.pl\./i, code: 'pl' },
	{ pattern: /\.sv\./i, code: 'sv' },
	{ pattern: /\.no\./i, code: 'no' },
	{ pattern: /\.da\./i, code: 'da' },
	{ pattern: /\.fi\./i, code: 'fi' },
	{ pattern: /\.el\./i, code: 'el' },
	{ pattern: /\.tr\./i, code: 'tr' },
	{ pattern: /\.he\./i, code: 'he' },
	{ pattern: /\.th\./i, code: 'th' },
	{ pattern: /\.vi\./i, code: 'vi' },
	{ pattern: /\.cs\./i, code: 'cs' },
	{ pattern: /\.hu\./i, code: 'hu' },
	{ pattern: /\.ro\./i, code: 'ro' },
	{ pattern: /\.bg\./i, code: 'bg' },
	{ pattern: /\.uk\./i, code: 'uk' },
	{ pattern: /\.id\./i, code: 'id' },
	{ pattern: /\.ms\./i, code: 'ms' },
	{ pattern: /\.hr\./i, code: 'hr' },
	{ pattern: /\.sr\./i, code: 'sr' },
	{ pattern: /\.sk\./i, code: 'sk' },
	{ pattern: /\.sl\./i, code: 'sl' },
	{ pattern: /\.fa\./i, code: 'fa' },
	{ pattern: /\.bn\./i, code: 'bn' },
	{ pattern: /\.ta\./i, code: 'ta' },
	{ pattern: /\.te\./i, code: 'te' },
	{ pattern: /\.is\./i, code: 'is' },
	{ pattern: /\.ca\./i, code: 'ca' },
	// 3-letter ISO 639-2 codes
	{ pattern: /\.eng\./i, code: 'en' },
	{ pattern: /\.spa\./i, code: 'es' },
	{ pattern: /\.fre\./i, code: 'fr' },
	{ pattern: /\.ger\./i, code: 'de' },
	{ pattern: /\.deu\./i, code: 'de' },
	{ pattern: /\.ita\./i, code: 'it' },
	{ pattern: /\.por\./i, code: 'pt' },
	{ pattern: /\.pob\./i, code: 'pt-br' }, // Common for Brazilian Portuguese
	{ pattern: /\.rus\./i, code: 'ru' },
	{ pattern: /\.chi\./i, code: 'zh' },
	{ pattern: /\.zho\./i, code: 'zh' },
	{ pattern: /\.jpn\./i, code: 'ja' },
	{ pattern: /\.kor\./i, code: 'ko' },
	{ pattern: /\.ara\./i, code: 'ar' },
	{ pattern: /\.hin\./i, code: 'hi' },
	{ pattern: /\.dut\./i, code: 'nl' },
	{ pattern: /\.nld\./i, code: 'nl' },
	{ pattern: /\.pol\./i, code: 'pl' },
	{ pattern: /\.swe\./i, code: 'sv' },
	{ pattern: /\.nor\./i, code: 'no' },
	{ pattern: /\.dan\./i, code: 'da' },
	{ pattern: /\.fin\./i, code: 'fi' },
	{ pattern: /\.gre\./i, code: 'el' },
	{ pattern: /\.ell\./i, code: 'el' },
	{ pattern: /\.tur\./i, code: 'tr' },
	{ pattern: /\.heb\./i, code: 'he' },
	{ pattern: /\.tha\./i, code: 'th' },
	{ pattern: /\.vie\./i, code: 'vi' },
	{ pattern: /\.cze\./i, code: 'cs' },
	{ pattern: /\.ces\./i, code: 'cs' },
	{ pattern: /\.hun\./i, code: 'hu' },
	{ pattern: /\.rum\./i, code: 'ro' },
	{ pattern: /\.ron\./i, code: 'ro' },
	{ pattern: /\.bul\./i, code: 'bg' },
	{ pattern: /\.ukr\./i, code: 'uk' },
	{ pattern: /\.ind\./i, code: 'id' },
	{ pattern: /\.may\./i, code: 'ms' },
	{ pattern: /\.msa\./i, code: 'ms' },
	{ pattern: /\.hrv\./i, code: 'hr' },
	{ pattern: /\.srp\./i, code: 'sr' },
	{ pattern: /\.slo\./i, code: 'sk' },
	{ pattern: /\.slk\./i, code: 'sk' },
	{ pattern: /\.slv\./i, code: 'sl' },
	{ pattern: /\.per\./i, code: 'fa' },
	{ pattern: /\.fas\./i, code: 'fa' },
	{ pattern: /\.ben\./i, code: 'bn' },
	{ pattern: /\.tam\./i, code: 'ta' },
	{ pattern: /\.tel\./i, code: 'te' },
	{ pattern: /\.ice\./i, code: 'is' },
	{ pattern: /\.isl\./i, code: 'is' },
	{ pattern: /\.cat\./i, code: 'ca' }
];

/** Patterns for detecting forced/HI subtitles */
const FORCED_PATTERN = /\.forced\./i;
const HI_PATTERNS = [/\.hi\./i, /\.sdh\./i, /\.cc\./i, /hearing[_\s-]?impaired/i];

interface DiscoveredSubtitle {
	path: string;
	relativePath: string;
	size: number;
	language: LanguageCode;
	isForced: boolean;
	isHearingImpaired: boolean;
	format: SubtitleFormat;
	videoFileName?: string;
}

interface ScanResult {
	discovered: number;
	registered: number;
	skipped: number;
	errors: string[];
}

class SubtitleScannerService {
	private static instance: SubtitleScannerService | null = null;
	private fallbackLanguage: LanguageCode = 'en';
	private settingsLoaded = false;

	private constructor() {}

	static getInstance(): SubtitleScannerService {
		if (!SubtitleScannerService.instance) {
			SubtitleScannerService.instance = new SubtitleScannerService();
		}
		return SubtitleScannerService.instance;
	}

	/**
	 * Load settings including fallback language
	 */
	private async ensureSettingsLoaded(): Promise<void> {
		if (this.settingsLoaded) return;
		try {
			const settingsService = getSubtitleSettingsService();
			this.fallbackLanguage = (await settingsService.getFallbackLanguage()) as LanguageCode;
			this.settingsLoaded = true;
		} catch (error) {
			logger.warn({ error }, 'Failed to load subtitle settings, using default fallback language');
		}
	}

	/**
	 * Check if a file is a subtitle file
	 */
	isSubtitleFile(fileName: string): boolean {
		const ext = extname(fileName).toLowerCase();
		return SUBTITLE_EXTENSIONS.includes(ext);
	}

	/**
	 * Detect language from subtitle filename
	 * Uses pattern matching and normalizes the result through the centralized language module
	 */
	detectLanguage(fileName: string): LanguageCode {
		// First, check for .hi. which is ambiguous (Hindi vs Hearing Impaired)
		// If the file also has SDH or CC markers, .hi. likely means Hearing Impaired, not Hindi
		const hasOtherHiMarkers =
			/\.sdh\./i.test(fileName) ||
			/\.cc\./i.test(fileName) ||
			/hearing[_\s-]?impaired/i.test(fileName);

		for (const { pattern, code } of LANGUAGE_PATTERNS) {
			if (pattern.test(fileName)) {
				// Skip .hi. interpretation as Hindi if file has other HI markers
				if (code === 'hi' && pattern.source.includes('.hi.') && hasOtherHiMarkers) {
					continue;
				}
				// Normalize the code through the shared language module
				return normalizeLanguageCode(code);
			}
		}
		// Use configurable fallback language (defaults to 'en' if not loaded)
		return this.fallbackLanguage;
	}

	/**
	 * Check if subtitle is forced
	 */
	isForced(fileName: string): boolean {
		return FORCED_PATTERN.test(fileName);
	}

	/**
	 * Check if subtitle is for hearing impaired
	 */
	isHearingImpaired(fileName: string): boolean {
		return HI_PATTERNS.some((pattern) => pattern.test(fileName));
	}

	/**
	 * Get subtitle format from extension
	 */
	getFormat(fileName: string): SubtitleFormat {
		const ext = extname(fileName).toLowerCase();
		switch (ext) {
			case '.srt':
				return 'srt';
			case '.ass':
			case '.ssa':
				return 'ass';
			case '.sub':
				return 'sub';
			case '.vtt':
				return 'vtt';
			default:
				return 'unknown';
		}
	}

	/**
	 * Discover subtitle files in a directory
	 */
	async discoverSubtitles(directoryPath: string, rootPath: string): Promise<DiscoveredSubtitle[]> {
		// Ensure settings are loaded before scanning
		await this.ensureSettingsLoaded();

		const subtitleFiles: DiscoveredSubtitle[] = [];

		try {
			const entries = await readdir(directoryPath, { withFileTypes: true });

			for (const entry of entries) {
				const fullPath = join(directoryPath, entry.name);

				if (entry.isDirectory()) {
					// Skip system folders
					if (entry.name.startsWith('.') || entry.name.startsWith('@')) {
						continue;
					}
					// Recursively scan subdirectories
					const subResults = await this.discoverSubtitles(fullPath, rootPath);
					subtitleFiles.push(...subResults);
				} else if (entry.isFile() && this.isSubtitleFile(entry.name)) {
					try {
						const stats = await stat(fullPath);
						const relativePath = fullPath.replace(rootPath + '/', '');
						const baseName = basename(fullPath);

						// Try to find associated video file
						const videoFileName = this.findAssociatedVideoFileName(baseName);

						subtitleFiles.push({
							path: fullPath,
							relativePath,
							size: stats.size,
							language: this.detectLanguage(baseName),
							isForced: this.isForced(baseName),
							isHearingImpaired: this.isHearingImpaired(baseName),
							format: this.getFormat(baseName),
							videoFileName
						});
					} catch (error) {
						logger.warn({ path: fullPath, error }, 'Could not stat subtitle file');
					}
				}
			}
		} catch (error) {
			logger.error({ directoryPath, error }, 'Error reading directory for subtitles');
		}

		return subtitleFiles;
	}

	/**
	 * Extract likely video filename from subtitle filename
	 * E.g., "Movie.2024.en.srt" -> "Movie.2024"
	 */
	private findAssociatedVideoFileName(subtitleFileName: string): string | undefined {
		// Remove extension
		let name = basename(subtitleFileName, extname(subtitleFileName));

		// Remove language tags
		for (const { pattern } of LANGUAGE_PATTERNS) {
			name = name.replace(pattern, '.');
		}

		// Remove forced/HI tags
		name = name.replace(FORCED_PATTERN, '.');
		for (const pattern of HI_PATTERNS) {
			name = name.replace(pattern, '.');
		}

		// Clean up double dots and trailing dots
		name = name.replace(/\.+/g, '.').replace(/\.$/, '');

		return name || undefined;
	}

	/**
	 * Scan and register subtitles for a movie
	 */
	async scanMovieSubtitles(movieId: string): Promise<ScanResult> {
		const result: ScanResult = { discovered: 0, registered: 0, skipped: 0, errors: [] };

		try {
			const movie = await db.query.movies.findFirst({
				where: eq(movies.id, movieId)
			});

			if (!movie) {
				result.errors.push(`Movie not found: ${movieId}`);
				return result;
			}

			if (!movie.rootFolderId) {
				result.errors.push(`Movie has no root folder: ${movieId}`);
				return result;
			}

			const rootFolder = await db.query.rootFolders.findFirst({
				where: eq(rootFolders.id, movie.rootFolderId)
			});

			if (!rootFolder) {
				result.errors.push(`Root folder not found`);
				return result;
			}

			const moviePath = join(rootFolder.path, movie.path);
			const discovered = await this.discoverSubtitles(moviePath, moviePath);
			result.discovered = discovered.length;

			for (const sub of discovered) {
				try {
					// Check if already registered
					const existing = await db.query.subtitles.findFirst({
						where: and(eq(subtitles.movieId, movieId), eq(subtitles.relativePath, sub.relativePath))
					});

					if (existing) {
						result.skipped++;
						continue;
					}

					// Register the subtitle
					await db.insert(subtitles).values({
						id: uuidv4(),
						movieId,
						relativePath: sub.relativePath,
						language: sub.language,
						isForced: sub.isForced,
						isHearingImpaired: sub.isHearingImpaired,
						format: sub.format,
						size: sub.size,
						dateAdded: new Date().toISOString()
					});

					// Record in history
					await db.insert(subtitleHistory).values({
						id: uuidv4(),
						movieId,
						action: 'discovered',
						language: sub.language,
						createdAt: new Date().toISOString()
					});

					result.registered++;
				} catch (error) {
					result.errors.push(
						`Error registering ${sub.relativePath}: ${error instanceof Error ? error.message : 'Unknown error'}`
					);
				}
			}
		} catch (error) {
			result.errors.push(error instanceof Error ? error.message : 'Unknown error');
		}

		return result;
	}

	/**
	 * Scan and register subtitles for a series
	 */
	async scanSeriesSubtitles(seriesId: string): Promise<ScanResult> {
		const result: ScanResult = { discovered: 0, registered: 0, skipped: 0, errors: [] };

		try {
			const seriesData = await db.query.series.findFirst({
				where: eq(series.id, seriesId)
			});

			if (!seriesData) {
				result.errors.push(`Series not found: ${seriesId}`);
				return result;
			}

			if (!seriesData.rootFolderId) {
				result.errors.push(`Series has no root folder: ${seriesId}`);
				return result;
			}

			const rootFolder = await db.query.rootFolders.findFirst({
				where: eq(rootFolders.id, seriesData.rootFolderId)
			});

			if (!rootFolder) {
				result.errors.push(`Root folder not found`);
				return result;
			}

			const seriesPath = join(rootFolder.path, seriesData.path);
			const discovered = await this.discoverSubtitles(seriesPath, seriesPath);
			result.discovered = discovered.length;

			// Get all episode files to match subtitles
			const epFiles = await db
				.select()
				.from(episodeFiles)
				.where(eq(episodeFiles.seriesId, seriesId));

			for (const sub of discovered) {
				try {
					// Try to match to an episode based on path proximity
					let matchedEpisodeId: string | undefined;

					// Check if subtitle is in the same directory as an episode file
					const subDir = dirname(sub.relativePath);
					for (const epFile of epFiles) {
						const epDir = dirname(epFile.relativePath);
						if (subDir === epDir || sub.relativePath.startsWith(epDir + '/')) {
							// Find the episode ID
							if (epFile.episodeIds && epFile.episodeIds.length > 0) {
								matchedEpisodeId = epFile.episodeIds[0];
								break;
							}
						}
					}

					if (!matchedEpisodeId) {
						// Try to match by filename similarity
						if (sub.videoFileName) {
							for (const epFile of epFiles) {
								const epBaseName = basename(epFile.relativePath, extname(epFile.relativePath));
								if (epBaseName.toLowerCase().includes(sub.videoFileName.toLowerCase())) {
									if (epFile.episodeIds && epFile.episodeIds.length > 0) {
										matchedEpisodeId = epFile.episodeIds[0];
										break;
									}
								}
							}
						}
					}

					if (!matchedEpisodeId) {
						result.skipped++;
						continue;
					}

					// Check if already registered
					const existing = await db.query.subtitles.findFirst({
						where: and(
							eq(subtitles.episodeId, matchedEpisodeId),
							eq(subtitles.relativePath, sub.relativePath)
						)
					});

					if (existing) {
						result.skipped++;
						continue;
					}

					// Register the subtitle
					await db.insert(subtitles).values({
						id: uuidv4(),
						episodeId: matchedEpisodeId,
						relativePath: sub.relativePath,
						language: sub.language,
						isForced: sub.isForced,
						isHearingImpaired: sub.isHearingImpaired,
						format: sub.format,
						size: sub.size,
						dateAdded: new Date().toISOString()
					});

					// Record in history
					await db.insert(subtitleHistory).values({
						id: uuidv4(),
						episodeId: matchedEpisodeId,
						action: 'discovered',
						language: sub.language,
						createdAt: new Date().toISOString()
					});

					result.registered++;
				} catch (error) {
					result.errors.push(
						`Error registering ${sub.relativePath}: ${error instanceof Error ? error.message : 'Unknown error'}`
					);
				}
			}
		} catch (error) {
			result.errors.push(error instanceof Error ? error.message : 'Unknown error');
		}

		return result;
	}

	/**
	 * Scan all movies and series for subtitles
	 */
	async scanAll(): Promise<{ movies: ScanResult; series: ScanResult }> {
		const movieResults: ScanResult = { discovered: 0, registered: 0, skipped: 0, errors: [] };
		const seriesResults: ScanResult = { discovered: 0, registered: 0, skipped: 0, errors: [] };

		// Scan all movies
		const allMovies = await db.select({ id: movies.id }).from(movies);
		for (const movie of allMovies) {
			const result = await this.scanMovieSubtitles(movie.id);
			movieResults.discovered += result.discovered;
			movieResults.registered += result.registered;
			movieResults.skipped += result.skipped;
			movieResults.errors.push(...result.errors);
		}

		// Scan all series
		const allSeries = await db.select({ id: series.id }).from(series);
		for (const show of allSeries) {
			const result = await this.scanSeriesSubtitles(show.id);
			seriesResults.discovered += result.discovered;
			seriesResults.registered += result.registered;
			seriesResults.skipped += result.skipped;
			seriesResults.errors.push(...result.errors);
		}

		return { movies: movieResults, series: seriesResults };
	}
}

export function getSubtitleScannerService(): SubtitleScannerService {
	return SubtitleScannerService.getInstance();
}

export { SubtitleScannerService };
