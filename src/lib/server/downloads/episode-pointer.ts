import parseTorrent from 'parse-torrent';

export interface EpisodePointerTarget {
	season?: number;
	episode: number;
	token: string;
}

export interface EpisodePointerFileSelection {
	fileIndices: number[];
	allFileIndices: number[];
	filePaths: string[];
}

interface TorrentFileEntry {
	index: number;
	path: string;
}

const EPISODE_POINTER_TITLE_REGEX = /\[Episode Pointer\s+((?:S\d{2})?E\d{2})\]/i;
const EPISODE_POINTER_GUID_REGEX = /::episode-pointer::((?:s\d{2})?e\d{2})$/i;
const HUMAN_EPISODE_POINTER_REGEX = /^Season\s+(\d{1,2})\s+Episode\s+(\d{1,2})\s*-\s*/i;
const HUMAN_EPISODE_ONLY_POINTER_REGEX = /^Episode\s+(\d{1,2})\s*-\s*/i;
const MEDIA_EXTENSIONS = new Set([
	'mkv',
	'mp4',
	'avi',
	'mov',
	'm4v',
	'ts',
	'm2ts',
	'wmv',
	'flv',
	'webm',
	'srt',
	'ass',
	'ssa',
	'vtt',
	'sub'
]);

function normalizePath(value: string): string {
	return value.replace(/\\/g, '/').trim();
}

function getExtension(value: string): string {
	const dotIndex = value.lastIndexOf('.');
	if (dotIndex <= 0 || dotIndex >= value.length - 1) {
		return '';
	}
	return value.slice(dotIndex + 1).toLowerCase();
}

function parsePointerToken(rawToken: string): EpisodePointerTarget | null {
	const normalized = rawToken.trim().toUpperCase();
	const seasonEpisode = normalized.match(/^S(\d{2})E(\d{2})$/);
	if (seasonEpisode) {
		return {
			season: parseInt(seasonEpisode[1], 10),
			episode: parseInt(seasonEpisode[2], 10),
			token: `S${seasonEpisode[1]}E${seasonEpisode[2]}`
		};
	}

	const episodeOnly = normalized.match(/^E(\d{2})$/);
	if (!episodeOnly) {
		return null;
	}

	return {
		episode: parseInt(episodeOnly[1], 10),
		token: `E${episodeOnly[1]}`
	};
}

function detectSeasonFromPath(path: string): number | undefined {
	const normalized = path.toLowerCase();
	const seasonMatches = [
		normalized.match(/(?:^|[^a-z0-9])s(?:eason)?\s*0?(\d{1,2})(?:[^a-z0-9]|$)/i),
		normalized.match(/(?:^|[^a-z0-9])season[\s._-]*0?(\d{1,2})(?:[^a-z0-9]|$)/i)
	];

	for (const match of seasonMatches) {
		if (match?.[1]) {
			return parseInt(match[1], 10);
		}
	}

	return undefined;
}

function includesEpisodeToken(path: string, season: number | undefined, episode: number): boolean {
	const normalized = path.toLowerCase();
	const episodePadded = String(episode).padStart(2, '0');

	if (season !== undefined) {
		const seasonPadded = String(season).padStart(2, '0');
		const seasonPatterns = [
			new RegExp(`(?:^|[^a-z0-9])s0?${season}[^a-z0-9]?e0?${episode}(?:[^a-z0-9]|$)`, 'i'),
			new RegExp(`(?:^|[^a-z0-9])s${seasonPadded}[^a-z0-9]*e${episodePadded}(?:[^a-z0-9]|$)`, 'i'),
			new RegExp(`(?:^|[^a-z0-9])${season}x0?${episode}(?:[^a-z0-9]|$)`, 'i'),
			new RegExp(`(?:^|[^a-z0-9])${seasonPadded}x${episodePadded}(?:[^a-z0-9]|$)`, 'i')
		];

		if (seasonPatterns.some((pattern) => pattern.test(normalized))) {
			return true;
		}
	}

	const episodePatterns = [
		new RegExp(`(?:^|[^a-z0-9])e(?:p(?:isode)?)?\\s*0?${episode}(?:[^a-z0-9]|$)`, 'i'),
		new RegExp(`(?:^|[^a-z0-9])${episodePadded}(?:[^a-z0-9]|$)`, 'i')
	];

	return episodePatterns.some((pattern) => pattern.test(normalized));
}

