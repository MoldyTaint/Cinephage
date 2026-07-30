/**
 * Pattern Recognition Service
 *
 * Pure-function module implementing three orthogonal pattern families
 * against library-relative paths, inspired by MediaLyze's discovery
 * pipeline (docs/patterns.md):
 *
 *   1. Ignore   - case-sensitive glob, never indexed
 *   2. Bonus    - case-insensitive glob, indexed as content_category='bonus'
 *   3. Structure - folder-depth or regex, extracts series/season/episode
 *
 * Callers precompute a CompiledPatterns object via compilePatterns()
 * from DB-backed config, then pass it to the streaming scanner which
 * calls matchIgnore() / classifyFile() / recognizeStructure() per file.
 *
 * Glob rules (MediaLyze docs/patterns.md §8):
 *   - `* ? [seq] [!seq]` shell-style glob via minimatch
 *   - Matched against normalized library-relative paths (always `/`
 *     separators, no leading slash)
 *   - Ignore = case-sensitive; Bonus = case-insensitive
 *   - Directories tested with AND without trailing slash; leading `/`
 *     optional
 *   - Bonus folder names auto-seed four glob variants
 */

import { Minimatch } from 'minimatch';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContentCategory = 'main' | 'bonus';

export interface IgnorePatterns {
	defaultEnabled: boolean;
	defaults: string[];
	user: string[];
}

export interface BonusPatterns {
	patterns: string[];
}

export type StructureMode = 'folder_depth' | 'regex';

export interface StructureSettings {
	mode: StructureMode;
	seriesFolderDepth?: number;
	seasonFolderDepth?: number;
	seriesFolderRegexes?: string[];
	seasonFolderRegexes?: string[];
	episodeFileRegexes?: string[];
}

export interface PatternConfig {
	ignore: IgnorePatterns;
	bonus: BonusPatterns;
	structure: StructureSettings | null;
}

export interface CompiledPatterns {
	ignore: {
		defaultEnabled: boolean;
		defaultMatchers: Minimatch[];
		userMatchers: Minimatch[];
	};
	bonus: Minimatch[];
	structure: {
		settings: StructureSettings;
		seriesMatchers: RegExp[];
		seasonMatchers: RegExp[];
		episodeMatchers: RegExp[];
	} | null;
}

export interface StructureMatch {
	seriesTitle?: string;
	year?: number;
	season?: number;
	episode?: number;
	isBonus: boolean;
}

// ---------------------------------------------------------------------------
// Defaults (seeded into the DB on first run)
// ---------------------------------------------------------------------------

export const DEFAULT_IGNORE_PATTERNS: string[] = [
	'**/.DS_Store',
	'**/._*',
	'**/@eaDir/**',
	'**/#recycle/**',
	'**/.deletedByTMM/**',
	'**/$RECYCLE.BIN/**',
	'*.part',
	'*.tmp',
	'**/thumbs.db',
	'**/.git/**',
	'**/.svn/**',
	'**/__pycache__/**',
	'**/node_modules/**',
	'**/lost+found/**',
	'**/System Volume Information/**'
];

export const DEFAULT_BONUS_FOLDER_NAMES: string[] = [
	'Behind the Scenes',
	'Deleted Scenes',
	'Interviews',
	'Specials',
	'Season 00',
	'Extras',
	'Trailers',
	'Featurettes',
	'Other'
];

export const DEFAULT_BONUS_FILE_PATTERNS: string[] = [
	'*/Featurettes/*',
	'*/Trailers/*',
	'*trailer*',
	'*teaser*',
	'*promo*',
	'*featurette*',
	'*behind the scenes*',
	'*deleted scenes*',
	'*interview*',
	'*sample*',
	'*bonus*'
];

// ---------------------------------------------------------------------------
// Path normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a library-relative path for pattern matching:
 * - Replace backslashes with forward slashes
 * - Strip leading slash
 * - Collapse duplicate slashes
 */
export function normalizeRelativePath(relPath: string): string {
	let p = relPath.replace(/\\/g, '/');
	if (p.startsWith('/')) p = p.slice(1);
	p = p.replace(/\/+/g, '/');
	return p;
}

// ---------------------------------------------------------------------------
// Bonus variant expansion
// ---------------------------------------------------------------------------

/**
 * Expand a bonus folder name into four glob variants so it matches
 * regardless of where in the path the folder appears.
 * Variants: Name/ (root), Name/star (root contents),
 *           star/Name/ (nested), star/Name/star (nested contents)
 */
