#!/usr/bin/env npx tsx
/**
 * Naming System Dry-Run Test Script
 *
 * Tests the naming/renaming system against actual media files without making changes.
 * Tests all built-in presets (Plex, Jellyfin, Emby, Kodi, Minimal) and compares results.
 *
 * Usage:
 *   npx tsx scripts/test-naming-dryrun.ts [options]
 *
 * Options:
 *   --movies           Test only movies (default: both)
 *   --episodes         Test only episodes (default: both)
 *   --limit N          Limit output to N items per category (default: 10)
 *   --preset ID        Test specific preset only (plex, jellyfin, emby, kodi, minimal)
 *   --all-presets      Test all presets and compare (default)
 *   --verbose          Show all files including already-correct
 *   --changes-only     Only show files that would change (default)
 */

import { db } from '../src/lib/server/db/index.js';
import { movies, movieFiles, series, episodes, episodeFiles } from '../src/lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import {
	NamingService,
	type MediaNamingInfo
} from '../src/lib/server/library/naming/NamingService.js';
import {
	BUILT_IN_PRESETS,
	getBuiltInPreset,
	type NamingPreset
} from '../src/lib/server/library/naming/presets.js';
import { ReleaseParser } from '../src/lib/server/indexers/parser/ReleaseParser.js';
import { extname, basename, join, dirname } from 'path';

// ANSI colors for terminal output
const colors = {
	reset: '\x1b[0m',
	bright: '\x1b[1m',
	dim: '\x1b[2m',
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	magenta: '\x1b[35m',
	cyan: '\x1b[36m',
	white: '\x1b[37m'
};

interface PreviewItem {
	fileId: string;
	mediaType: 'movie' | 'episode';
	mediaTitle: string;
	currentPath: string;
	newPath: string;
	status: 'will_change' | 'already_correct' | 'collision' | 'error';
	error?: string;
}

interface PresetResult {
	presetId: string;
	presetName: string;
	movies: {
		total: number;
		willChange: number;
		alreadyCorrect: number;
		collisions: number;
		errors: number;
		items: PreviewItem[];
	};
	episodes: {
		total: number;
		willChange: number;
		alreadyCorrect: number;
		collisions: number;
		errors: number;
		items: PreviewItem[];
	};
}

function formatAudioChannels(channels?: number): string | undefined {
	if (!channels) return undefined;
	const channelMap: Record<number, string> = { 1: '1.0', 2: '2.0', 6: '5.1', 8: '7.1' };
	return channelMap[channels] || `${channels}.0`;
}

