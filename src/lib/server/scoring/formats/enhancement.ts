/**
 * Enhancement & Miscellaneous Format Definitions
 *
 * Defines special enhancements and other scoring factors.
 * Based on Profilarr/dictionarry patterns.
 *
 * Score Philosophy (following Profilarr):
 * - IMAX Enhanced: 800 (premium viewing experience)
 * - IMAX: 400 (enhanced aspect ratio)
 * - Repack3: 6 (most fixes)
 * - Repack2: 4 (multiple fixes)
 * - Repack/Proper: 2 (fixes issues)
 * - Special Editions: 50-200 (preferred versions)
 * - x265 (context-dependent): varies
 *
 * Banned formats (negative scores):
 * - Upscaled: -999999 (fake resolution)
 * - 3D: -999999 (usually unwanted)
 * - Full Disc: -999999 (not encoded)
 * - x264 at 2160p: -999999 (wrong codec for resolution)
 * - Xvid: -999999 (legacy codec)
 */

import type { CustomFormat } from '../types.js';

// =============================================================================
// BANNED / PROBLEMATIC FORMATS
// =============================================================================

/**
 * Upscaled Content
 *
 * Fake 4K/higher resolution content that has been upscaled from lower resolution.
 * Should be heavily penalized.
 *
 * Profilarr regex: (Up[-\.\s]?scale|Re[-\.\s]?Grade|\bAIUS\b|AI[-\.\s]?enhanced)
 */
export const UPSCALED_FORMAT: CustomFormat = {
	id: 'banned-upscaled',
	name: 'Upscaled',
	description: 'Upscaled content from lower resolution. Fake 4K should be avoided.',
	category: 'banned',
	tags: ['Banned', 'Enhancement', 'Upscale'],
	conditions: [
		{
			name: 'Upscaled',
			type: 'release_title',
			// Matches Upscale, Up-scale, ReGrade, Re-Grade, AIUS, AI-enhanced
			pattern: '(Up[-\\.\\s]?scale|Re[-\\.\\s]?Grade|\\bAIUS\\b|AI[-\\.\\s]?enhanced)',
			required: true,
			negate: false
		}
	]
};

/**
 * AI Upscaled TV
 *
 * TV content that has been AI upscaled. Often poor quality.
 *
 * Profilarr regex: (?<=\bS\d+\b).*(\b(AI)\b)
 */
export const AI_UPSCALED_TV_FORMAT: CustomFormat = {
	id: 'banned-ai-tv',
	name: 'AI Upscaled (TV)',
	description: 'AI upscaled TV content. Usually poor quality.',
	category: 'banned',
	tags: ['Banned', 'Enhancement', 'AI', 'TV'],
	conditions: [
		{
			name: 'Has Season indicator',
			type: 'release_title',
			pattern: '\\bS\\d+\\b',
			required: true,
			negate: false
		},
		{
			name: 'Has AI indicator',
			type: 'release_title',
			pattern: '\\bAI\\b',
			required: true,
			negate: false
		}
	]
};

/**
 * AI Upscaled Movies
 *
 * Movie content that has been AI upscaled. Often poor quality.
 *
 * Profilarr regex: (?<=\b[12]\d{3}\b).*(\b(AI)\b)
 */
export const AI_UPSCALED_MOVIE_FORMAT: CustomFormat = {
	id: 'banned-ai-movie',
	name: 'AI Upscaled (Movie)',
	description: 'AI upscaled movie content. Usually poor quality.',
	category: 'banned',
	tags: ['Banned', 'Enhancement', 'AI', 'Movie'],
	conditions: [
		{
			name: 'Has Year',
			type: 'release_title',
			pattern: '\\b[12]\\d{3}\\b',
			required: true,
			negate: false
		},
		{
			name: 'Has AI indicator after year',
			type: 'release_title',
			pattern: '(?<=\\b[12]\\d{3}\\b).*\\bAI\\b',
			required: true,
			negate: false
		}
	]
};

/**
 * 3D Content
 *
 * 3D releases are usually unwanted for regular viewing.
 *
 * Profilarr regex: (?<=\b[12]\d{3}\b).*\b((bluray|bd)?3d|sbs|half[ .-]ou|half[ .-]sbs)\b
 */
