/**
 * Codec Pattern Matching
 *
 * Extracts video codec from release titles (H.265, H.264, AV1, etc.)
 */

import type { BitDepth, Codec } from '../types.js';

interface CodecMatch {
	codec: Codec;
	matchedText: string;
	index: number;
}

interface BitDepthMatch {
	bitDepth: BitDepth;
	matchedText: string;
	index: number;
}

/**
 * Codec patterns ordered by specificity
 */
const CODEC_PATTERNS: Array<{ pattern: RegExp; codec: Codec }> = [
	// AV1 (newest, most efficient)
	{ pattern: /\bav1\b/i, codec: 'av1' },

	// H.265/HEVC variants
	{ pattern: /\bhevc\b/i, codec: 'h265' },
	{ pattern: /\bh(?:[ ._-])?265\b/i, codec: 'h265' },
	{ pattern: /\bx265\b/i, codec: 'h265' },
	{ pattern: /\bx\.265\b/i, codec: 'h265' },

	// H.264/AVC variants
	{ pattern: /\bavc\b/i, codec: 'h264' },
	{ pattern: /\bh(?:[ ._-])?264\b/i, codec: 'h264' },
	{ pattern: /\bx264\b/i, codec: 'h264' },
	{ pattern: /\bx[\s._-]?264\b/i, codec: 'h264' },

	// VC-1 (older Microsoft codec, common in older Blu-rays)
	{ pattern: /\bvc[\s._-]?1\b/i, codec: 'vc1' },

	// MPEG-2 (DVD, older content)
	{ pattern: /\bmpeg[\s._-]?2\b/i, codec: 'mpeg2' },
	{ pattern: /\bm2v\b/i, codec: 'mpeg2' },

	// XviD/DivX (older formats, still seen in legacy releases)
	{ pattern: /\bxvid\b/i, codec: 'xvid' },
	{ pattern: /\bdivx\b/i, codec: 'divx' }
];

const BIT_DEPTH_PATTERNS: Array<{ pattern: RegExp; bitDepth: BitDepth }> = [
	{ pattern: /\b12[\s._-]?bit\b/i, bitDepth: '12' },
	{ pattern: /\b10[\s._-]?bit\b/i, bitDepth: '10' },
	{ pattern: /\b8[\s._-]?bit\b/i, bitDepth: '8' }
];

/**
 * Extract codec from a release title
 *
 * @param title - The release title to parse
 * @returns Codec match info or null if not found
 */
export function extractCodec(title: string): CodecMatch | null {
	for (const { pattern, codec } of CODEC_PATTERNS) {
		const match = title.match(pattern);
		if (match) {
			return {
				codec,
				matchedText: match[0],
				index: match.index ?? 0
			};
		}
	}
	return null;
}

export function extractBitDepth(title: string): BitDepthMatch | null {
	for (const { pattern, bitDepth } of BIT_DEPTH_PATTERNS) {
		const match = title.match(pattern);
		if (match) {
			return {
				bitDepth,
				matchedText: match[0],
				index: match.index ?? 0
			};
		}
	}
	return null;
}

/**
 * Check if a string likely contains codec info
 */
export function hasCodecInfo(title: string): boolean {
	return CODEC_PATTERNS.some(({ pattern }) => pattern.test(title));
}

export function hasBitDepthInfo(title: string): boolean {
	return BIT_DEPTH_PATTERNS.some(({ pattern }) => pattern.test(title));
}
