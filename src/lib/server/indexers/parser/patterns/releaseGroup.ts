/**
 * Release Group Pattern Matching
 *
 * Extracts release group name from release titles
 * Release groups typically appear at the end of the title, often after a dash
 */

interface ReleaseGroupMatch {
	group: string;
	matchedText: string;
	index: number;
}

/**
 * Words/patterns that should NOT be considered release groups
 */
const GROUP_BLACKLIST = [
	// Quality indicators
	/^(720p?|1080p?|2160p?|4k|uhd|hd|sd|hdr|dv|hdr10|hlg)$/i,
	// Codecs
	/^(x264|x265|h264|h265|hevc|avc|av1|xvid|divx)$/i,
	// Sources
	/^(bluray|bdrip|brrip|webrip|webdl|hdtv|dvdrip|remux|web)$/i,
	// Audio
	/^(aac|ac3|dts|truehd|atmos|flac|mp3|opus|dd|dd\+|ddp|5\.1|7\.1|2\.0)$/i,
	// Common endings
	/^(mkv|mp4|avi|proper|repack|internal|real|rerip)$/i,
	// Languages
	/^(english|german|french|spanish|multi|dual|audio)$/i,
	// File sizes
	/^\d+(\.\d+)?\s*(gb|mb|tb)$/i,
	// Dates
	/^\d{4}$/,
	// Generic terms
	/^(extended|directors|cut|edition|unrated|theatrical|imax|esub)$/i,
	// Indexer-only suffixes (not release groups - RARBG is both indexer AND group so not included)
	/^(eztv|yify|yts|ettv|ethd|tgx)$/i
];

/**
 * Known indexer suffixes to strip before group extraction
 */
const INDEXER_SUFFIXES = [
	/\s+EZTV$/i,
	/\s+YIFY$/i,
	/\s+YTS(\.[A-Z]{2,3})?$/i,
	/\s+RARBG$/i,
	/\s+\[?ettv\]?$/i,
	/\s+\[?eztv[x]?\.[a-z]+\]?$/i,
	/\[TGx\]$/i
];

/**
 * Known indexer prefixes to strip before group extraction
 */
const INDEXER_PREFIXES = [
	/^www\.[a-z0-9-]+\.(com|org|net|lol|to|world|mx|ch|nz|win|co|io|me)\s*[-:]\s*/i,
	/^[a-z0-9-]+\.(com|org|net|lol|to|world|mx|ch|nz|win|co|io|me)[-\s]+/i,
	// Site prefixes in brackets (Chinese sites, etc.)
	/^\[\s*[^\]]+\.(com|net|org|cn|co)[^\]]*\]\s*/i,
	// Chinese site prefixes with Chinese chars: [ 高清电影之家 mkvhome.com ]
	/^\[\s*[^\]]+\]\s*/i
];

/**
 * Patterns for anime fansub groups (at START of title)
 */
const ANIME_GROUP_PATTERNS = [
	// Standard anime fansub: "[SubsPlease]" or "[Erai-raws]"
	/^\[([a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)?)\]/
];

/**
 * Patterns for YTS/YIFY variants (to normalize to "YTS")
 * YTS and YIFY are the same group
 */
const YTS_PATTERNS = [
	// Plain YTS at end: "-YTS" or ".YTS"
	/[-.]YTS$/i,
	// Plain YIFY at end: "-YIFY" or ".YIFY"
	/[-.]YIFY$/i,
	// YTS with country code: "[YTS.MX]", "[YTS.AM]", "YTS.LT"
	/\[YTS\.[A-Z]{2,3}\]$/i,
	/[-.]YTS\.[A-Z]{2,3}$/i,
	// YIFY with country code variants
	/\[YIFY\.[A-Z]{2,3}\]$/i,
	/[-.]YIFY\.[A-Z]{2,3}$/i
];

/**
 * Patterns to identify where release group might be (at END of title)
 */
const GROUP_EXTRACTION_PATTERNS = [
	// Hyphenated group: "Movie-MY-GROUP" (compound groups)
	/-([a-zA-Z]+-[a-zA-Z0-9]+)$/,
	// Group after last dash: "Movie.2024.1080p.WEB-DL-GROUP"
	/-([a-zA-Z0-9]+)$/,
	// Group after space-dash-space: "Movie 1080p - GROUP" (common in some releases)
	/\s-\s([a-zA-Z0-9]+)$/,
	// Group in square brackets at end: "Movie (2024) [GROUP]"
	/\[([a-zA-Z0-9]+)\]$/,
	// Group in parentheses at end: "Movie 2024 (GROUP)"
	/\(([a-zA-Z0-9]+)\)$/,
	// Group as last word inside parentheses: "(1080p x265 AAC 5.1 Tigole)"
	/\([^)]*\s([a-zA-Z][a-zA-Z0-9]+)\)$/,
	// Group after @ sign: "Movie.2024@GROUP"
	/@([a-zA-Z0-9]+)$/,
	// Group with tildes: ~GroupName~ or ~GroupName~.mkv
	/~([a-zA-Z0-9]+)~(?:\.mkv)?$/i,
	// Group in curly braces: {GroupName}
	/\{([a-zA-Z0-9]+)\}(?:\.mkv)?$/i,
	// Group in unicode brackets (Chinese style): 【GroupName】
	/[\u3010]([a-zA-Z0-9]+)[\u3011](?:\.mkv)?$/i,
	// Space-separated group at end (capitalized): "...5.1 BONE" or "...x265 GROUP"
	/\s([A-Z][A-Za-z0-9]{2,})$/
];