function matchEpisodeFiles(
	files: TorrentFileEntry[],
	target: EpisodePointerTarget
): EpisodePointerFileSelection {
	const mediaFiles = files.filter((file) => MEDIA_EXTENSIONS.has(getExtension(file.path)));
	const include = new Map<number, string>();

	for (const file of mediaFiles) {
		const normalizedPath = normalizePath(file.path);
		const hasToken = includesEpisodeToken(normalizedPath, target.season, target.episode);
		if (!hasToken) {
			continue;
		}

		if (target.season !== undefined) {
			const detectedSeason = detectSeasonFromPath(normalizedPath);
			if (detectedSeason !== undefined && detectedSeason !== target.season) {
				continue;
			}
		}

		include.set(file.index, normalizedPath);
	}

	// Fallback: episode number in filename with matching season folder.
	if (include.size === 0 && target.season !== undefined) {
		for (const file of mediaFiles) {
			const normalizedPath = normalizePath(file.path);
			const detectedSeason = detectSeasonFromPath(normalizedPath);
			if (detectedSeason !== target.season) {
				continue;
			}

			const segments = normalizedPath.split('/');
			const fileName = segments[segments.length - 1] || '';
			const firstNumber = fileName.match(/^(?:[^0-9]*)(\d{1,2})(?:[^0-9]|$)/);
			if (!firstNumber) {
				continue;
			}
			if (parseInt(firstNumber[1], 10) !== target.episode) {
				continue;
			}

			include.set(file.index, normalizedPath);
		}
	}

	return {
		fileIndices: Array.from(include.keys()).sort((a, b) => a - b),
		allFileIndices: files.map((file) => file.index),
		filePaths: Array.from(include.values())
	};
}

export function buildEpisodePointerFileSelectionFromPaths(
	paths: string[],
	target: EpisodePointerTarget
): EpisodePointerFileSelection {
	const files: TorrentFileEntry[] = paths
		.map((path, index) => ({ index, path: normalizePath(path) }))
		.filter((file) => file.path.length > 0);

	return matchEpisodeFiles(files, target);
}

export function parseEpisodePointerFromTitle(
	title: string | undefined
): EpisodePointerTarget | null {
	if (!title) {
		return null;
	}

	const humanMatch = title.match(HUMAN_EPISODE_POINTER_REGEX);
	if (humanMatch?.[1] && humanMatch?.[2]) {
		const season = parseInt(humanMatch[1], 10);
		const episode = parseInt(humanMatch[2], 10);
		return {
			season,
			episode,
			token: `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
		};
	}

	const episodeOnlyMatch = title.match(HUMAN_EPISODE_ONLY_POINTER_REGEX);
	if (episodeOnlyMatch?.[1]) {
		const episode = parseInt(episodeOnlyMatch[1], 10);
		return {
			episode,
			token: `E${String(episode).padStart(2, '0')}`
		};
	}

	const match = title.match(EPISODE_POINTER_TITLE_REGEX);
	if (!match?.[1]) {
		return null;
	}

	return parsePointerToken(match[1]);
}

export function parseEpisodePointerFromGuid(guid: string | undefined): EpisodePointerTarget | null {
	if (!guid) {
		return null;
	}

	const match = guid.match(EPISODE_POINTER_GUID_REGEX);
	if (!match?.[1]) {
		return null;
	}

	return parsePointerToken(match[1]);
}

export async function buildEpisodePointerFileSelection(
	torrentFile: Buffer,
	target: EpisodePointerTarget
): Promise<EpisodePointerFileSelection> {
	const parsed = await parseTorrent(Buffer.from(torrentFile));
	if (
		!parsed ||
		!('files' in parsed) ||
		!Array.isArray(parsed.files) ||
		parsed.files.length === 0
	) {
		return { fileIndices: [], allFileIndices: [], filePaths: [] };
	}

	const parsedFiles = parsed.files as Array<{ path?: string; name?: string }>;
	const files: TorrentFileEntry[] = parsedFiles
		.map((file, index) => ({
			index,
			path: normalizePath(String(file.path || file.name || ''))
		}))
		.filter((file) => file.path.length > 0);

	return matchEpisodeFiles(files, target);
}
