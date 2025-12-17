/**
 * Audio Format Definitions
 *
 * Defines audio codec/format matching for quality scoring.
 * Following Profilarr's approach where:
 * - Audio codecs are detected as base formats
 * - Atmos is a SEPARATE stackable modifier (not combined with codec)
 * - "Missing" variants catch BTN/tracker-specific naming conventions
 *
 * This allows profiles to score independently:
 * - TrueHD = +1200
 * - Atmos = +400
 * - TrueHD + Atmos release = +1600 (both match)
 */

import type { CustomFormat } from '../types.js';

// =============================================================================
// LOSSLESS AUDIO CODECS
// =============================================================================

/**
 * Lossless Audio Formats
 * These are the highest quality audio codecs
 */
export const LOSSLESS_AUDIO_FORMATS: CustomFormat[] = [
	// =========================================================================
	// TrueHD (Dolby lossless)
	// =========================================================================
	{
		id: 'audio-truehd',
		name: 'TrueHD',
		description: 'Dolby TrueHD lossless audio codec',
		category: 'audio',
		tags: ['Audio', 'Lossless', 'Dolby'],
		conditions: [
			{
				name: 'TrueHD',
				type: 'release_title',
				// Profilarr pattern: True[ .-]?HD[ .-]?
				pattern: '\\bTrue[ ._-]?HD',
				required: true,
				negate: false
			},
			// Negate other codecs that might conflict
			{
				name: 'Not Dolby Digital',
				type: 'release_title',
				pattern: '\\bDolby[ ._-]?Digital\\b',
				required: true,
				negate: true
			},
			{
				name: 'Not DD+',
				type: 'release_title',
				pattern: '\\b(DD[P+]|E[ ._-]?AC[ ._-]?3)\\b',
				required: true,
				negate: true
			},
			{
				name: 'Not DTS',
				type: 'release_title',
				pattern: '\\bDTS\\b',
				required: true,
				negate: true
			},
			{
				name: 'Not FLAC',
				type: 'release_title',
				pattern: '\\bFLAC\\b',
				required: true,
				negate: true
			}
		]
	},
	{
		id: 'audio-truehd-missing',
		name: 'TrueHD (Missing)',
		description: 'Detects TrueHD releases with non-standard labeling (TrueHDA from BTN groups)',
		category: 'audio',
		tags: ['Audio', 'Lossless', 'Dolby', 'Missing'],
		conditions: [
			// BTN naming convention: TrueHDA7.1 = TrueHD Atmos 7.1 (but without explicit TrueHD)
			{
				name: 'TrueHDA (BTN)',
				type: 'release_title',
				// Matches TrueHDA7.1, TrueHDA.7.1, TrueHDA 7.1
				pattern: '\\bTrue[ ._-]?HDA[ ._-]?[57]\\.1',
				required: false,
				negate: false
			},
			// Must be 2160p (per Profilarr's Atmos (Missing) pattern)
			{
				name: '2160p',
				type: 'resolution',
				resolution: '2160p',
				required: true,
				negate: false
			},
			// Negate standard TrueHD (this is for missing only)
			{
				name: 'Not Standard TrueHD',
				type: 'release_title',
				pattern: '\\bTrueHD\\b(?!A)',
				required: true,
				negate: true
			}
		]
	},

	// =========================================================================
	// DTS:X (object-based lossless)
	// =========================================================================
	{
		id: 'audio-dts-x',
		name: 'DTS:X',
		description: 'DTS:X object-based immersive audio',
		category: 'audio',
		tags: ['Audio', 'Lossless', 'DTS', 'Object Audio'],
		conditions: [
			{
				name: 'DTS-X',
				type: 'release_title',
				// Profilarr pattern: DTS-X
				pattern: '\\bDTS[ ._-]?X\\b',
				required: true,
				negate: false
			},
			// Negate other codecs
			{
				name: 'Not AAC',
				type: 'release_title',
				pattern: '\\bAAC\\b',
				required: true,
				negate: true
			},
			{
				name: 'Not Dolby Digital',
				type: 'release_title',
				pattern: '\\bDolby[ ._-]?Digital\\b',
				required: true,
				negate: true
			},
			{
				name: 'Not DD+',
				type: 'release_title',
				pattern: '\\b(DD[P+]|E[ ._-]?AC[ ._-]?3)\\b',
				required: true,
				negate: true
			},
			{
				name: 'Not FLAC',
				type: 'release_title',
				pattern: '\\bFLAC\\b',
				required: true,
				negate: true
			},
			{
				name: 'Not PCM',
				type: 'release_title',
				pattern: '\\bL?PCM\\b',
				required: true,
				negate: true
			},
			{
				name: 'Not TrueHD',
				type: 'release_title',
				pattern: '\\bTrue[ ._-]?HD\\b',
				required: true,
				negate: true
			}
		]
	},

	// =========================================================================
	// DTS-HD MA (Master Audio, lossless)
	// =========================================================================
	{
		id: 'audio-dts-hdma',
		name: 'DTS-HD MA',
		description: 'DTS-HD Master Audio lossless',
		category: 'audio',
		tags: ['Audio', 'Lossless', 'DTS'],
		conditions: [
			{
				name: 'DTS-HD MA',
				type: 'release_title',
				// Profilarr pattern: \b(dts[-_. ]?(ma|hd([-_. ]?ma)?|xll))(\b|\d)
				pattern: '\\bDTS[ ._-]?(HD[ ._-]?)?MA\\b|\\bDTS[ ._-]?XLL\\b',
				required: true,
				negate: false
			},
			// Negate other codecs
			{
				name: 'Not AAC',
				type: 'release_title',
				pattern: '\\bAAC\\b',
				required: true,
				negate: true
			},
			{
				name: 'Not Dolby Digital',
				type: 'release_title',
				pattern: '\\bDolby[ ._-]?Digital\\b',
				required: true,
				negate: true
			},
			{
				name: 'Not DD+',
				type: 'release_title',
				pattern: '\\b(DD[P+]|E[ ._-]?AC[ ._-]?3)\\b',
				required: true,
				negate: true
			},
			{
				name: 'Not DTS-HD HRA',
				type: 'release_title',
				pattern: '\\bDTS[ ._-]?HD[ ._-]?HRA\\b',
				required: true,
				negate: true
			},
			{
				name: 'Not DTS-X',
				type: 'release_title',
				pattern: '\\bDTS[ ._-]?X\\b',
				required: true,
				negate: true
			},
			{
				name: 'Not FLAC',
				type: 'release_title',
				pattern: '\\bFLAC\\b',
				required: true,
				negate: true
			},
			{
				name: 'Not PCM',
				type: 'release_title',
				pattern: '\\bL?PCM\\b',
				required: true,
				negate: true
			},
			{
				name: 'Not TrueHD',
				type: 'release_title',
				pattern: '\\bTrue[ ._-]?HD\\b',
				required: true,
				negate: true
			}
		]
	},

	// =========================================================================
	// PCM (Uncompressed)
	// =========================================================================
	{
		id: 'audio-pcm',
		name: 'PCM',
		description: 'Uncompressed PCM audio',
		category: 'audio',
		tags: ['Audio', 'Lossless', 'Uncompressed'],
		conditions: [
			{
				name: 'PCM',
				type: 'release_title',
				// Profilarr pattern: \b(l?)PCM(\b|\d)
				pattern: '\\bL?PCM\\b',
				required: true,
				negate: false
			}
		]
	},

	// =========================================================================
	// FLAC (Lossless compression)
	// =========================================================================
	{
		id: 'audio-flac',
		name: 'FLAC',
		description: 'FLAC lossless audio',
		category: 'audio',
		tags: ['Audio', 'Lossless'],
		conditions: [
			{
				name: 'FLAC',
				type: 'release_title',
				// Profilarr pattern: \bFLAC(\b|\d)
				pattern: '\\bFLAC\\b',
				required: true,
				negate: false
			},
			// Negate other codecs
			{
				name: 'Not AAC',
				type: 'release_title',
				pattern: '\\bAAC\\b',
				required: true,
				negate: true
			},
			{
				name: 'Not Dolby Digital',
				type: 'release_title',
				pattern: '\\bDolby[ ._-]?Digital\\b',
				required: true,
				negate: true
			},
			{
				name: 'Not DD+',
				type: 'release_title',
				pattern: '\\b(DD[P+]|E[ ._-]?AC[ ._-]?3)\\b',
				required: true,
				negate: true
			},
			{
				name: 'Not DTS',
				type: 'release_title',
				pattern: '\\bDTS\\b',
				required: true,
				negate: true
			},
			{
				name: 'Not PCM',
				type: 'release_title',
				pattern: '\\bL?PCM\\b',
				required: true,
				negate: true
			},
			{
				name: 'Not TrueHD',
				type: 'release_title',
				pattern: '\\bTrue[ ._-]?HD\\b',
				required: true,
				negate: true
			}
		]
	}
];