export const THREE_D_FORMAT: CustomFormat = {
	id: 'banned-3d',
	name: '3D',
	description: '3D content. Usually unwanted for standard displays.',
	category: 'banned',
	tags: ['Banned', 'Enhancement', '3D'],
	conditions: [
		{
			name: '3D Format',
			type: 'release_title',
			// Matches BluRay3D, BD3D, 3D, SBS (Side-by-Side), Half-OU, Half-SBS
			pattern: '\\b((bluray|bd)?3d|sbs|half[ .-]ou|half[ .-]sbs)\\b',
			required: true,
			negate: false
		}
	]
};

/**
 * Full Disc
 *
 * Full disc releases without encoding. Not compatible with most players.
 *
 * Profilarr pattern matches ISO, BDMV, Complete Bluray, BR-Disk, etc.
 */
export const FULL_DISC_FORMAT: CustomFormat = {
	id: 'banned-full-disc',
	name: 'Full Disc',
	description: 'Full disc release without encoding. Not compatible with most players.',
	category: 'banned',
	tags: ['Banned', 'Storage', 'Full Disc'],
	conditions: [
		{
			name: 'Full Disc indicators',
			type: 'release_title',
			// Matches ISO, BDMV, Complete Bluray, BR-Disk, DVD5, DVD9, etc.
			pattern:
				'\\b(ISO|BDMV|COMPLETE[-. ]?(UHD[-. ]?)?BLU[-. ]?RAY|BR[-. ]?DIS[KC]|DVD[59]|NTSC|PAL|VOB|IFO)\\b',
			required: true,
			negate: false
		},
		{
			name: 'Not Remux',
			type: 'release_title',
			pattern: '\\bREMUX\\b',
			required: true,
			negate: true
		},
		{
			name: 'Not encoded (x264)',
			type: 'release_title',
			pattern: '\\b(x264|h\\.?264|AVC)\\b',
			required: true,
			negate: true
		},
		{
			name: 'Not encoded (x265)',
			type: 'release_title',
			pattern: '\\b(x265|h\\.?265|HEVC)\\b',
			required: true,
			negate: true
		}
	]
};

/**
 * x264 at 2160p
 *
 * x264/AVC codec at 4K resolution is inefficient and usually indicates
 * a poor encode or transcoded content.
 */
export const X264_2160P_FORMAT: CustomFormat = {
	id: 'banned-x264-2160p',
	name: 'x264 (2160p)',
	description: 'x264 codec at 4K resolution. Inefficient and usually poor quality.',
	category: 'banned',
	tags: ['Banned', 'Codec', 'x264', '2160p'],
	conditions: [
		{
			name: '2160p resolution',
			type: 'release_title',
			pattern: '\\b(2160p|4K|UHD)\\b',
			required: true,
			negate: false
		},
		{
			name: 'x264 codec',
			type: 'release_title',
			pattern: '\\b(x264|h\\.?264|AVC)\\b',
			required: true,
			negate: false
		},
		{
			name: 'Not REMUX (AVC is fine for remux)',
			type: 'release_title',
			pattern: '\\bREMUX\\b',
			required: true,
			negate: true
		}
	]
};

/**
 * Xvid Codec
 *
 * Legacy MPEG-4 Part 2 codec. Very outdated and poor quality by modern standards.
 *
 * Profilarr regex: (?i)[-. ]Xvid
 */
export const XVID_FORMAT: CustomFormat = {
	id: 'banned-xvid',
	name: 'Xvid',
	description: 'Xvid legacy codec. Very outdated, poor quality.',
	category: 'banned',
	tags: ['Banned', 'Codec', 'Xvid', 'Legacy'],
	conditions: [
		{
			name: 'Xvid',
			type: 'release_title',
			pattern: '[-. ]Xvid\\b',
			required: true,
			negate: false
		}
	]
};

/**
 * All banned formats
 */
export const BANNED_FORMATS: CustomFormat[] = [
	UPSCALED_FORMAT,
	AI_UPSCALED_TV_FORMAT,
	AI_UPSCALED_MOVIE_FORMAT,
	THREE_D_FORMAT,
	FULL_DISC_FORMAT,
	X264_2160P_FORMAT,
	XVID_FORMAT
];

// =============================================================================
// REPACK / PROPER FORMATS
// =============================================================================

/**
 * Repack/Proper Formats
 *
 * These indicate fixes to original releases. Higher numbers = more fixes.
 */
