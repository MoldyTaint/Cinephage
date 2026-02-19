/**
 * Quality Module Types
 *
 * Types for quality presets and filtering
 */

import type { Resolution, Source } from '../indexers/parser/types.js';

/**
 * Score components breakdown for transparency
 * Only includes intrinsic quality factors that persist with the file
 */
export interface ScoreComponents {
	/** Raw score from scoring engine (unbounded, profile-dependent) */
	rawQualityScore: number;
	/** Quality score normalized to 0-1000 range */
	normalizedQualityScore: number;
	/** Bonus for PROPER/REPACK (0-20) */
	enhancementBonus: number;
	/** Bonus for season/series packs (0-100) */
	packBonus: number;
	/** Penalty for hardcoded subs (-50 to 0) */
	hardcodedSubsPenalty: number;
	/** Final combined score */
	totalScore: number;
}

/**
 * Quality preset from database
 */
export interface QualityPreset {
	id: string;
	name: string;
	minResolution: Resolution | null;
	preferredResolution: Resolution | null;
	maxResolution: Resolution | null;
	allowedSources: Source[] | null;
	excludedSources: Source[] | null;
	preferHdr: boolean;
	isDefault: boolean;
	minSizeMb: number | null;
	maxSizeMb: number | null;
}

/**
 * Result of matching a release against a quality preset
 */
export interface QualityMatchResult {
	/** Whether the release meets minimum requirements */
	accepted: boolean;
	/** Reason for rejection if not accepted */
	rejectionReason?: string;
	/** Quality score (0-1000, higher = better) - this is the normalized quality score */
	score: number;
	/** Raw score from scoring engine (unbounded) for advanced users */
	rawScore?: number;
	/** Detailed score breakdown (legacy format) */
	scoreBreakdown: {
		resolution: number;
		source: number;
		codec: number;
		hdr: number;
		audio: number;
	};
}

/**
 * Default quality preset definitions (keyed by ID)
 */
export const DEFAULT_PRESETS: Record<string, QualityPreset> = {
	any: {
		id: 'any',
		name: 'Any',
		minResolution: null,
		preferredResolution: null,
		maxResolution: null,
		allowedSources: null,
		excludedSources: ['cam', 'telesync', 'telecine'],
		preferHdr: false,
		isDefault: true,
		minSizeMb: null,
		maxSizeMb: null
	},
	'720p': {
		id: '720p',
		name: '720p+',
		minResolution: '720p',
		preferredResolution: '1080p',
		maxResolution: null,
		allowedSources: null,
		excludedSources: ['cam', 'telesync', 'telecine', 'screener', 'dvd'],
		preferHdr: false,
		isDefault: false,
		minSizeMb: null,
		maxSizeMb: null
	},
	'1080p': {
		id: '1080p',
		name: '1080p+',
		minResolution: '1080p',
		preferredResolution: '1080p',
		maxResolution: null,
		allowedSources: ['remux', 'bluray', 'webdl', 'webrip'],
		excludedSources: null,
		preferHdr: false,
		isDefault: false,
		minSizeMb: null,
		maxSizeMb: null
	},
	'4k': {
		id: '4k',
		name: '4K',
		minResolution: '2160p',
		preferredResolution: '2160p',
		maxResolution: null,
		allowedSources: ['remux', 'bluray', 'webdl', 'webrip'],
		excludedSources: null,
		preferHdr: true,
		isDefault: false,
		minSizeMb: null,
		maxSizeMb: null
	},
	'4k-hdr': {
		id: '4k-hdr',
		name: '4K HDR',
		minResolution: '2160p',
		preferredResolution: '2160p',
		maxResolution: null,
		allowedSources: ['remux', 'bluray', 'webdl'],
		excludedSources: null,
		preferHdr: true,
		isDefault: false,
		minSizeMb: null,
		maxSizeMb: null
	}
};