// =============================================================================
// ATMOS MODIFIER (Stackable - scored independently)
// =============================================================================

/**
 * Atmos Modifier Formats
 * These stack ON TOP of the base codec score
 * Example: TrueHD Atmos = TrueHD score + Atmos score
 */
export const ATMOS_FORMATS: CustomFormat[] = [
	{
		id: 'audio-atmos',
		name: 'Atmos',
		description: 'Dolby Atmos object-based audio (stackable modifier)',
		category: 'audio',
		tags: ['Audio', 'Atmos', 'Dolby', 'Object Audio'],
		conditions: [
			{
				name: 'Atmos',
				type: 'release_title',
				// Profilarr pattern: \bATMOS|DDPA(\b|\d)
				pattern: '\\bAtmos\\b',
				required: false,
				negate: false
			},
			{
				name: 'Atmos (BTN Standard)',
				type: 'release_title',
				// BTN naming: TrueHDA7.1 = TrueHD Atmos 7.1
				pattern: '\\bTrue[ ._-]?HDA[ ._-]?[57]\\.1',
				required: false,
				negate: false
			},
			{
				name: 'DDPA (DD+ Atmos)',
				type: 'release_title',
				// DDPA = Dolby Digital Plus Atmos
				pattern: '\\bDDPA',
				required: false,
				negate: false
			}
		]
	},
	{
		id: 'audio-atmos-missing',
		name: 'Atmos (Missing)',
		description: 'Detects Atmos in releases with non-standard labeling',
		category: 'audio',
		tags: ['Audio', 'Atmos', 'Dolby', 'Missing'],
		conditions: [
			// 2160p releases from certain groups often have Atmos without explicit label
			{
				name: '2160p',
				type: 'resolution',
				resolution: '2160p',
				required: true,
				negate: false
			},
			// BTN Atmos naming convention
			{
				name: 'BTN Atmos Convention',
				type: 'release_title',
				pattern: '\\bTrue[ ._-]?HDA[ ._-]?[57]\\.1',
				required: true,
				negate: false
			},
			// Not standard Atmos label
			{
				name: 'Not Standard Atmos',
				type: 'release_title',
				pattern: '\\bAtmos\\b',
				required: true,
				negate: true
			}
		]
	}
];