export function expandBonusFolderName(name: string): string[] {
	return [`/${name}/`, `/${name}/*`, `*/${name}/`, `*/${name}/*`];
}

/**
 * Build the full bonus pattern list from configured folder names +
 * file-token patterns. Folder names are expanded into four variants;
 * file-token patterns are used as-is.
 */
export function buildBonusPatterns(folderNames: string[], filePatterns: string[]): string[] {
	const fromFolders = folderNames.flatMap(expandBonusFolderName);
	return [...fromFolders, ...filePatterns];
}

// ---------------------------------------------------------------------------
// Compile (precompute matchers for performance)
// ---------------------------------------------------------------------------

export function compilePatterns(config: PatternConfig): CompiledPatterns {
	const defaultMatchers = config.ignore.defaultEnabled
		? config.ignore.defaults.map(
				(p) => new Minimatch(p, { nocase: false, dot: true, matchBase: true })
			)
		: [];
	const userMatchers = config.ignore.user.map(
		(p) => new Minimatch(p, { nocase: false, dot: true, matchBase: true })
	);

	// Bonus patterns are case-insensitive.
	const bonus = config.bonus.patterns.map(
		(p) => new Minimatch(p, { nocase: true, dot: true, matchBase: true })
	);

	let structure: CompiledPatterns['structure'] = null;
	if (config.structure) {
		structure = {
			settings: config.structure,
			seriesMatchers: compileRegexes(config.structure.seriesFolderRegexes),
			seasonMatchers: compileRegexes(config.structure.seasonFolderRegexes),
			episodeMatchers: compileRegexes(config.structure.episodeFileRegexes)
		};
	}

	return {
		ignore: { defaultEnabled: config.ignore.defaultEnabled, defaultMatchers, userMatchers },
		bonus,
		structure
	};
}

