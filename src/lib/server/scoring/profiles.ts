/**
 * Built-in Scoring Profiles
 *
 * Philosophy: Formats DETECT, Profiles SCORE.
 *
 * Four profiles with distinct philosophies:
 *
 * - Quality: Maximum quality, no compromise. Remux, lossless audio, HDR, top groups.
 * - Balanced: High quality with efficient encoding. x265/AV1, good encodes, reasonable size.
 * - Compact: Small files with decent quality. Micro encoders, lossy audio acceptable.
 * - Streamer: Streaming-only via .strm files. No downloads.
 *
 * Group scoring philosophy:
 * - Profiles include scores for NOTABLE groups that embody the profile's philosophy
 * - Not every group needs a score - unscored groups get 0 (neutral)
 * - Users can customize any group score in their own profiles
 */

import type { ScoringProfile } from './types.js';
import { BANNED_SCORE, DEFAULT_RESOLUTION_ORDER } from './types.js';

// =============================================================================
// Shared Constants
// =============================================================================

/**
 * Banned formats applied to ALL profiles
 * These are deceptive, unusable, or unwanted content that should always be blocked
 */
const UNIVERSAL_BANNED_FORMATS: Record<string, number> = {
	// Deceptive groups (retagging, fake HDR)
	'banned-aroma': BANNED_SCORE,
	'banned-lama': BANNED_SCORE,
	'banned-telly': BANNED_SCORE,
	'banned-vd0n': BANNED_SCORE,
	'banned-bitor': BANNED_SCORE,
	'banned-visionxpert': BANNED_SCORE,
	'banned-sasukeduck': BANNED_SCORE,
	'banned-jennaortegauhd': BANNED_SCORE,

	// Unusable sources
	'banned-cam': BANNED_SCORE,
	'banned-telesync': BANNED_SCORE,
	'banned-telecine': BANNED_SCORE,
	'banned-screener': BANNED_SCORE,

	// Unwanted content
	'banned-extras': BANNED_SCORE,
	'banned-sample': BANNED_SCORE,

	// Technical issues
	'banned-upscaled': BANNED_SCORE,
	'banned-ai-tv': BANNED_SCORE,
	'banned-ai-movie': BANNED_SCORE,
	'banned-full-disc': BANNED_SCORE,
	'banned-xvid': BANNED_SCORE
};

// =============================================================================
// Quality Profile - Maximum Quality
// =============================================================================

/**
 * Quality Profile: Absolute best quality, no compromise
 *
 * Target: 4K Remux with lossless audio and HDR
 * - Remux > Encode (preserves original quality)
 * - Lossless audio (TrueHD, DTS-HD MA) highly valued
 * - HDR/DV essential for 4K content
 * - Top-tier encoding groups valued
 * - File size is not a concern
 *
 * Ideal for: Home theater enthusiasts, quality purists, unlimited storage
 */
