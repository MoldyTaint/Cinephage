/**
 * Combined audio + subtitle language profile model.
 *
 * One profile per media item expresses ordered audio preferences and ordered
 * subtitle requirements. Forced/HI intent is part of each requirement tuple,
 * which prevents contradictory boolean combinations.
 */

import type { LanguageTag } from './languages.js';

export type SubtitleVariant = 'regular' | 'forced' | 'both';

export type SubtitleAccessibility = 'any' | 'prefer-hi' | 'require-hi' | 'exclude-hi';

export interface AudioPreference {
	/** Prefer the media's original audio track when choosing releases/sources */
	preferOriginal: boolean;
	/** Ordered fallback audio languages; empty means no preference */
	languages: LanguageTag[];
}

export interface SubtitleRequirement {
	tag: LanguageTag;
	variant: SubtitleVariant;
	accessibility: SubtitleAccessibility;
}

export interface LanguageProfileV2 {
	id: string;
	name: string;
	audio: AudioPreference;
	subtitles: SubtitleRequirement[];
	/** Stop acquiring after the requirement at this rank is satisfied */
	cutoffRank: number | null;
	/** Normalized 0-100 threshold shared by movies and episodes */
	minimumScore: number;
	upgradesAllowed: boolean;
}

export const DEFAULT_MINIMUM_SCORE = 70;

/** Create a complete default profile body (id is assigned by persistence). */
export function makeLanguageProfile(name: string): Omit<LanguageProfileV2, 'id'> {
	return {
		name,
		audio: { preferOriginal: true, languages: [] },
		subtitles: [{ tag: 'en', variant: 'regular', accessibility: 'any' }],
		cutoffRank: null,
		minimumScore: DEFAULT_MINIMUM_SCORE,
		upgradesAllowed: true
	};
}

/** Stable identity for a subtitle requirement, used for dedupe and state keys. */
export function requirementKey(requirement: SubtitleRequirement): string {
	return `${requirement.tag}|${requirement.variant}|${requirement.accessibility}`;
}