/**
 * Patterns for groups embedded inside quality/codec brackets
 * e.g., [1080p.BluRay.H265.AC3.5.1-GroupName]
 */
const EMBEDDED_GROUP_PATTERNS = [
	// Hyphenated compound group inside bracket: [quality-Group-Name] with optional trailing brackets
	// Uses [^\]]* to match any content up to the group, allowing complex quality strings
	/\[[^\]]*-([a-zA-Z]+-[a-zA-Z0-9]+)\](?:\s*\[[^\]]*\])*$/,
	// Simple group at end of bracket content: [quality-GROUP]
	/\[[^\]]*-([a-zA-Z0-9]+)\](?:\s*\[[^\]]*\])*$/
];

/**
 * Check if a potential group name is blacklisted
 */
function isBlacklisted(name: string): boolean {
	return GROUP_BLACKLIST.some((pattern) => pattern.test(name));
}

/**
 * Check if a name looks like a valid release group
 */
function isValidGroupName(name: string, allowHyphens = false): boolean {
	// Must be 2-20 characters
	if (name.length < 2 || name.length > 20) {
		return false;
	}

	// Must not be blacklisted
	if (isBlacklisted(name)) {
		return false;
	}

	// Must be alphanumeric (allow hyphen for anime groups like "Erai-raws")
	const validPattern = allowHyphens ? /^[a-zA-Z0-9-]+$/ : /^[a-zA-Z0-9]+$/;
	if (!validPattern.test(name)) {
		return false;
	}

	// Must not be all numbers
	if (/^\d+$/.test(name)) {
		return false;
	}

	return true;
}

/**
 * Strip known indexer suffixes from title
 */
function stripIndexerSuffixes(title: string): string {
	let result = title;
	for (const pattern of INDEXER_SUFFIXES) {
		result = result.replace(pattern, '');
	}
	return result;
}

/**
 * Strip known indexer prefixes from title
 */
function stripIndexerPrefixes(title: string): string {
	let result = title;
	for (const pattern of INDEXER_PREFIXES) {
		result = result.replace(pattern, '');
	}
	return result;
}

/**
 * Extract release group from a release title
 *
 * @param title - The release title to parse
 * @returns Release group match info or null if not found
 */
export function extractReleaseGroup(title: string): ReleaseGroupMatch | null {
	// Remove file extension if present (handles both ".mkv" and " mkv" formats)
	// The space-separated format occurs after ReleaseParser.normalizeTitle() replaces dots with spaces
	let cleanTitle = title.replace(/[.\s](mkv|mp4|avi|m4v|webm)$/i, '');

	// Strip indexer prefixes (www.Torrenting.com, etc.)
	cleanTitle = stripIndexerPrefixes(cleanTitle);

	// Strip indexer suffixes (EZTV, YIFY, etc.)
	cleanTitle = stripIndexerSuffixes(cleanTitle);

	// Remove trailing separators (handles malformed titles like "...GROUP-" or "...GROUP.")
	cleanTitle = cleanTitle.replace(/[-._]+$/g, '');

	// Remove trailing file sizes (e.g., " 1.88GB", " 500MB")
	cleanTitle = cleanTitle.replace(/\s+\d+(\.\d+)?\s*(GB|MB|TB)$/i, '');

	// Check for anime fansub groups at START of title first
	// These are distinctive and should be checked before anything else
	for (const pattern of ANIME_GROUP_PATTERNS) {
		const match = cleanTitle.match(pattern);
		if (match) {
			const potentialGroup = match[1];
			// Allow hyphens for anime groups like "Erai-raws"
			if (isValidGroupName(potentialGroup, true)) {
				return {
					group: potentialGroup,
					matchedText: match[0],
					index: 0
				};
			}
		}
	}

	// Check for YTS variants and normalize to "YTS"
	for (const pattern of YTS_PATTERNS) {
		const match = cleanTitle.match(pattern);
		if (match) {
			return {
				group: 'YTS',
				matchedText: match[0],
				index: match.index ?? cleanTitle.length - match[0].length
			};
		}
	}

	// Try each extraction pattern for END of title
	for (const pattern of GROUP_EXTRACTION_PATTERNS) {
		const match = cleanTitle.match(pattern);
		if (match) {
			const potentialGroup = match[1];
			// Allow hyphens for compound groups like "MY-GROUP"
			if (isValidGroupName(potentialGroup, true)) {
				return {
					group: potentialGroup,
					matchedText: match[0],
					index: match.index ?? 0
				};
			}
		}
	}

	// Try embedded group patterns (groups inside quality brackets)
	// e.g., [1080p.BluRay.H265.AC3.5.1-GroupName] [subtitles]
	for (const pattern of EMBEDDED_GROUP_PATTERNS) {
		const match = cleanTitle.match(pattern);
		if (match) {
			const potentialGroup = match[1];
			if (isValidGroupName(potentialGroup, true)) {
				return {
					group: potentialGroup,
					matchedText: match[0],
					index: match.index ?? 0
				};
			}
		}
	}

	// Fallback: try to find the last dash-separated segment
	// "Movie.2024.1080p.WEB-DL.x264-GROUP"
	const parts = cleanTitle.split(/[-._]/);
	if (parts.length > 0) {
		const lastPart = parts[parts.length - 1];
		if (isValidGroupName(lastPart)) {
			const index = cleanTitle.lastIndexOf(lastPart);
			return {
				group: lastPart,
				matchedText: lastPart,
				index
			};
		}
	}

	return null;
}

/**
 * Check if title contains identifiable release group
 */
export function hasReleaseGroup(title: string): boolean {
	return extractReleaseGroup(title) !== null;
}