export const REPACK_FORMATS: CustomFormat[] = [
	{
		id: 'repack-3',
		name: 'Repack3',
		description: 'Third repack release - most fixes applied',
		category: 'enhancement',
		tags: ['Repack', 'Fix'],
		conditions: [
			{
				name: 'Repack3',
				type: 'release_title',
				pattern: '\\bREPACK3\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'repack-2',
		name: 'Repack2',
		description: 'Second repack release - multiple fixes',
		category: 'enhancement',
		tags: ['Repack', 'Fix'],
		conditions: [
			{
				name: 'Repack2',
				type: 'release_title',
				pattern: '\\bREPACK2\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'repack-1',
		name: 'Repack',
		description: 'Repack release - fixes issues with original',
		category: 'enhancement',
		tags: ['Repack', 'Fix'],
		conditions: [
			{
				name: 'Repack',
				type: 'release_title',
				pattern: '\\bREPACK\\b',
				required: true,
				negate: false
			},
			{
				name: 'Not Repack2/3',
				type: 'release_title',
				pattern: '\\bREPACK[23]\\b',
				required: true,
				negate: true
			}
		]
	},
	{
		id: 'proper',
		name: 'Proper',
		description: 'Proper release - fixes issues with original from another group',
		category: 'enhancement',
		tags: ['Proper', 'Fix'],
		conditions: [
			{
				name: 'Proper',
				type: 'release_title',
				pattern: '\\bPROPER\\b',
				required: true,
				negate: false
			}
		]
	}
];

// =============================================================================
// IMAX FORMATS
// =============================================================================

/**
 * IMAX Enhanced
 *
 * Premium IMAX experience from Disney+ or Bravia Core.
 * True IMAX Enhanced has better aspect ratio and audio.
 *
 * Profilarr regex: ^(?=.*\b((DSNP|Disney\+|BC|B?CORE)(?=.?web.?(dl|rip)\b)))(?=.*\b((?<!NON.?)IMAX(.?Enhanced)?)\b)
 */
export const IMAX_ENHANCED_FORMAT: CustomFormat = {
	id: 'edition-imax-enhanced',
	name: 'IMAX Enhanced',
	description: 'IMAX Enhanced from Disney+ or Bravia Core. Premium aspect ratio and audio.',
	category: 'enhancement',
	tags: ['Edition', 'IMAX', 'Enhanced', 'Premium'],
	conditions: [
		{
			name: 'From Disney+ or Bravia Core',
			type: 'release_title',
			pattern: '\\b(DSNP|Disney\\+|BC|B?CORE)\\b',
			required: true,
			negate: false
		},
		{
			name: 'WEB source',
			type: 'release_title',
			pattern: '\\bWEB[-. ]?(DL|Rip)\\b',
			required: true,
			negate: false
		},
		{
			name: 'IMAX (not NON-IMAX)',
			type: 'release_title',
			pattern: '\\b((?<!NON[-. ]?)IMAX([-. ]?Enhanced)?)\\b',
			required: true,
			negate: false
		}
	]
};

/**
 * IMAX (Generic)
 *
 * Any IMAX release including BluRay IMAX versions.
 *
 * Profilarr regex: \b((?<!NON.?)IMAX)\b
 */
export const IMAX_FORMAT: CustomFormat = {
	id: 'edition-imax',
	name: 'IMAX',
	description: 'IMAX version with enhanced aspect ratio.',
	category: 'enhancement',
	tags: ['Edition', 'IMAX'],
	conditions: [
		{
			name: 'IMAX (not NON-IMAX)',
			type: 'release_title',
			pattern: '\\b(?<!NON[-. ]?)IMAX\\b',
			required: true,
			negate: false
		},
		{
			name: 'Not IMAX Enhanced (separate format)',
			type: 'release_title',
			pattern: '\\bIMAX[-. ]?Enhanced\\b',
			required: true,
			negate: true
		}
	]
};

/**
 * IMAX Formats
 */
export const IMAX_FORMATS: CustomFormat[] = [IMAX_ENHANCED_FORMAT, IMAX_FORMAT];

// =============================================================================
// SPECIAL EDITION FORMATS
// =============================================================================

/**
 * Special Edition Formats
 */
export const EDITION_FORMATS: CustomFormat[] = [
	{
		id: 'edition-directors-cut',
		name: "Director's Cut",
		description: "Director's Cut edition - filmmaker's preferred version",
		category: 'enhancement',
		tags: ['Edition', 'Directors Cut'],
		conditions: [
			{
				name: 'Directors Cut',
				type: 'release_title',
				pattern: "\\b(Director'?s?[-. ]?Cut|DC)\\b",
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'edition-extended',
		name: 'Extended',
		description: 'Extended edition - additional scenes',
		category: 'enhancement',
		tags: ['Edition', 'Extended'],
		conditions: [
			{
				name: 'Extended',
				type: 'release_title',
				pattern: '\\bExtended\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'edition-unrated',
		name: 'Unrated',
		description: 'Unrated edition - uncensored content',
		category: 'enhancement',
		tags: ['Edition', 'Unrated'],
		conditions: [
			{
				name: 'Unrated',
				type: 'release_title',
				pattern: '\\bUnrated\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'edition-theatrical',
		name: 'Theatrical',
		description: 'Theatrical release version - original cinema cut',
		category: 'enhancement',
		tags: ['Edition', 'Theatrical'],
		conditions: [
			{
				name: 'Theatrical',
				type: 'release_title',
				pattern: '\\bTheatrical\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'edition-remastered',
		name: 'Remastered',
		description: 'Remastered version - improved quality from original source',
		category: 'enhancement',
		tags: ['Edition', 'Remastered'],
		conditions: [
			{
				name: 'Remastered',
				type: 'release_title',
				pattern: '\\bRemastered\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'edition-special',
		name: 'Special Edition',
		description: 'Special Edition - bonus content or unique version',
		category: 'enhancement',
		tags: ['Edition', 'Special'],
		conditions: [
			{
				name: 'Special Edition',
				type: 'release_title',
				pattern: '\\b(Special[-. ]?Edition|SE)\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'edition-criterion',
		name: 'Criterion',
		description: 'Criterion Collection - premium restoration',
		category: 'enhancement',
		tags: ['Edition', 'Criterion', 'Premium'],
		conditions: [
			{
				name: 'Criterion',
				type: 'release_title',
				pattern: '\\b(Criterion|CC)\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'edition-open-matte',
		name: 'Open Matte',
		description: 'Open Matte version - full frame without letterboxing',
		category: 'enhancement',
		tags: ['Edition', 'Open Matte', 'Aspect Ratio'],
		conditions: [
			{
				name: 'Open Matte',
				type: 'release_title',
				pattern: '\\bOpen[-. ]?Matte\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'edition-sing-along',
		name: 'Sing Along',
		description: 'Sing Along version - includes on-screen lyrics',
		category: 'enhancement',
		tags: ['Edition', 'Sing Along'],
		conditions: [
			{
				name: 'Sing Along',
				type: 'release_title',
				pattern: '\\bSing[-. ]?Along\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'edition-bw',
		name: 'Black & White',
		description: 'Black & White version - monochrome presentation',
		category: 'enhancement',
		tags: ['Edition', 'B&W', 'Black White'],
		conditions: [
			{
				name: 'Black & White',
				type: 'release_title',
				pattern: '\\b(B&W|Black[-. ]?(and[-. ]?)?White|Noir[-. ]?et[-. ]?Blanc)\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'edition-hybrid',
		name: 'Hybrid',
		description: 'Hybrid release - combines multiple sources for best quality',
		category: 'enhancement',
		tags: ['Edition', 'Hybrid'],
		conditions: [
			{
				name: 'Hybrid',
				type: 'release_title',
				pattern: '\\bHybrid\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'edition-final-cut',
		name: 'Final Cut',
		description: 'Final Cut edition - definitive version',
		category: 'enhancement',
		tags: ['Edition', 'Final Cut'],
		conditions: [
			{
				name: 'Final Cut',
				type: 'release_title',
				pattern: '\\bFinal[-. ]?Cut\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'edition-ultimate',
		name: 'Ultimate Edition',
		description: 'Ultimate Edition - most complete version',
		category: 'enhancement',
		tags: ['Edition', 'Ultimate'],
		conditions: [
			{
				name: 'Ultimate',
				type: 'release_title',
				pattern: '\\bUltimate[-. ]?(Edition|Cut)?\\b',
				required: true,
				negate: false
			}
		]
	}
];

// =============================================================================
// CODEC-SPECIFIC FORMATS
// =============================================================================

/**
 * Codec-specific Formats
 */
export const CODEC_FORMATS: CustomFormat[] = [
	{
		id: 'codec-vvc',
		name: 'VVC',
		description: 'VVC/H.266 codec - newest standard, bleeding edge efficiency',
		category: 'codec',
		tags: ['Codec', 'VVC', 'H.266', 'Bleeding Edge'],
		conditions: [
			{
				name: 'VVC',
				type: 'release_title',
				pattern: '\\b(VVC|H\\.?266)\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'codec-av1',
		name: 'AV1',
		description: 'AV1 codec - next-gen efficiency, excellent quality at lower bitrates',
		category: 'codec',
		tags: ['Codec', 'AV1', 'Modern', 'Efficient'],
		conditions: [
			{
				name: 'AV1',
				type: 'release_title',
				pattern: '\\bAV1\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'codec-vp9',
		name: 'VP9',
		description: 'VP9 codec - good efficiency, YouTube standard',
		category: 'codec',
		tags: ['Codec', 'VP9'],
		conditions: [
			{
				name: 'VP9',
				type: 'release_title',
				pattern: '\\bVP9\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'codec-x265',
		name: 'x265',
		description: 'x265/HEVC codec - efficient encoding, good for 4K',
		category: 'codec',
		tags: ['Codec', 'x265', 'HEVC', 'Efficient'],
		conditions: [
			{
				name: 'x265',
				type: 'release_title',
				pattern: '\\b(x265|HEVC|H\\.?265)\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'codec-x264',
		name: 'x264',
		description: 'x264/AVC codec - universal compatibility',
		category: 'codec',
		tags: ['Codec', 'x264', 'AVC'],
		conditions: [
			{
				name: 'x264',
				type: 'release_title',
				pattern: '\\b(x264|AVC|H\\.?264)\\b',
				required: true,
				negate: false
			},
			{
				name: 'Not 2160p (separate banned format)',
				type: 'release_title',
				pattern: '\\b(2160p|4K|UHD)\\b',
				required: true,
				negate: true
			}
		]
	}
];

// =============================================================================
// TV-SPECIFIC FORMATS
// =============================================================================

/**
 * TV-specific Formats
 */
export const TV_FORMATS: CustomFormat[] = [
	{
		id: 'tv-season-pack',
		name: 'Season Pack',
		description: 'Full season pack - convenient for series collection',
		category: 'other',
		tags: ['TV', 'Season Pack'],
		conditions: [
			{
				name: 'Season Pack',
				type: 'release_title',
				pattern: '\\bS\\d{2}(?!E)\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'tv-complete-series',
		name: 'Complete Series',
		description: 'Complete series pack - full show in one release',
		category: 'other',
		tags: ['TV', 'Complete Series'],
		conditions: [
			{
				name: 'Complete',
				type: 'release_title',
				pattern: '\\b(Complete|Full)[-. ]?Series\\b',
				required: true,
				negate: false
			}
		]
	}
];

// =============================================================================
// LANGUAGE FORMATS
// =============================================================================

/**
 * Language Formats
 */
export const LANGUAGE_FORMATS: CustomFormat[] = [
	{
		id: 'lang-multi',
		name: 'Multi Audio',
		description: 'Multiple audio tracks - good for international releases',
		category: 'other',
		tags: ['Language', 'Multi'],
		conditions: [
			{
				name: 'Multi',
				type: 'release_title',
				pattern: '\\b(Multi|MULTi)\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'lang-dual-audio',
		name: 'Dual Audio',
		description: 'Dual audio tracks - typically English + original language',
		category: 'other',
		tags: ['Language', 'Dual'],
		conditions: [
			{
				name: 'Dual Audio',
				type: 'release_title',
				pattern: '\\b(Dual[-. ]?Audio|DUAL)\\b',
				required: true,
				negate: false
			}
		]
	}
];

// =============================================================================
// EXTRAS / UNWANTED TV CONTENT
// =============================================================================

/**
 * Extras Format
 *
 * Behind-the-scenes, deleted scenes, etc. Usually unwanted for main library.
 */
export const EXTRAS_FORMAT: CustomFormat = {
	id: 'unwanted-extras',
	name: 'Extras',
	description: 'Bonus content like behind-the-scenes, deleted scenes. Usually unwanted.',
	category: 'banned',
	tags: ['Unwanted', 'Extras'],
	conditions: [
		{
			name: 'Extras',
			type: 'release_title',
			pattern:
				'\\b(Extras|Bonus|Behind[-. ]?The[-. ]?Scenes|BTS|Deleted[-. ]?Scenes|Featurettes?)\\b',
			required: true,
			negate: false
		}
	]
};

// =============================================================================
// EXPORTS
// =============================================================================

/**
 * All enhancement formats (grouped by category)
 */
export const ALL_ENHANCEMENT_FORMATS: CustomFormat[] = [
	// Banned formats (check first for quick rejection)
	...BANNED_FORMATS,
	// Repack/Proper
	...REPACK_FORMATS,
	// IMAX
	...IMAX_FORMATS,
	// Special editions
	...EDITION_FORMATS,
	// Codecs
	...CODEC_FORMATS,
	// TV-specific
	...TV_FORMATS,
	// Language
	...LANGUAGE_FORMATS,
	// Extras
	EXTRAS_FORMAT
];