export const QUALITY_PROFILE: ScoringProfile = {
	id: 'quality',
	name: 'Quality',
	description: 'Maximum quality - Remux, lossless audio, HDR, no compromise',
	tags: ['quality', 'remux', 'lossless', '4k', 'hdr'],
	icon: 'Star',
	color: 'text-yellow-500',
	category: 'quality',
	upgradesAllowed: true,
	minScore: 0,
	upgradeUntilScore: 100000,
	minScoreIncrement: 500,
	resolutionOrder: DEFAULT_RESOLUTION_ORDER,
	allowedProtocols: ['torrent', 'usenet'],
	formatScores: {
		// ===========================================
		// Resolution + Source (Primary scoring factor)
		// ===========================================
		// 4K - Highest priority
		'2160p-remux': 25000,
		'2160p-bluray': 18000,
		'2160p-webdl': 12000,
		'2160p-webrip': 8000,

		// 1080p - Good quality tier
		'1080p-remux': 15000,
		'1080p-bluray': 10000,
		'1080p-webdl': 6000,
		'1080p-webdl-hevc': 6500,
		'1080p-webrip': 4000,
		'1080p-hdtv': 2000,

		// 720p - Acceptable
		'720p-bluray': 4000,
		'720p-webdl': 2500,
		'720p-webrip': 1500,
		'720p-hdtv': 1000,

		// SD - Last resort
		'576p-bluray': 800,
		'576p-webdl': 600,
		'576p-dvd': 400,
		'480p-webdl': 300,
		dvd: 200,
		'dvd-remux': 500,

		// ===========================================
		// Audio - Lossless highly valued
		// ===========================================
		'audio-truehd': 3000,
		'audio-dts-x': 3500,
		'audio-dts-hdma': 2800,
		'audio-pcm': 2500,
		'audio-flac': 2200,

		// HQ Lossy - Good alternatives
		'audio-atmos': 2000,
		'audio-dts-hd-hra': 1200,
		'audio-dts-es': 800,
		'audio-opus': 600,
		'audio-ddplus': 1000,
		'audio-dts': 600,
		'audio-dd': 500,

		// Standard - Acceptable
		'audio-aac': 200,
		'audio-mp3': 100,

		// ===========================================
		// HDR - Essential for 4K
		// ===========================================
		'hdr-dolby-vision': 3000,
		'hdr-dolby-vision-no-fallback': 2000,
		'hdr-hdr10plus': 2500,
		'hdr-hdr10': 2000,
		'hdr-generic': 1500,
		'hdr-hlg': 1000,
		'hdr-pq': 800,
		'hdr-sdr': 0,

		// ===========================================
		// Release Groups - Top tier valued
		// ===========================================
		// Premier remux groups
		'group-framestor': 3000,
		'group-cinephiles': 2500,
		'group-epsilon': 2200,
		'group-sicfoi': 2000,
		'group-wildcat': 1800,
		'group-bluranium': 1600,
		'group-bizkit': 1400,
		'group-3l': 1200,

		// Top encode groups
		'group-don': 2500,
		'group-d-z0n3': 2500,
		'group-ebp': 2200,
		'group-ctrlhd': 2000,
		'group-decibel': 2000,
		'group-playbd': 1800,
		'group-ea': 1600,
		'group-hifi': 1400,

		// Quality 4K groups
		'group-sa89': 2000,
		'group-reborn': 2000,
		'group-solar': 1800,
		'group-hqmux': 1600,
		'group-ift': 1600,
		'group-zq': 1400,
		'group-w4nk3r': 1200,

		// Quality WEB-DL groups
		'group-ntb': 1400,
		'group-ntg': 1200,
		'group-flux': 1000,
		'group-cmrg': 800,
		'group-thefarm': 1000,

		// Efficient encoders (less valued in Quality - not lossless)
		'group-tigole': 400,
		'group-qxr': 300,
		'group-taoe': 200,

		// Micro encoders (heavily penalized - sacrifices quality)
		'group-yts': -8000,
		'group-yify': -8000,
		'group-rarbg': -1000,
		'group-psa': -2000,
		'group-galaxyrg': -2000,

		// Low quality groups (penalized)
		'group-nahom': -3000,
		'group-nogroup': -3000,
		'group-stuttershit': -3000,

		// ===========================================
		// Streaming Services - Premium valued
		// ===========================================
		'streaming-atvp': 800,
		'streaming-amzn': 600,
		'streaming-nf': 600,
		'streaming-dsnp': 600,
		'streaming-hmax': 500,
		'streaming-max': 500,
		'streaming-bcore': 700,
		'streaming-crit': 600,
		'streaming-mubi': 500,

		// ===========================================
		// Editions & Enhancements
		// ===========================================
		'edition-imax-enhanced': 1000,
		'edition-imax': 600,
		'edition-criterion': 800,
		'edition-directors-cut': 400,
		'edition-extended': 300,
		'edition-remastered': 400,
		'edition-theatrical': 100,
		'edition-unrated': 200,
		'edition-open-matte': 300,
		'edition-hybrid': 400,
		'edition-final-cut': 300,

		'repack-3': 800,
		'repack-2': 600,
		'repack-1': 400,
		proper: 400,

		// Codecs
		'codec-x265': 300,
		'codec-x264': 100,
		'codec-av1': 500,

		// 3D - Penalized (not banned, but usually unwanted)
		'banned-3d': -5000,

		// x264 at 2160p - Penalized (inefficient)
		'banned-x264-2160p': -10000,

		// Banned formats
		...UNIVERSAL_BANNED_FORMATS
	}
};

// =============================================================================
// Balanced Profile - Quality with Efficient Encoding
// =============================================================================

/**
 * Balanced Profile: High quality with efficient encoding
 *
 * Target: Quality x265/AV1 encodes with good audio
 * - Encodes > Remux (efficient use of space)
 * - x265/AV1 highly valued for efficiency
 * - DD+ Atmos over TrueHD (transparent at smaller size)
 * - Quality encode groups prioritized
 *
 * Ideal for: Quality-conscious users with reasonable storage
 */