function parseFilenameForQuality(filename: string) {
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

async function testPreset(
	preset: NamingPreset,
	options: { moviesOnly: boolean; episodesOnly: boolean; limit: number; verbose: boolean }
): Promise<PresetResult> {
	const namingService = new NamingService(preset.config);

	const result: PresetResult = {
		presetId: preset.id,
		presetName: preset.name,
		movies: { total: 0, willChange: 0, alreadyCorrect: 0, collisions: 0, errors: 0, items: [] },
		episodes: { total: 0, willChange: 0, alreadyCorrect: 0, collisions: 0, errors: 0, items: [] }
	};

	// Test movies
	if (!options.episodesOnly) {
		const allMovies = db.select().from(movies).all();

		for (const movie of allMovies) {
			const files = db.select().from(movieFiles).where(eq(movieFiles.movieId, movie.id)).all();

			for (const file of files) {
				result.movies.total++;

				try {
					const currentFileName = basename(file.relativePath);
					const parsedFromFilename = parseFilenameForQuality(currentFileName);

					const namingInfo: MediaNamingInfo = {
						title: movie.title,
						year: movie.year ?? undefined,
						tmdbId: movie.tmdbId,
						imdbId: movie.imdbId ?? undefined,
						edition: file.edition ?? undefined,
						resolution: file.quality?.resolution ?? parsedFromFilename.resolution,
						source: file.quality?.source ?? parsedFromFilename.source,
						codec: file.quality?.codec ?? parsedFromFilename.codec ?? file.mediaInfo?.videoCodec,
						hdr: file.quality?.hdr ?? parsedFromFilename.hdr ?? file.mediaInfo?.videoHdrFormat,
						bitDepth: file.mediaInfo?.videoBitDepth?.toString(),
						audioCodec: file.mediaInfo?.audioCodec ?? parsedFromFilename.audioCodec,
						audioChannels:
							formatAudioChannels(file.mediaInfo?.audioChannels) ??
							parsedFromFilename.audioChannels,
						releaseGroup: file.releaseGroup ?? parsedFromFilename.releaseGroup,
						originalExtension: extname(file.relativePath)
					};

					const newFileName = namingService.generateMovieFileName(namingInfo);

					const item: PreviewItem = {
						fileId: file.id,
						mediaType: 'movie',
						mediaTitle: movie.title,
						currentPath: currentFileName,
						newPath: newFileName,
						status: currentFileName === newFileName ? 'already_correct' : 'will_change'
					};

					if (item.status === 'will_change') {
						result.movies.willChange++;
					} else {
						result.movies.alreadyCorrect++;
					}

					result.movies.items.push(item);
				} catch (error) {
					result.movies.errors++;
					result.movies.items.push({
						fileId: file.id,
						mediaType: 'movie',
						mediaTitle: movie.title,
						currentPath: file.relativePath,
						newPath: file.relativePath,
						status: 'error',
						error: error instanceof Error ? error.message : String(error)
					});
				}
			}
		}

		// Detect collisions
		const moviePaths = new Map<string, PreviewItem[]>();
		for (const item of result.movies.items) {
			if (item.status === 'will_change') {
				const existing = moviePaths.get(item.newPath) || [];
				existing.push(item);
				moviePaths.set(item.newPath, existing);
			}
		}
		for (const [, items] of moviePaths) {
			if (items.length > 1) {
				for (const item of items) {
					item.status = 'collision';
					result.movies.willChange--;
					result.movies.collisions++;
				}
			}
		}
	}

	// Test episodes
	if (!options.moviesOnly) {
		const allSeries = db.select().from(series).all();

		for (const show of allSeries) {
			const files = db.select().from(episodeFiles).where(eq(episodeFiles.seriesId, show.id)).all();
			const allEpisodes = db.select().from(episodes).where(eq(episodes.seriesId, show.id)).all();
			const episodeMap = new Map(allEpisodes.map((ep) => [ep.id, ep]));

			for (const file of files) {
				result.episodes.total++;

				try {
					const currentFileName = basename(file.relativePath);
					const parsedFromFilename = parseFilenameForQuality(currentFileName);

					const episodeIds = file.episodeIds || [];
					const fileEpisodes = episodeIds
						.map((id) => episodeMap.get(id))
						.filter((ep): ep is (typeof allEpisodes)[0] => ep !== undefined)
						.sort((a, b) => a.episodeNumber - b.episodeNumber);

					if (fileEpisodes.length === 0) {
						throw new Error('No episode data found');
					}

					const firstEpisode = fileEpisodes[0];
					const episodeNumbers = fileEpisodes.map((ep) => ep.episodeNumber);
					const isAnime = show.seriesType === 'anime';
					const isDaily = show.seriesType === 'daily';

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
						resolution: file.quality?.resolution ?? parsedFromFilename.resolution,
						source: file.quality?.source ?? parsedFromFilename.source,
						codec: file.quality?.codec ?? parsedFromFilename.codec ?? file.mediaInfo?.videoCodec,
						hdr: file.quality?.hdr ?? parsedFromFilename.hdr ?? file.mediaInfo?.videoHdrFormat,
						bitDepth: file.mediaInfo?.videoBitDepth?.toString(),
						audioCodec: file.mediaInfo?.audioCodec ?? parsedFromFilename.audioCodec,
						audioChannels:
							formatAudioChannels(file.mediaInfo?.audioChannels) ??
							parsedFromFilename.audioChannels,
						releaseGroup: file.releaseGroup ?? parsedFromFilename.releaseGroup,
						originalExtension: extname(file.relativePath)
					};

					const newFileName = namingService.generateEpisodeFileName(namingInfo);
					const useSeasonFolders = show.seasonFolder ?? true;
					let newRelativePath: string;

					if (useSeasonFolders) {
						const seasonFolder = namingService.generateSeasonFolderName(file.seasonNumber);
						newRelativePath = join(seasonFolder, newFileName);
					} else {
						newRelativePath = newFileName;
					}

					const item: PreviewItem = {
						fileId: file.id,
						mediaType: 'episode',
						mediaTitle: `${show.title} S${String(file.seasonNumber).padStart(2, '0')}E${String(episodeNumbers[0]).padStart(2, '0')}`,
						currentPath: file.relativePath,
						newPath: newRelativePath,
						status: file.relativePath === newRelativePath ? 'already_correct' : 'will_change'
					};

					if (item.status === 'will_change') {
						result.episodes.willChange++;
					} else {
						result.episodes.alreadyCorrect++;
					}

					result.episodes.items.push(item);
				} catch (error) {
					result.episodes.errors++;
					result.episodes.items.push({
						fileId: file.id,
						mediaType: 'episode',
						mediaTitle: show.title,
						currentPath: file.relativePath,
						newPath: file.relativePath,
						status: 'error',
						error: error instanceof Error ? error.message : String(error)
					});
				}
			}
		}

		// Detect collisions
		const episodePaths = new Map<string, PreviewItem[]>();
		for (const item of result.episodes.items) {
			if (item.status === 'will_change') {
				const existing = episodePaths.get(item.newPath) || [];
				existing.push(item);
				episodePaths.set(item.newPath, existing);
			}
		}
		for (const [, items] of episodePaths) {
			if (items.length > 1) {
				for (const item of items) {
					item.status = 'collision';
					result.episodes.willChange--;
					result.episodes.collisions++;
				}
			}
		}
	}

	return result;
}

