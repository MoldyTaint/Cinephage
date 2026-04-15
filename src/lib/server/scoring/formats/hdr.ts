/**
 * HDR Format Definitions
 *
 * Defines HDR/color grading format matching for quality scoring.
 * Based on Profilarr/dictionarry patterns.
 *
 * Score Philosophy:
 * - Dolby Vision: best dynamic HDR format
 * - HDR10+: 2500 (excellent - dynamic metadata)
 * - HDR10: 2000 (great - static metadata, universal support)
 * - HDR (generic): 1500 (good - unspecified HDR)
 * - HLG: 800 (broadcast HDR)
 * - PQ: 500 (basic HDR transfer function)
 * - SDR: 0 (baseline)
 */

import type { CustomFormat } from '../types.js';

// =============================================================================
// DOLBY VISION FORMATS
// =============================================================================

/**
 * Dolby Vision
 */
export const DOLBY_VISION_FORMAT: CustomFormat = {
	id: 'hdr-dolby-vision',
	name: 'Dolby Vision',
	description: 'Dolby Vision HDR with dynamic metadata.',
	category: 'hdr',
	tags: ['Colour Grade', 'HDR', 'Dolby Vision', 'DV'],
	conditions: [
		{
			name: 'Dolby Vision',
			type: 'hdr',
			hdr: 'dolby-vision',
			required: true,
			negate: false
		}
	]
};

// =============================================================================
// HDR10 FORMATS
// =============================================================================

/**
 * HDR10+ (Dynamic Metadata)
 *
 * Samsung's answer to Dolby Vision - uses dynamic metadata on a scene-by-scene
 * basis for optimal HDR presentation.
 *
 * Profilarr regex: \bHDR10.?(\+|P(lus)?\b)
 */
export const HDR10_PLUS_FORMAT: CustomFormat = {
	id: 'hdr-hdr10plus',
	name: 'HDR10+',
	description: 'HDR10+ with dynamic metadata. Scene-by-scene optimization.',
	category: 'hdr',
	tags: ['Colour Grade', 'HDR', 'HDR10+', 'Dynamic'],
	conditions: [
		{
			name: 'HDR10+',
			type: 'hdr',
			hdr: 'hdr10+',
			required: true,
			negate: false
		}
	]
};

/**
 * HDR10 (Static Metadata)
 *
 * The most common HDR format. Uses static metadata that applies to the
 * entire content rather than scene-by-scene.
 *
 * Profilarr regex: \bHDR10(?!\+|Plus)\b
 */
export const HDR10_FORMAT: CustomFormat = {
	id: 'hdr-hdr10',
	name: 'HDR10',
	description: 'HDR10 with static metadata. Universal HDR support.',
	category: 'hdr',
	tags: ['Colour Grade', 'HDR', 'HDR10'],
	conditions: [
		{
			name: 'HDR10',
			type: 'hdr',
			hdr: 'hdr10',
			required: true,
			negate: false
		}
	]
};

/**
 * HDR (Generic/Unspecified)
 *
 * Generic HDR label when specific type isn't indicated.
 * Could be HDR10, PQ, or other HDR format.
 *
 * Profilarr regex: \b(HDR)\b (but excludes when followed by 10)
 */
export const HDR_GENERIC_FORMAT: CustomFormat = {
	id: 'hdr-generic',
	name: 'HDR',
	description: 'Generic HDR (unspecified type). May be HDR10 or other HDR variant.',
	category: 'hdr',
	tags: ['Colour Grade', 'HDR'],
	conditions: [
		{
			name: 'HDR',
			type: 'hdr',
			hdr: 'hdr',
			required: true,
			negate: false
		}
	]
};

// =============================================================================
// OTHER HDR FORMATS
// =============================================================================

/**
 * HLG (Hybrid Log-Gamma)
 *
 * Broadcast-oriented HDR format. Compatible with SDR displays but provides
 * HDR on supported devices. Common in TV broadcasts.
 *
 * Profilarr regex: \b(HLG)\b
 */
export const HLG_FORMAT: CustomFormat = {
	id: 'hdr-hlg',
	name: 'HLG',
	description: 'Hybrid Log-Gamma HDR. Broadcast-compatible HDR format.',
	category: 'hdr',
	tags: ['Colour Grade', 'HDR', 'HLG', 'Broadcast'],
	conditions: [
		{
			name: 'HLG',
			type: 'hdr',
			hdr: 'hlg',
			required: true,
			negate: false
		}
	]
};

/**
 * PQ (Perceptual Quantizer)
 *
 * The underlying transfer function used by HDR10 and Dolby Vision.
 * When labeled separately, usually indicates HDR content without
 * specific format metadata.
 *
 * Profilarr regex: \b(PQ|PQ10)\b
 */
export const PQ_FORMAT: CustomFormat = {
	id: 'hdr-pq',
	name: 'PQ',
	description: 'Perceptual Quantizer HDR transfer function.',
	category: 'hdr',
	tags: ['Colour Grade', 'HDR', 'PQ'],
	conditions: [
		{
			name: 'PQ',
			type: 'hdr',
			hdr: 'pq',
			required: true,
			negate: false
		}
	]
};

// =============================================================================
// SDR FORMAT
// =============================================================================

/**
 * SDR (Standard Dynamic Range)
 *
 * Non-HDR content. Used when explicitly labeled or when no HDR format detected.
 * Score of 0 as baseline - not penalized, just not upgraded.
 *
 * Profilarr regex: \b(SDR)\b
 */
export const SDR_FORMAT: CustomFormat = {
	id: 'hdr-sdr',
	name: 'SDR',
	description: 'Standard Dynamic Range. Non-HDR content.',
	category: 'hdr',
	tags: ['Colour Grade', 'SDR'],
	conditions: [
		{
			name: 'SDR',
			type: 'hdr',
			hdr: 'sdr',
			required: true,
			negate: false
		}
	]
};

// =============================================================================
// EXPORTS
// =============================================================================

/**
 * Dolby Vision formats
 */
export const DOLBY_VISION_FORMATS: CustomFormat[] = [DOLBY_VISION_FORMAT];

/**
 * HDR10 family formats
 */
export const HDR10_FORMATS: CustomFormat[] = [HDR10_PLUS_FORMAT, HDR10_FORMAT, HDR_GENERIC_FORMAT];

/**
 * Other HDR formats (broadcast, transfer function)
 */
export const OTHER_HDR_FORMATS: CustomFormat[] = [HLG_FORMAT, PQ_FORMAT];

/**
 * All HDR formats combined
 * Order matters for matching - more specific formats should come first
 */
export const ALL_HDR_FORMATS: CustomFormat[] = [
	// Dolby Vision (most specific, check first)
	...DOLBY_VISION_FORMATS,
	// HDR10 family (check HDR10+ before HDR10 before generic HDR)
	...HDR10_FORMATS,
	// Other HDR types
	...OTHER_HDR_FORMATS,
	// SDR (baseline)
	SDR_FORMAT
];

// Legacy export for backwards compatibility
export const HDR_FORMATS = ALL_HDR_FORMATS;