// =============================================================================
// HIGH QUALITY LOSSY CODECS
// =============================================================================

/**
 * High Quality Lossy Audio Formats
 */
export const HQ_LOSSY_AUDIO_FORMATS: CustomFormat[] = [
	// =========================================================================
	// DTS-HD HRA (High Resolution Audio, lossy)
	// =========================================================================
	{
		id: 'audio-dts-hd-hra',
		name: 'DTS-HD HRA',
		description: 'DTS-HD High Resolution Audio',
		category: 'audio',
		tags: ['Audio', 'Lossy', 'DTS', 'High Quality'],
		conditions: [
			{
				name: 'DTS-HD HRA',
				type: 'release_title',
				// Profilarr pattern: dts[-. ]?(hd[. ]?)?(hra?|hi\b)
				pattern: '\\bDTS[ ._-]?(HD[ ._-]?)?(HRA?|Hi)\\b',
				required: true,
				negate: false
			},
			// Negate other DTS variants
			{
				name: 'Not DTS-HD MA',
				type: 'release_title',
				pattern: '\\bDTS[ ._-]?(HD[ ._-]?)?MA\\b',
				required: true,
				negate: true
			},
			{
				name: 'Not DTS-X',
				type: 'release_title',
				pattern: '\\bDTS[ ._-]?X\\b',
				required: true,
				negate: true
			}
		]
	},

	// =========================================================================
	// DTS-ES (Extended Surround, legacy)
	// =========================================================================
	{
		id: 'audio-dts-es',
		name: 'DTS-ES',
		description: 'DTS Extended Surround (6.1)',
		category: 'audio',
		tags: ['Audio', 'Lossy', 'DTS', 'Legacy'],
		conditions: [
			{
				name: 'DTS-ES',
				type: 'release_title',
				// Profilarr pattern: dts[-. ]?es\b
				pattern: '\\bDTS[ ._-]?ES\\b',
				required: true,
				negate: false
			}
		]
	},

	// =========================================================================
	// Opus (Modern efficient lossy)
	// =========================================================================
	{
		id: 'audio-opus',
		name: 'Opus',
		description: 'Opus audio codec (modern, efficient)',
		category: 'audio',
		tags: ['Audio', 'Lossy', 'Modern', 'Efficient'],
		conditions: [
			{
				name: 'Opus',
				type: 'release_title',
				// Profilarr pattern: \bOPUS(\b|\d)(?!.*[ ._-](\d{3,4}p))
				// Avoid matching "Opus" as movie title before resolution
				pattern: '\\bOpus\\b(?!.*\\d{3,4}p)',
				required: true,
				negate: false
			}
		]
	}
];

