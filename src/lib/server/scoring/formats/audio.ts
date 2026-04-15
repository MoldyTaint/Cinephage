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
				type: 'audio_codec',
				audioCodec: 'truehd',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'audio-truehd-missing',
		name: 'TrueHD (Missing)',
		description: 'Detects TrueHD releases with BTN-style TrueHDA naming',
		category: 'audio',
		tags: ['Audio', 'Lossless', 'Dolby', 'Missing'],
		conditions: [
			{
				name: 'TrueHDA (BTN)',
				type: 'release_title',
				pattern: '\\bTrue[ ._-]?HDA[ ._-]?[57]\\.1',
				required: false,
				negate: false
			},
			{
				name: '2160p',
				type: 'resolution',
				resolution: '2160p',
				required: true,
				negate: false
			},
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
				type: 'audio_codec',
				audioCodec: 'dts-x',
				required: true,
				negate: false
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
				type: 'audio_codec',
				audioCodec: 'dts-hdma',
				required: true,
				negate: false
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
				type: 'audio_codec',
				audioCodec: 'pcm',
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
				type: 'audio_codec',
				audioCodec: 'flac',
				required: true,
				negate: false
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
				type: 'audio_atmos',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'audio-atmos-missing',
		name: 'Atmos (Missing)',
		description: 'Detects Atmos in BTN-style TrueHDA releases without explicit Atmos tag',
		category: 'audio',
		tags: ['Audio', 'Atmos', 'Dolby', 'Missing'],
		conditions: [
			{
				name: '2160p',
				type: 'resolution',
				resolution: '2160p',
				required: true,
				negate: false
			},
			{
				name: 'BTN Atmos Convention',
				type: 'release_title',
				pattern: '\\bTrue[ ._-]?HDA[ ._-]?[57]\\.1',
				required: true,
				negate: false
			},
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
				type: 'audio_codec',
				audioCodec: 'dts-hd-hra',
				required: true,
				negate: false
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
				type: 'audio_codec',
				audioCodec: 'dts-es',
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
				type: 'audio_codec',
				audioCodec: 'opus',
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
				type: 'audio_codec',
				audioCodec: 'dd+',
				required: true,
				negate: false
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
				type: 'audio_codec',
				audioCodec: 'dts',
				required: true,
				negate: false
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
				type: 'audio_codec',
				audioCodec: 'dd',
				required: true,
				negate: false
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
				type: 'audio_codec',
				audioCodec: 'aac',
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
				type: 'audio_codec',
				audioCodec: 'mp3',
				required: true,
				negate: false
			}
		]
	}
];

// =============================================================================
// AUDIO CHANNEL FORMATS
// =============================================================================

export const AUDIO_CHANNEL_FORMATS: CustomFormat[] = [
	{
		id: 'audio-channels-71',
		name: '7.1 Channels',
		description: 'Eight channel audio layout (7.1)',
		category: 'audio',
		tags: ['Audio', 'Channels', '7.1'],
		conditions: [
			{
				name: '7.1 Channels',
				type: 'audio_channels',
				audioChannels: '7.1',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'audio-channels-51',
		name: '5.1 Channels',
		description: 'Six channel surround audio layout (5.1)',
		category: 'audio',
		tags: ['Audio', 'Channels', '5.1'],
		conditions: [
			{
				name: '5.1 Channels',
				type: 'audio_channels',
				audioChannels: '5.1',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'audio-channels-20',
		name: '2.0 Channels',
		description: 'Stereo audio layout (2.0)',
		category: 'audio',
		tags: ['Audio', 'Channels', '2.0'],
		conditions: [
			{
				name: '2.0 Channels',
				type: 'audio_channels',
				audioChannels: '2.0',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'audio-channels-10',
		name: '1.0 Channels',
		description: 'Mono audio layout (1.0)',
		category: 'audio',
		tags: ['Audio', 'Channels', '1.0'],
		conditions: [
			{
				name: '1.0 Channels',
				type: 'audio_channels',
				audioChannels: '1.0',
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
	...AUDIO_CHANNEL_FORMATS,
	LOSSLESS_AUDIO_GROUP
];