function compileRegexes(patterns?: string[]): RegExp[] {
	if (!patterns) return [];
	const out: RegExp[] = [];
	for (const p of patterns) {
		try {
			// Support both Python (?P<name>) and JS (?<name>) named-group syntax
			const jsPattern = p.replace(/\(\?P</g, '(?<');
			out.push(new RegExp(jsPattern, 'i'));
		} catch {
			// Skip invalid regex silently
		}
	}
	return out;
}

// ---------------------------------------------------------------------------
// Match: Ignore (case-sensitive glob)
// ---------------------------------------------------------------------------

/**
 * Returns true if the path matches any ignore pattern (default or user).
 * Directories are tested with and without a trailing slash so that a
 * pattern like star/.git/star matches both `.git/config` and `.git/`.
 */
export function matchIgnore(relPath: string, compiled: CompiledPatterns): boolean {
	const normalized = normalizeRelativePath(relPath);
	const candidates = withTrailingSlashVariants(normalized);

	for (const matcher of compiled.ignore.defaultMatchers) {
		if (candidates.some((c) => matcher.match(c))) return true;
	}
	for (const matcher of compiled.ignore.userMatchers) {
		if (candidates.some((c) => matcher.match(c))) return true;
	}
	return false;
}

// ---------------------------------------------------------------------------
// Match: Bonus (case-insensitive glob)
// ---------------------------------------------------------------------------

export function matchBonus(relPath: string, compiled: CompiledPatterns): boolean {
	const normalized = normalizeRelativePath(relPath);
	const candidates = withTrailingSlashVariants(normalized);

	for (const matcher of compiled.bonus) {
		if (candidates.some((c) => matcher.match(c))) return true;
	}
	return false;
}

// ---------------------------------------------------------------------------
// Classify (ignore wins over bonus wins over main)
// ---------------------------------------------------------------------------

/**
 * Classify a file. Returns:
 *   - null     if the file should be ignored (never indexed)
 *   - 'bonus'  if the file matches a bonus pattern
 *   - 'main'   otherwise
 *
 * Ignore takes precedence: a file matching both ignore and bonus is
 * ignored, not bonus-classified.
 */
export function classifyFile(relPath: string, compiled: CompiledPatterns): ContentCategory | null {
	if (matchIgnore(relPath, compiled)) return null;
	if (matchBonus(relPath, compiled)) return 'bonus';
	return 'main';
}

// ---------------------------------------------------------------------------
// Structure recognition (series/season/episode)
// ---------------------------------------------------------------------------

/**
 * Attempt to extract series/season/episode structure from a relative
 * path. Returns null for movie libraries (structure settings null) or
 * when nothing could be parsed.
 *
 * Modes:
 *   - folder_depth: path segments at declared depths identify series +
 *     season folders
 *   - regex: named-group regexes match against each path segment
 */
export function recognizeStructure(
	relPath: string,
	compiled: CompiledPatterns
): StructureMatch | null {
	if (!compiled.structure) return null;

	const normalized = normalizeRelativePath(relPath);
	const segments = normalized.split('/').filter((s) => s.length > 0);

	if (compiled.structure.settings.mode === 'folder_depth') {
		return recognizeByFolderDepth(segments, compiled.structure);
	}
	return recognizeByRegex(segments, compiled.structure);
}

function recognizeByFolderDepth(
	segments: string[],
	structure: NonNullable<CompiledPatterns['structure']>
): StructureMatch | null {
	const seriesDepth = structure.settings.seriesFolderDepth ?? 0;
	const seasonDepth = structure.settings.seasonFolderDepth ?? 1;

	const seriesFolder = segments[seriesDepth];
	if (!seriesFolder) return null;

	const match: StructureMatch = {
		seriesTitle: cleanFolderName(seriesFolder),
		isBonus: false
	};

	const seasonFolder = segments[seasonDepth];
	if (seasonFolder) {
		const seasonNum = parseSeasonNumber(seasonFolder);
		if (seasonNum !== null) {
			match.season = seasonNum;
			if (seasonNum === 0) match.isBonus = true;
		}
	}

	const fileName = segments[segments.length - 1];
	if (fileName) {
		const epNum = parseEpisodeNumber(fileName);
		if (epNum !== null) match.episode = epNum;
	}

	return match;
}

function recognizeByRegex(
	segments: string[],
	structure: NonNullable<CompiledPatterns['structure']>
): StructureMatch | null {
	const match: StructureMatch = { isBonus: false };

	// Folder segments are all except the last (which is a file)
	const folders = segments.slice(0, -1);
	const fileName = segments[segments.length - 1];

	// Match series folder regexes against folder segments
	for (const segment of folders) {
		for (const re of structure.seriesMatchers) {
			const m = re.exec(segment);
			if (m?.groups) {
				if (m.groups.title && !match.seriesTitle)
					match.seriesTitle = cleanFolderName(m.groups.title);
				if (m.groups.year && !match.year) match.year = parseYear(m.groups.year);
			}
		}
	}

	// Match season folder regexes against folder segments
	for (const segment of folders) {
		for (const re of structure.seasonMatchers) {
			const m = re.exec(segment);
			if (m?.groups?.season) {
				match.season = parseYear(m.groups.season);
				if (match.season === 0) match.isBonus = true;
			}
		}
	}

	// Match episode file regexes against the filename only
	if (fileName) {
		for (const re of structure.episodeMatchers) {
			const m = re.exec(fileName);
			if (m?.groups?.episode) {
				match.episode = parseYear(m.groups.episode);
			}
		}
	}

	return match.seriesTitle ? match : null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate trailing-slash variants of a path so that directory patterns
 * match whether or not the caller included a trailing slash.
 */
function withTrailingSlashVariants(p: string): string[] {
	if (p === '') return [''];
	const withSlash = p.endsWith('/') ? p : p + '/';
	return [p, withSlash];
}

/** Strip trailing slashes, year suffixes, and common noise from a folder name. */
function cleanFolderName(name: string): string {
	return name
		.replace(/\s*\(\d{4}\)\s*$/, '') // trailing (YYYY)
		.replace(/\s*\[\d{4}\]\s*$/, '') // trailing [YYYY]
		.replace(/_+/g, ' ')
		.replace(/\.\.\./g, ' ')
		.trim();
}

function parseSeasonNumber(folderName: string): number | null {
	// "Season 1", "Season 01", "season 3", "S01", "Specials" (=0), "Season 00"
	const lower = folderName.toLowerCase();
	if (lower === 'specials' || lower === 'extras') return 0;
	const seasonMatch = folderName.match(/(?:season|s)\s*(\d{1,3})/i);
	if (seasonMatch) {
		const n = parseInt(seasonMatch[1]!, 10);
		if (!isNaN(n)) return n;
	}
	return null;
}

function parseEpisodeNumber(fileName: string): number | null {
	// S01E02, s1e2, 1x2, E02, Episode 1
	const m = fileName.match(/(?:s\d{1,3}e|x|e(?:\s*)?)\s*(\d{1,3})/i);
	if (m) {
		const n = parseInt(m[1]!, 10);
		if (!isNaN(n)) return n;
	}
	return null;
}

function parseYear(s: string): number {
	const n = parseInt(s, 10);
	return isNaN(n) ? 0 : n;
}