export const BALANCED_PROFILE: ScoringProfile = {
	id: 'balanced',
	name: 'Balanced',
	description: 'High quality with efficient encoding - x265/AV1, quality groups',
	tags: ['quality', 'efficient', 'x265', 'av1'],
	icon: 'Zap',
	color: 'text-green-500',
	category: 'efficient',
	upgradesAllowed: true,
	minScore: 0,
	upgradeUntilScore: 30000,
	minScoreIncrement: 100,
	resolutionOrder: DEFAULT_RESOLUTION_ORDER,
	allowedProtocols: ['torrent', 'usenet'],
	formatScores: {
		// ===========================================
		// Resolution + Source (Encodes preferred)
		// ===========================================
		// 4K - Encodes preferred over Remux
		'2160p-bluray': 20000,
		'2160p-webdl': 18000,
		'2160p-webrip': 14000,
		'2160p-remux': 12000, // Lower than encode (too big)

		// 1080p - Sweet spot for Balanced
		'1080p-bluray': 12000,
		'1080p-webdl-hevc': 14000, // HEVC bonus
		'1080p-webdl': 10000,
		'1080p-webrip': 8000,
		'1080p-hdtv': 4000,
		'1080p-remux': 6000, // Lower than encode

		// 720p
		'720p-webdl': 5000,
		'720p-webrip': 4000,
		'720p-bluray': 4500,
		'720p-hdtv': 2500,

		// SD
		'576p-webdl': 1500,
		'576p-bluray': 1200,
		'576p-dvd': 800,
		'480p-webdl': 600,
		dvd: 400,
		'dvd-remux': 300,

		// ===========================================
		// Audio - Efficient formats valued
		// ===========================================
		// HQ Lossy preferred for efficiency
		'audio-atmos': 2500,
		'audio-ddplus': 2000,
		'audio-opus': 1500,

		// Lossless - Good but not essential
		'audio-truehd': 1800,
		'audio-dts-x': 2000,
		'audio-dts-hdma': 1600,
		'audio-pcm': 1200,
		'audio-flac': 1400,

		// Standard lossy
		'audio-dts-hd-hra': 1200,
		'audio-dts-es': 800,
		'audio-dts': 600,
		'audio-dd': 800,
		'audio-aac': 500,
		'audio-mp3': 200,

		// ===========================================
		// HDR
		// ===========================================
		'hdr-dolby-vision': 2500,
		'hdr-dolby-vision-no-fallback': 1800,
		'hdr-hdr10plus': 2200,
		'hdr-hdr10': 1600,
		'hdr-generic': 1000,
		'hdr-hlg': 800,
		'hdr-pq': 600,
		'hdr-sdr': 0,

		// ===========================================
		// Release Groups - Efficient encoders highly valued
		// ===========================================
		// Efficient x265 masters
		'group-tigole': 4000,
		'group-qxr': 3500,
		'group-taoe': 3000,
		'group-darq': 2500,
		'group-dkore': 2500,
		'group-edge2020': 2200,
		'group-grimm': 2200,
		'group-lst': 2200,
		'group-nan0': 2200,
		'group-ralphy': 2200,
		'group-rcvr': 2200,
		'group-sampa': 2200,
		'group-silence': 2200,
		'group-tonato': 2200,
		'group-vialle': 2200,
		'group-vyndros': 2200,
		'group-yello': 2200,

		// Quality encode groups
		'group-don': 2000,
		'group-d-z0n3': 2000,
		'group-ebp': 1800,
		'group-ctrlhd': 1600,
		'group-decibel': 1600,
		'group-playbd': 1400,
		'group-ea': 1200,
		'group-hifi': 1000,

		// Remux groups (still good, just not optimal)
		'group-framestor': 1200,
		'group-cinephiles': 1000,
		'group-epsilon': 800,

		// WEB-DL groups
		'group-ntb': 1400,
		'group-ntg': 1200,
		'group-flux': 1000,
		'group-cmrg': 800,
		'group-thefarm': 1000,

		// Micro encoders (neutral to slight penalty)
		'group-rarbg': 500,
		'group-yts': -500,
		'group-yify': -500,
		'group-psa': 0,
		'group-galaxyrg': 200,

		// Low quality groups
		'group-nahom': -2000,
		'group-nogroup': -2000,
		'group-stuttershit': -2000,

		// ===========================================
		// Streaming Services
		// ===========================================
		'streaming-atvp': 900,
		'streaming-amzn': 700,
		'streaming-nf': 700,
		'streaming-dsnp': 600,
		'streaming-hmax': 600,
		'streaming-max': 600,
		'streaming-bcore': 800,
		'streaming-crit': 500,
		'streaming-mubi': 500,

		// ===========================================
		// Editions & Enhancements
		// ===========================================
		'edition-imax-enhanced': 1000,
		'edition-imax': 600,
		'edition-criterion': 600,
		'edition-directors-cut': 400,
		'edition-extended': 300,
		'edition-remastered': 400,
		'edition-theatrical': 100,
		'edition-hybrid': 500,

		'repack-3': 800,
		'repack-2': 600,
		'repack-1': 400,
		proper: 400,

		// Codecs - x265/AV1 highly valued
		'codec-x265': 3000,
		'codec-av1': 4000,
		'codec-x264': 0,

		// 3D
		'banned-3d': -5000,
		'banned-x264-2160p': -10000,

		// Banned formats
		...UNIVERSAL_BANNED_FORMATS
	}
};