function printPresetResult(result: PresetResult, options: { verbose: boolean; limit: number }) {
	console.log(
		`\n${colors.bright}${colors.cyan}=== Preset: ${result.presetName} (${result.presetId}) ===${colors.reset}\n`
	);

	// Movies summary
	if (result.movies.total > 0) {
		console.log(`${colors.bright}Movies:${colors.reset}`);
		console.log(`  Total: ${result.movies.total}`);
		console.log(`  ${colors.green}Already correct: ${result.movies.alreadyCorrect}${colors.reset}`);
		console.log(`  ${colors.yellow}Will change: ${result.movies.willChange}${colors.reset}`);
		if (result.movies.collisions > 0) {
			console.log(`  ${colors.red}Collisions: ${result.movies.collisions}${colors.reset}`);
		}
		if (result.movies.errors > 0) {
			console.log(`  ${colors.red}Errors: ${result.movies.errors}${colors.reset}`);
		}

		// Show changes
		const movieChanges = result.movies.items.filter((i) => i.status === 'will_change');
		if (movieChanges.length > 0) {
			console.log(`\n  ${colors.bright}Changes:${colors.reset}`);
			for (const item of movieChanges.slice(0, options.limit)) {
				console.log(`    ${colors.dim}${item.mediaTitle}${colors.reset}`);
				console.log(`      ${colors.red}${item.currentPath}${colors.reset}`);
				console.log(`      ${colors.green}${item.newPath}${colors.reset}`);
			}
			if (movieChanges.length > options.limit) {
				console.log(
					`    ${colors.dim}... and ${movieChanges.length - options.limit} more${colors.reset}`
				);
			}
		}

		// Show collisions
		const movieCollisions = result.movies.items.filter((i) => i.status === 'collision');
		if (movieCollisions.length > 0) {
			console.log(`\n  ${colors.bright}${colors.red}Collisions:${colors.reset}`);
			for (const item of movieCollisions.slice(0, 5)) {
				console.log(`    ${colors.yellow}${item.mediaTitle}: ${item.newPath}${colors.reset}`);
			}
		}

		// Show errors
		const movieErrors = result.movies.items.filter((i) => i.status === 'error');
		if (movieErrors.length > 0) {
			console.log(`\n  ${colors.bright}${colors.red}Errors:${colors.reset}`);
			for (const item of movieErrors.slice(0, 5)) {
				console.log(`    ${item.mediaTitle}: ${item.error}`);
			}
		}
	}

	// Episodes summary
	if (result.episodes.total > 0) {
		console.log(`\n${colors.bright}Episodes:${colors.reset}`);
		console.log(`  Total: ${result.episodes.total}`);
		console.log(
			`  ${colors.green}Already correct: ${result.episodes.alreadyCorrect}${colors.reset}`
		);
		console.log(`  ${colors.yellow}Will change: ${result.episodes.willChange}${colors.reset}`);
		if (result.episodes.collisions > 0) {
			console.log(`  ${colors.red}Collisions: ${result.episodes.collisions}${colors.reset}`);
		}
		if (result.episodes.errors > 0) {
			console.log(`  ${colors.red}Errors: ${result.episodes.errors}${colors.reset}`);
		}

		// Show changes
		const episodeChanges = result.episodes.items.filter((i) => i.status === 'will_change');
		if (episodeChanges.length > 0) {
			console.log(`\n  ${colors.bright}Changes:${colors.reset}`);
			for (const item of episodeChanges.slice(0, options.limit)) {
				console.log(`    ${colors.dim}${item.mediaTitle}${colors.reset}`);
				console.log(`      ${colors.red}${item.currentPath}${colors.reset}`);
				console.log(`      ${colors.green}${item.newPath}${colors.reset}`);
			}
			if (episodeChanges.length > options.limit) {
				console.log(
					`    ${colors.dim}... and ${episodeChanges.length - options.limit} more${colors.reset}`
				);
			}
		}

		// Show collisions
		const episodeCollisions = result.episodes.items.filter((i) => i.status === 'collision');
		if (episodeCollisions.length > 0) {
			console.log(`\n  ${colors.bright}${colors.red}Collisions:${colors.reset}`);
			for (const item of episodeCollisions.slice(0, 5)) {
				console.log(`    ${colors.yellow}${item.mediaTitle}: ${item.newPath}${colors.reset}`);
			}
		}
	}
}

