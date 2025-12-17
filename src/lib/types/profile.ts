/**
 * Quality Profile Types
 *
 * Types for managing quality profiles
 */

import type { Resolution } from '$lib/server/scoring/types';

// =============================================================================
// Scoring Profile Types
// =============================================================================

/**
 * Profile category for UI grouping and styling
 */
export type ProfileCategory = 'quality' | 'efficient' | 'micro' | 'streaming' | 'custom';

/**
 * Base scoring profile structure
 *
 * Profiles are standalone - they define complete format->score mappings
 * without any runtime inheritance from base profiles.
 */
export interface ScoringProfile {
	id: string;
	name: string;
	description: string;
	tags: string[];
	/** Icon name for UI display (lucide icon) */
	icon?: string;
	/** Color class for UI display (e.g., 'text-yellow-500') */
	color?: string;
	/** Category for grouping in the UI */
	category?: ProfileCategory;
	upgradesAllowed: boolean;
	minScore: number;
	upgradeUntilScore: number;
	minScoreIncrement: number;
	resolutionOrder: Resolution[];
	/** Format score mappings (formatId -> score). All scores are defined here. */
	formatScores: Record<string, number>;
	isDefault: boolean;
	isBuiltIn?: boolean;
	// Media-specific file size limits
	movieMinSizeGb?: number | null;
	movieMaxSizeGb?: number | null;
	episodeMinSizeMb?: number | null;
	episodeMaxSizeMb?: number | null;
	createdAt?: string;
	updatedAt?: string;
}

/**
 * Form data for creating/updating scoring profiles
 */
export interface ScoringProfileFormData {
	id?: string;
	name: string;
	description?: string;
	/** Copy format scores from this profile (built-in or custom ID) */
	copyFromId?: string;
	tags?: string[];
	upgradesAllowed?: boolean;
	minScore?: number;
	upgradeUntilScore?: number;
	minScoreIncrement?: number;
	resolutionOrder?: Resolution[];
	formatScores?: Record<string, number>;
	isDefault?: boolean;
	movieMinSizeGb?: number | null;
	movieMaxSizeGb?: number | null;
	episodeMinSizeMb?: number | null;
	episodeMaxSizeMb?: number | null;
}

// =============================================================================
// Custom Format Types (for UI)
// =============================================================================

/**
 * Format category for grouping in the UI
 */
export type FormatCategory =
	| 'resolution'
	| 'release_group_tier'
	| 'audio'
	| 'hdr'
	| 'streaming'
	| 'micro'
	| 'banned'
	| 'enhancement'
	| 'codec'
	| 'other';

/**
 * Custom format for display in the profile editor
 *
 * Note: Formats no longer have defaultScore. Scores are defined per-profile.
 */
export interface CustomFormatUI {
	id: string;
	name: string;
	description?: string;
	category: FormatCategory;
	tags: string[];
	score?: number; // Current score in the selected profile
}

/**
 * Grouped formats by category for the UI
 */
export interface GroupedFormats {
	category: FormatCategory;
	label: string;
	formats: CustomFormatUI[];
}

// =============================================================================
// API Response Types
// =============================================================================

export interface ScoringProfilesResponse {
	profiles: ScoringProfile[];
	count: number;
}
