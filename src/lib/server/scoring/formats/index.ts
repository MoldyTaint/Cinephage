/**
 * Format Registry Index
 *
 * Exports all custom format definitions organized by category.
 * The scoring engine uses these formats to match and score releases.
 *
 * Philosophy: Formats DETECT, Profiles SCORE.
 * - No quality judgments in formats - just detection
 * - Users assign scores in their profiles based on preferences
 */

// Re-export all formats by category
export * from './resolution.js';
export * from './groups.js';
export * from './audio.js';
export * from './hdr.js';
export * from './streaming.js';
export * from './banned.js';
export * from './enhancement.js';

// Import for aggregation
import { ALL_RESOLUTION_FORMATS } from './resolution.js';
import { ALL_GROUP_TIER_FORMATS } from './groups.js';
import { ALL_AUDIO_FORMATS } from './audio.js';
import { ALL_HDR_FORMATS } from './hdr.js';
import { ALL_STREAMING_FORMATS } from './streaming.js';
import { ALL_BANNED_FORMATS } from './banned.js';
import { ALL_ENHANCEMENT_FORMATS } from './enhancement.js';

import type { CustomFormat } from '../types.js';

/**
 * All formats combined into a single registry
 */
export const ALL_FORMATS: CustomFormat[] = [
	...ALL_RESOLUTION_FORMATS,
	...ALL_GROUP_TIER_FORMATS,
	...ALL_AUDIO_FORMATS,
	...ALL_HDR_FORMATS,
	...ALL_STREAMING_FORMATS,
	...ALL_BANNED_FORMATS,
	...ALL_ENHANCEMENT_FORMATS
];

/**
 * Format lookup by ID
 */
export const FORMAT_BY_ID: Map<string, CustomFormat> = new Map(ALL_FORMATS.map((f) => [f.id, f]));

/**
 * Get a format by its ID
 */
export function getFormat(id: string): CustomFormat | undefined {
	return FORMAT_BY_ID.get(id);
}

/**
 * Get all formats in a category
 */
export function getFormatsByCategory(category: CustomFormat['category']): CustomFormat[] {
	return ALL_FORMATS.filter((f) => f.category === category);
}

/**
 * Get all formats with a specific tag
 */
export function getFormatsByTag(tag: string): CustomFormat[] {
	return ALL_FORMATS.filter((f) => f.tags.includes(tag));
}

/**
 * Summary of format counts by category
 */
export const FORMAT_COUNTS = {
	resolution: ALL_RESOLUTION_FORMATS.length,
	releaseGroups: ALL_GROUP_TIER_FORMATS.length,
	audio: ALL_AUDIO_FORMATS.length,
	hdr: ALL_HDR_FORMATS.length,
	streaming: ALL_STREAMING_FORMATS.length,
	banned: ALL_BANNED_FORMATS.length,
	enhancement: ALL_ENHANCEMENT_FORMATS.length,
	total: ALL_FORMATS.length
};