// =============================================================================
// Compact Profile - Small Files, Decent Quality
// =============================================================================

/**
 * Compact Profile: Quality-focused micro encodes
 *
 * Target: Best quality in small packages (~1-4GB)
 * - Micro encoders are heroes (Tigole, QxR)
 * - x265/AV1 essential for efficiency
 * - Lossy audio is fine (AAC, DD+)
 * - Remux/lossless penalized (too big)
 *
 * Ideal for: Limited storage, large libraries, Plex/streaming to devices
 */
export const COMPACT_PROFILE: ScoringProfile = {
	id: 'compact',
	name: 'Compact',
	description: 'Small files with decent quality - micro encoders, efficient codecs',
	tags: ['compact', 'micro', 'efficient', 'small'],
	icon: 'Minimize2',
	color: 'text-purple-500',
	category: 'micro',
	upgradesAllowed: true,
	minScore: -5000,
	upgradeUntilScore: 15000,
	minScoreIncrement: 50,
	resolutionOrder: DEFAULT_RESOLUTION_ORDER,
	allowedProtocols: ['torrent', 'usenet'],
	formatScores: {
		// ===========================================
		// Resolution + Source (WEB preferred, Remux penalized)
		// ===========================================
		// 4K - WEB sources only (encodes too big)
		'2160p-webdl': 8000,
		'2160p-webrip': 10000,
		'2160p-bluray': 2000,
		'2160p-remux': -5000, // Way too big

		// 1080p - Primary target
		'1080p-webdl-hevc': 12000,
		'1080p-webrip': 10000,
		'1080p-webdl': 9000,
		'1080p-bluray': 7000,
		'1080p-hdtv': 6000,
		'1080p-remux': -3000, // Too big

		// 720p - Perfectly acceptable
		'720p-webdl': 7000,
		'720p-webrip': 6500,
		'720p-bluray': 5500,
		'720p-hdtv': 5000,

		// SD - Fine for space saving
		'576p-webdl': 4000,
		'576p-bluray': 3500,
		'576p-dvd': 3000,
		'480p-webdl': 3500,
		dvd: 2500,
		'dvd-remux': 2000,

		// ===========================================
		// Audio - Efficient formats preferred
		// ===========================================
		// Small/efficient preferred
		'audio-aac': 2000,
		'audio-opus': 2500,
		'audio-ddplus': 1500,
		'audio-dd': 1200,
		'audio-mp3': 1000,

		// Lossy surround
		'audio-atmos': 800,
		'audio-dts': 600,
		'audio-dts-es': 400,
		'audio-dts-hd-hra': 200,

		// Lossless - Penalized (too big)
		'audio-truehd': -500,
		'audio-dts-x': -600,
		'audio-dts-hdma': -400,
		'audio-pcm': -400,
		'audio-flac': -300,

		// ===========================================
		// HDR - Nice to have, not essential
		// ===========================================
		'hdr-dolby-vision': 800,
		'hdr-dolby-vision-no-fallback': 500,
		'hdr-hdr10plus': 700,
		'hdr-hdr10': 500,
		'hdr-generic': 300,
		'hdr-hlg': 200,
		'hdr-pq': 100,
		'hdr-sdr': 0,

		// ===========================================
		// Release Groups - Micro encoders are kings
		// ===========================================
		// Quality micro encoders
		'group-tigole': 8000,
		'group-qxr': 7000,
		'group-taoe': 5000,

		// Efficient x265 encoders
		'group-darq': 4500,
		'group-dkore': 4500,
		'group-edge2020': 4000,
		'group-grimm': 4000,
		'group-lst': 4000,
		'group-nan0': 4000,
		'group-ralphy': 4000,
		'group-rcvr': 4000,
		'group-sampa': 4000,
		'group-silence': 4000,
		'group-tonato': 4000,
		'group-vialle': 4000,
		'group-vyndros': 4000,
		'group-yello': 4000,

		// Public tracker micro encoders
		'group-rarbg': 4000,
		'group-yts': 3000,
		'group-yify': 2500,
		'group-psa': 3500,
		'group-galaxyrg': 3500,
		'group-megusta': 3000,
		'group-tgx': 2500,
		'group-etrg': 2500,
		'group-ettv': 2500,
		'group-eztv': 2500,
		'group-x0r': 2500,
		'group-ion10': 2500,

		// WEB-DL groups (good, usually reasonable size)
		'group-ntb': 2000,
		'group-ntg': 1800,
		'group-flux': 1500,
		'group-cmrg': 1200,
		'group-thefarm': 1500,

		// Quality encode groups (files might be big)
		'group-don': 500,
		'group-d-z0n3': 500,
		'group-ebp': 400,
		'group-ctrlhd': 400,

		// Remux groups (penalized - too big)
		'group-framestor': -1500,
		'group-cinephiles': -1200,
		'group-epsilon': -1000,

		// Low quality - Still acceptable in Compact (small files)
		'group-nahom': 500,
		'group-nogroup': 200,
		'group-stuttershit': 0,

		// ===========================================
		// Streaming Services
		// ===========================================
		'streaming-atvp': 500,
		'streaming-amzn': 400,
		'streaming-nf': 400,
		'streaming-dsnp': 400,
		'streaming-hmax': 300,
		'streaming-max': 300,

		// ===========================================
		// Editions & Enhancements
		// ===========================================
		'edition-imax-enhanced': 300,
		'edition-imax': 200,
		'edition-directors-cut': 100,
		'edition-extended': 100,
		'edition-remastered': 100,

		'repack-3': 400,
		'repack-2': 300,
		'repack-1': 200,
		proper: 200,

		// Codecs - x265/AV1 essential
		'codec-x265': 4000,
		'codec-av1': 5000,
		'codec-x264': 0,

		// 3D
		'banned-3d': -5000,
		'banned-x264-2160p': -8000,

		// Banned formats
		...UNIVERSAL_BANNED_FORMATS
	}
};