// =============================================================================
// STANDARD LOSSY CODECS
// =============================================================================

/**
 * Standard Lossy Audio Formats
 */
export const STANDARD_AUDIO_FORMATS: CustomFormat[] = [
	// =========================================================================
	// Dolby Digital Plus (E-AC-3)
	// =========================================================================
	{
		id: 'audio-ddplus',
		name: 'Dolby Digital Plus',
		description: 'Dolby Digital Plus (E-AC-3)',
		category: 'audio',
		tags: ['Audio', 'Lossy', 'Dolby'],
		conditions: [
			{
				name: 'DD+/EAC3',
				type: 'release_title',
				// Profilarr pattern: \bDD[P+]|\b(e[-_. ]?ac3)\b
				pattern:
					'\\bDD[P+]|\\bE[ ._-]?AC[ ._-]?3\\b|\\bEAC3\\b|\\bDolby[ ._-]?Digital[ ._-]?Plus\\b',
				required: true,
				negate: false
			},
			// Negate other codecs
			{
				name: 'Not AAC',
				type: 'release_title',
				pattern: '\\bAAC\\b',
				required: true,
				negate: true
			},
			{
				name: 'Not DTS',
				type: 'release_title',
				pattern: '\\bDTS\\b',
				required: true,
				negate: true
			},
			{
				name: 'Not FLAC',
				type: 'release_title',
				pattern: '\\bFLAC\\b',
				required: true,
				negate: true
			},
			{
				name: 'Not PCM',
				type: 'release_title',
				pattern: '\\bL?PCM\\b',
				required: true,
				negate: true
			},
			{
				name: 'Not TrueHD',
				type: 'release_title',
				pattern: '\\bTrue[ ._-]?HD\\b',
				required: true,
				negate: true
			}
		]
	},

	// =========================================================================
	// DTS (Basic)
	// =========================================================================
	{
		id: 'audio-dts',
		name: 'DTS',
		description: 'Standard DTS audio',
		category: 'audio',
		tags: ['Audio', 'Lossy', 'DTS'],
		conditions: [
			{
				name: 'DTS',
				type: 'release_title',
				// Profilarr pattern: DTS[ .]?[1-9] (basic DTS with channel number)
				pattern: '\\bDTS\\b',
				required: true,
				negate: false
			},
			// Negate all DTS variants
			{
				name: 'Not DTS-HD',
				type: 'release_title',
				pattern: '\\bDTS[ ._-]?HD\\b',
				required: true,
				negate: true
			},
			{
				name: 'Not DTS-X',
				type: 'release_title',
				pattern: '\\bDTS[ ._-]?X\\b',
				required: true,
				negate: true
			},
			{
				name: 'Not DTS-ES',
				type: 'release_title',
				pattern: '\\bDTS[ ._-]?ES\\b',
				required: true,
				negate: true
			},
			{
				name: 'Not DTS-MA',
				type: 'release_title',
				pattern: '\\bDTS[ ._-]?MA\\b',
				required: true,
				negate: true
			}
		]
	},

	// =========================================================================
	// Dolby Digital (AC-3)
	// =========================================================================
	{
		id: 'audio-dd',
		name: 'Dolby Digital',
		description: 'Dolby Digital (AC-3)',
		category: 'audio',
		tags: ['Audio', 'Lossy', 'Dolby'],
		conditions: [
			{
				name: 'DD/AC3',
				type: 'release_title',
				// Profilarr pattern: \bDD[^a-z+]|(?<!e)ac3
				pattern: '\\bDD[ ._]?[0-9]|\\bAC[ ._-]?3\\b|\\bDolby[ ._-]?Digital\\b',
				required: true,
				negate: false
			},
			{
				name: 'Not DD+',
				type: 'release_title',
				pattern: '\\bDD[P+]|\\bE[ ._-]?AC[ ._-]?3\\b|\\bDolby[ ._-]?Digital[ ._-]?Plus\\b',
				required: true,
				negate: true
			}
		]
	},

	// =========================================================================
	// AAC
	// =========================================================================
	{
		id: 'audio-aac',
		name: 'AAC',
		description: 'Advanced Audio Coding',
		category: 'audio',
		tags: ['Audio', 'Lossy'],
		conditions: [
			{
				name: 'AAC',
				type: 'release_title',
				pattern: '\\bAAC\\b',
				required: true,
				negate: false
			}
		]
	},

	// =========================================================================
	// MP3
	// =========================================================================
	{
		id: 'audio-mp3',
		name: 'MP3',
		description: 'MP3 audio (low quality)',
		category: 'audio',
		tags: ['Audio', 'Lossy', 'Low Quality'],
		conditions: [
			{
				name: 'MP3',
				type: 'release_title',
				pattern: '\\bMP3\\b',
				required: true,
				negate: false
			}
		]
	}
];

