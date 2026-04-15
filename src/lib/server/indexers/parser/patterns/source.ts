/**
 * Source Pattern Matching
 *
 * Extracts video source from release titles (BluRay, WEB-DL, HDTV, etc.)
 */

import type { Source } from '../types.js';

interface SourceMatch {
	source: Source;
	matchedText: string;
	index: number;
}

/**
 * Source patterns ordered by specificity (most specific first)
 * REMUX should be checked before BluRay since REMUX implies BluRay source
 */
const SOURCE_PATTERNS: Array<{ pattern: RegExp; source: Source }> = [
	// REMUX (must be before BluRay)
	{ pattern: /\bremux\b/i, source: 'remux' },

	// BluRay variants
	{ pattern: /\bblu[\s._-]?ray\b/i, source: 'bluray' },
	{ pattern: /\bbdrip\b/i, source: 'bluray' },
	{ pattern: /\bbrrip\b/i, source: 'bluray' },
	{ pattern: /\bbd[\s._-]?rip\b/i, source: 'bluray' },
	{ pattern: /\bbd(?:25|50)\b/i, source: 'bluray' },
	{ pattern: /\bbdmv\b/i, source: 'bluray' },

	// HDRip (keep distinct from WEBRip/BluRay)
	{ pattern: /\bhd[\s._-]?rip\b/i, source: 'hdrip' },

	// WEB-DL (download from streaming service, no re-encoding)
	{ pattern: /\bweb[\s._-]?dl\b/i, source: 'webdl' },
	{ pattern: /\bwebdl\b/i, source: 'webdl' },
	{ pattern: /\bamazon[\s._-]?web[\s._-]?dl\b/i, source: 'webdl' },
	{ pattern: /\bnetflix[\s._-]?web[\s._-]?dl\b/i, source: 'webdl' },
	{ pattern: /\bitunes\b/i, source: 'webdl' },

	// WEBRip (captured from streaming, re-encoded)
	{ pattern: /\bweb[\s._-]?rip\b/i, source: 'webrip' },
	{ pattern: /\bwebrip\b/i, source: 'webrip' },
	{ pattern: /\bweb[\s._-]?cap\b/i, source: 'webrip' },

	// Generic WEB (could be either, default to webrip)
	{ pattern: /\bweb\b/i, source: 'webrip' },

	// HDTV variants
	{ pattern: /\bhdtv\b/i, source: 'hdtv' },
	{ pattern: /\bpdtv\b/i, source: 'hdtv' },
	{ pattern: /\bdsr\b/i, source: 'hdtv' },
	{ pattern: /\bdthrip\b/i, source: 'hdtv' },
	{ pattern: /\bdvb\b/i, source: 'hdtv' },
	{ pattern: /\btvrip\b/i, source: 'hdtv' },
	{ pattern: /\bsatellite[\s._-]?rip\b/i, source: 'hdtv' },

	// DVD variants
	{ pattern: /\bdvd[\s._-]?rip\b/i, source: 'dvd' },
	{ pattern: /\bdvdr\b/i, source: 'dvd' },
	{ pattern: /\bdvd[\s._-]?r\b/i, source: 'dvd' },
	{ pattern: /\bdvd[\s._-]?scr\b/i, source: 'screener' },
	{ pattern: /\bdvd9\b/i, source: 'dvd' },
	{ pattern: /\bdvd5\b/i, source: 'dvd' },

	// Screener variants
	{ pattern: /\bweb[\s._-]?screener\b/i, source: 'screener' },
	{ pattern: /\bwebscr(?:eener)?\b/i, source: 'screener' },
	{ pattern: /\bscreener\b/i, source: 'screener' },
	{ pattern: /\bscr\b/i, source: 'screener' },
	{ pattern: /\bdvdscr\b/i, source: 'screener' },
	{ pattern: /\bbdscr\b/i, source: 'screener' },
	{ pattern: /\bweb[\s._-]?scr\b/i, source: 'screener' },

	// Telecine (film to digital transfer)
	{ pattern: /\btelecine\b/i, source: 'telecine' },
	{ pattern: /\btc\b/i, source: 'telecine' },
	{ pattern: /\bhdtc\b/i, source: 'telecine' },

	// Telesync (recorded in cinema with external audio)
	{ pattern: /\btelesync\b/i, source: 'telesync' },
	{ pattern: /\bts\b(?![\w])/i, source: 'telesync' },
	{ pattern: /\bhdts\b/i, source: 'telesync' },
	{ pattern: /\bpre[\s._-]?dvd\b/i, source: 'telesync' },

	// CAM (recorded in cinema)
	{ pattern: /\bcam[\s._-]?rip\b/i, source: 'cam' },
	{ pattern: /\bcam\b/i, source: 'cam' },
	{ pattern: /\bhdcam\b/i, source: 'cam' }
];

/**
 * Extract source from a release title
 *
 * @param title - The release title to parse
 * @returns Source match info or null if not found
 */
export function extractSource(title: string): SourceMatch | null {
	for (const { pattern, source } of SOURCE_PATTERNS) {
		const match = title.match(pattern);
		if (match) {
			return {
				source,
				matchedText: match[0],
				index: match.index ?? 0
			};
		}
	}
	return null;
}

/**
 * Check if a string likely contains source info
 */
export function hasSourceInfo(title: string): boolean {
	return SOURCE_PATTERNS.some(({ pattern }) => pattern.test(title));
}