// =============================================================================
// Streamer Profile - Streaming Only
// =============================================================================

/**
 * Streamer Profile: Streaming-only via .strm files
 *
 * Target: Instant playback from streaming sources
 * - Only accepts streaming protocol releases
 * - Rejects torrents and usenet completely
 * - No local storage required
 *
 * Ideal for: Users who want streaming-only, no downloads
 */
export const STREAMER_PROFILE: ScoringProfile = {
	id: 'streamer',
	name: 'Streamer',
	description: 'Streaming-only via .strm files - instant playback, no downloads',
	tags: ['streaming', 'instant', 'strm', 'cloud'],
	icon: 'Play',
	color: 'text-cyan-500',
	category: 'streaming',
	upgradesAllowed: false,
	minScore: 0,
	upgradeUntilScore: 0,
	minScoreIncrement: 0,
	resolutionOrder: DEFAULT_RESOLUTION_ORDER,
	allowedProtocols: ['streaming'],
	formatScores: {
		// Streaming protocol is the only thing that matters
		'streaming-protocol': 50000,

		// Resolution preferences (if available)
		'2160p-webdl': 4000,
		'2160p-webrip': 3500,
		'1080p-webdl': 3000,
		'1080p-webrip': 2500,
		'720p-webdl': 2000,
		'720p-webrip': 1500,

		// HDR is nice
		'hdr-dolby-vision': 1000,
		'hdr-hdr10plus': 800,
		'hdr-hdr10': 600,

		// Banned formats - still apply
		...UNIVERSAL_BANNED_FORMATS
	}
};

// =============================================================================
// Exports
// =============================================================================

/**
 * All built-in profiles
 */
export const DEFAULT_PROFILES: ScoringProfile[] = [
	QUALITY_PROFILE,
	BALANCED_PROFILE,
	COMPACT_PROFILE,
	STREAMER_PROFILE
];

/**
 * Profile lookup by ID
 */
export const PROFILE_BY_ID: Map<string, ScoringProfile> = new Map(
	DEFAULT_PROFILES.map((p) => [p.id, p])
);

/**
 * Get a built-in profile by ID
 */
export function getProfile(id: string): ScoringProfile | undefined {
	return PROFILE_BY_ID.get(id);
}

/**
 * Get all built-in profile IDs
 */
export function getBuiltInProfileIds(): string[] {
	return DEFAULT_PROFILES.map((p) => p.id);
}

/**
 * Check if a profile ID is a built-in profile
 */
export function isBuiltInProfile(id: string): boolean {
	return PROFILE_BY_ID.has(id);
}