// =============================================================================
// LOSSLESS AUDIO GROUP FORMAT (for penalizing in non-2160p)
// =============================================================================

/**
 * Lossless Audio (Grouped)
 * Matches any lossless audio track NOT in 2160p releases
 * Used by some profiles to penalize lossless audio in lower resolutions
 */
export const LOSSLESS_AUDIO_GROUP: CustomFormat = {
	id: 'audio-lossless-group',
	name: 'Lossless Audio',
	description: 'Matches any lossless audio track not in 2160p (for size-conscious profiles)',
	category: 'audio',
	tags: ['Audio', 'Lossless', 'Group'],
	conditions: [
		{
			name: 'Not 2160p',
			type: 'resolution',
			resolution: '2160p',
			required: true,
			negate: true
		},
		{
			name: 'DTS-HD MA',
			type: 'release_title',
			pattern: '\\bDTS[ ._-]?(HD[ ._-]?)?MA\\b',
			required: false,
			negate: false
		},
		{
			name: 'DTS-X',
			type: 'release_title',
			pattern: '\\bDTS[ ._-]?X\\b',
			required: false,
			negate: false
		},
		{
			name: 'PCM',
			type: 'release_title',
			pattern: '\\bL?PCM\\b',
			required: false,
			negate: false
		},
		{
			name: 'TrueHD',
			type: 'release_title',
			pattern: '\\bTrue[ ._-]?HD\\b',
			required: false,
			negate: false
		}
	]
};

// =============================================================================
// ALL AUDIO FORMATS
// =============================================================================

/**
 * All audio formats combined
 */
export const ALL_AUDIO_FORMATS: CustomFormat[] = [
	...LOSSLESS_AUDIO_FORMATS,
	...ATMOS_FORMATS,
	...HQ_LOSSY_AUDIO_FORMATS,
	...STANDARD_AUDIO_FORMATS,
	LOSSLESS_AUDIO_GROUP
];