function printSummaryTable(results: PresetResult[]) {
	console.log(
		`\n${colors.bright}${colors.cyan}╔══════════════════════════════════════════════════════════════════════════════╗${colors.reset}`
	);
	console.log(
		`${colors.bright}${colors.cyan}║                              SUMMARY                                         ║${colors.reset}`
	);
	console.log(
		`${colors.bright}${colors.cyan}╚══════════════════════════════════════════════════════════════════════════════╝${colors.reset}\n`
	);

	// Table header
	console.log(
		`${colors.bright}Preset       │ Movies Changed │ Episodes Changed │ Collisions │ Errors${colors.reset}`
	);
	console.log(`─────────────┼────────────────┼──────────────────┼────────────┼────────`);

	for (const result of results) {
		const presetName = result.presetName.padEnd(12);
		const moviesChanged = String(result.movies.willChange).padStart(14);
		const episodesChanged = String(result.episodes.willChange).padStart(16);
		const collisions = String(result.movies.collisions + result.episodes.collisions).padStart(10);
		const errors = String(result.movies.errors + result.episodes.errors).padStart(6);

		console.log(`${presetName} │${moviesChanged} │${episodesChanged} │${collisions} │${errors}`);
	}

	console.log();
}

async function main() {
	const args = process.argv.slice(2);
	const options = {
		moviesOnly: args.includes('--movies'),
		episodesOnly: args.includes('--episodes'),
		limit: parseInt(args.find((a, i) => args[i - 1] === '--limit') || '10'),
		presetId: args.find((a, i) => args[i - 1] === '--preset'),
		verbose: args.includes('--verbose')
	};

	console.log(
		`${colors.bright}${colors.cyan}╔══════════════════════════════════════════════════════════════════════════════╗${colors.reset}`
	);
	console.log(
		`${colors.bright}${colors.cyan}║                    NAMING SYSTEM DRY-RUN TEST                                ║${colors.reset}`
	);
	console.log(
		`${colors.bright}${colors.cyan}╚══════════════════════════════════════════════════════════════════════════════╝${colors.reset}\n`
	);

	console.log(`${colors.dim}This is a dry-run - no files will be modified.${colors.reset}\n`);

	// Determine which presets to test
	let presetsToTest: NamingPreset[];

	if (options.presetId) {
		const preset = getBuiltInPreset(options.presetId);
		if (!preset) {
			console.log(`${colors.red}Unknown preset: ${options.presetId}${colors.reset}`);
			console.log(`Available presets: ${BUILT_IN_PRESETS.map((p) => p.id).join(', ')}`);
			process.exit(1);
		}
		presetsToTest = [preset];
	} else {
		presetsToTest = BUILT_IN_PRESETS;
	}

	console.log(
		`${colors.bright}Testing presets:${colors.reset} ${presetsToTest.map((p) => p.name).join(', ')}\n`
	);

	const results: PresetResult[] = [];

	for (const preset of presetsToTest) {
		console.log(`${colors.cyan}Testing ${preset.name}...${colors.reset}`);
		const result = await testPreset(preset, options);
		results.push(result);
		printPresetResult(result, options);
	}

	// Print summary table if multiple presets
	if (results.length > 1) {
		printSummaryTable(results);
	}

	console.log(`${colors.green}Dry-run complete. No files were modified.${colors.reset}\n`);
}

// Run
main().catch((error) => {
	console.error(`${colors.red}Fatal error:${colors.reset}`, error);
	process.exit(1);
});
