/**
 * HDR Format Definitions
 *
 * Defines HDR/color grading format matching for quality scoring.
 * Based on Profilarr/dictionarry patterns.
 *
 * Score Philosophy (following Profilarr):
 * - Dolby Vision (with fallback): 3500 (best - dynamic metadata + compatibility)
 * - HDR10+: 2500 (excellent - dynamic metadata)
 * - HDR10: 2000 (great - static metadata, universal support)
 * - HDR (generic): 1500 (good - unspecified HDR)
 * - Dolby Vision (without fallback): 1000 (risky - compatibility issues possible)
 * - HLG: 800 (broadcast HDR)
 * - PQ: 500 (basic HDR transfer function)
 * - SDR: 0 (baseline)
 *
 * Note: DV without fallback uses negative lookahead to ensure no HDR fallback exists.
 * REMUX and Bluray sources typically have fallback, WEB-DL may not.
 */

import type { CustomFormat } from '../types.js';

// =============================================================================
// DOLBY VISION FORMATS
// =============================================================================

/**
 * Dolby Vision (with HDR10 fallback)
 *
 * The best HDR format - has dynamic metadata like HDR10+ but also includes
 * HDR10 fallback layer for devices that don't support DV.
 *
 * Profilarr regex: \b(dv(?![ .](HLG|SDR))|dovi|dolby[ .]?vision)\b
 */
export const DOLBY_VISION_FORMAT: CustomFormat = {
	id: 'hdr-dolby-vision',
	name: 'Dolby Vision',
	description:
		'Dolby Vision HDR with dynamic metadata. Best when combined with HDR10 fallback layer.',
	category: 'hdr',
	tags: ['Colour Grade', 'HDR', 'Dolby Vision', 'DV'],
	conditions: [
		{
			name: 'Dolby Vision',
			type: 'release_title',
			// Matches DV (not followed by HLG/SDR), DoVi, Dolby Vision, Dolby.Vision
			pattern: '\\b(dv(?![ .](HLG|SDR))|dovi|dolby[ .]?vision)\\b',
			required: true,
			negate: false
		}
	]
};

/**
 * Dolby Vision (Without Fallback)
 *
 * DV-only releases without HDR10 fallback. May have compatibility issues
 * on devices that don't support Dolby Vision.
 *
 * Detection: DV present but NO HDR/HDR10/HDR10+ AND NOT from sources that
 * typically have fallback (REMUX, Bluray, HULU which always includes HDR).
 *
 * Profilarr regex: (?<=^(?!.*(HDR|HULU|REMUX|BLURAY)).*?)\b(DV|Dovi|Dolby[- .]?V(ision)?)\b
 */
export const DOLBY_VISION_NO_FALLBACK_FORMAT: CustomFormat = {
	id: 'hdr-dolby-vision-no-fallback',
	name: 'Dolby Vision (Without Fallback)',
	description:
		'Dolby Vision without HDR10 fallback layer. May have compatibility issues on non-DV devices.',
	category: 'hdr',
	tags: ['Colour Grade', 'HDR', 'Dolby Vision', 'DV', 'No Fallback'],
	conditions: [
		{
			name: 'Dolby Vision',
			type: 'release_title',
			pattern: '\\b(dv(?![ .](HLG|SDR))|dovi|dolby[ .]?vision)\\b',
			required: true,
			negate: false
		},
		{
			name: 'No HDR',
			type: 'release_title',
			// Ensure no HDR fallback present (but HDR10 check below is more specific)
			pattern: '\\bHDR\\b(?!10)',
			required: true,
			negate: true
		},
		{
			name: 'No HDR10',
			type: 'release_title',
			pattern: '\\bHDR10\\b',
			required: true,
			negate: true
		},
		{
			name: 'No HDR10+',
			type: 'release_title',
			pattern: '\\bHDR10.?(\\+|P(lus)?\\b)',
			required: true,
			negate: true
		},
		{
			name: 'No REMUX (usually has fallback)',
			type: 'release_title',
			pattern: '\\bREMUX\\b',
			required: true,
			negate: true
		},
		{
			name: 'No Bluray source (usually has fallback)',
			type: 'release_title',
			pattern: '\\b(BluRay|Blu-Ray|BDREMUX|BD)\\b',
			required: true,
			negate: true
		},
		{
			name: 'No HULU (always includes HDR fallback)',
			type: 'release_title',
			pattern: '\\bHULU\\b',
			required: true,
			negate: true
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
			type: 'release_title',
			// Matches HDR10+, HDR10P, HDR10Plus, HDR10 Plus
			pattern: '\\bHDR10.?(\\+|P(lus)?\\b)',
			required: true,
			negate: false
		},
		// Exclusions per Profilarr
		{
			name: 'Not SDR',
			type: 'release_title',
			pattern: '\\bSDR\\b',
			required: true,
			negate: true
		},
		{
			name: 'Not PQ',
			type: 'release_title',
			pattern: '\\b(PQ|PQ10)\\b',
			required: true,
			negate: true
		},
		{
			name: 'Not HLG',
			type: 'release_title',
			pattern: '\\bHLG\\b',
			required: true,
			negate: true
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
			type: 'release_title',
			// Matches HDR10 but NOT HDR10+ or HDR10Plus
			pattern: '\\bHDR10(?!\\+|Plus)\\b',
			required: true,
			negate: false
		},
		// Exclusions per Profilarr
		{
			name: 'Not SDR',
			type: 'release_title',
			pattern: '\\bSDR\\b',
			required: true,
			negate: true
		},
		{
			name: 'Not PQ',
			type: 'release_title',
			pattern: '\\b(PQ|PQ10)\\b',
			required: true,
			negate: true
		},
		{
			name: 'Not HLG',
			type: 'release_title',
			pattern: '\\bHLG\\b',
			required: true,
			negate: true
		},
		{
			name: 'Not HDR10+',
			type: 'release_title',
			pattern: '\\bHDR10.?(\\+|P(lus)?\\b)',
			required: true,
			negate: true
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
			type: 'release_title',
			// Match HDR but not when followed by 10 (that's HDR10/HDR10+)
			pattern: '\\bHDR\\b(?!10)',
			required: true,
			negate: false
		},
		// Exclusions per Profilarr
		{
			name: 'Not SDR',
			type: 'release_title',
			pattern: '\\bSDR\\b',
			required: true,
			negate: true
		},
		{
			name: 'Not PQ',
			type: 'release_title',
			pattern: '\\b(PQ|PQ10)\\b',
			required: true,
			negate: true
		},
		{
			name: 'Not HLG',
			type: 'release_title',
			pattern: '\\bHLG\\b',
			required: true,
			negate: true
		},
		{
			name: 'Not HDR10',
			type: 'release_title',
			pattern: '\\bHDR10\\b',
			required: true,
			negate: true
		},
		{
			name: 'Not HDR10+',
			type: 'release_title',
			pattern: '\\bHDR10.?(\\+|P(lus)?\\b)',
			required: true,
			negate: true
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
			type: 'release_title',
			pattern: '\\bHLG\\b',
			required: true,
			negate: false
		},
		// Exclusions per Profilarr
		{
			name: 'Not SDR',
			type: 'release_title',
			pattern: '\\bSDR\\b',
			required: true,
			negate: true
		},
		{
			name: 'Not PQ',
			type: 'release_title',
			pattern: '\\b(PQ|PQ10)\\b',
			required: true,
			negate: true
		},
		{
			name: 'Not HDR',
			type: 'release_title',
			pattern: '\\bHDR\\b(?!10)',
			required: true,
			negate: true
		},
		{
			name: 'Not HDR10',
			type: 'release_title',
			pattern: '\\bHDR10\\b',
			required: true,
			negate: true
		},
		{
			name: 'Not HDR10+',
			type: 'release_title',
			pattern: '\\bHDR10.?(\\+|P(lus)?\\b)',
			required: true,
			negate: true
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
			type: 'release_title',
			pattern: '\\b(PQ|PQ10)\\b',
			required: true,
			negate: false
		},
		// Exclusions per Profilarr
		{
			name: 'Not SDR',
			type: 'release_title',
			pattern: '\\bSDR\\b',
			required: true,
			negate: true
		},
		{
			name: 'Not HLG',
			type: 'release_title',
			pattern: '\\bHLG\\b',
			required: true,
			negate: true
		},
		{
			name: 'Not HDR',
			type: 'release_title',
			pattern: '\\bHDR\\b(?!10)',
			required: true,
			negate: true
		},
		{
			name: 'Not HDR10',
			type: 'release_title',
			pattern: '\\bHDR10\\b',
			required: true,
			negate: true
		},
		{
			name: 'Not HDR10+',
			type: 'release_title',
			pattern: '\\bHDR10.?(\\+|P(lus)?\\b)',
			required: true,
			negate: true
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
			type: 'release_title',
			pattern: '\\bSDR\\b',
			required: false, // Can match SDR label OR absence of HDR
			negate: false
		},
		// Must NOT have any HDR format
		{
			name: 'No HDR',
			type: 'release_title',
			pattern: '\\bHDR\\b',
			required: true,
			negate: true
		},
		{
			name: 'No Dolby Vision',
			type: 'release_title',
			pattern: '\\b(dv(?![ .](HLG|SDR))|dovi|dolby[ .]?vision)\\b',
			required: true,
			negate: true
		},
		{
			name: 'No HLG',
			type: 'release_title',
			pattern: '\\bHLG\\b',
			required: true,
			negate: true
		},
		{
			name: 'No PQ',
			type: 'release_title',
			pattern: '\\b(PQ|PQ10)\\b',
			required: true,
			negate: true
		}
	]
};

// =============================================================================
// MISSING FORMATS (for BTN-style naming)
// =============================================================================

/**
 * HDR (Missing)
 *
 * For 1080p DV encodes that likely have HDR but don't label it.
 * Common in BTN-style naming where DV implies HDR.
 */
export const HDR_MISSING_FORMAT: CustomFormat = {
	id: 'hdr-missing',
	name: 'HDR (Missing)',
	description: 'DV encode likely has HDR but not labeled. Applies to 1080p DV x265 Bluray encodes.',
	category: 'hdr',
	tags: ['Colour Grade', 'HDR', 'Missing'],
	conditions: [
		{
			name: 'Has Dolby Vision',
			type: 'release_title',
			pattern: '\\b(dv(?![ .](HLG|SDR))|dovi|dolby[ .]?vision)\\b',
			required: true,
			negate: false
		},
		{
			name: 'Has x265',
			type: 'release_title',
			pattern: '\\b(x265|HEVC|h\\.?265)\\b',
			required: true,
			negate: false
		},
		{
			name: 'Is 1080p',
			type: 'release_title',
			pattern: '\\b1080p\\b',
			required: true,
			negate: false
		},
		{
			name: 'Bluray source',
			type: 'release_title',
			pattern: '\\b(BluRay|Blu-Ray|BDRip)\\b',
			required: true,
			negate: false
		},
		// Must NOT have explicit HDR labels
		{
			name: 'No explicit SDR',
			type: 'release_title',
			pattern: '\\bSDR\\b',
			required: true,
			negate: true
		},
		{
			name: 'No explicit PQ',
			type: 'release_title',
			pattern: '\\b(PQ|PQ10)\\b',
			required: true,
			negate: true
		},
		{
			name: 'No explicit HLG',
			type: 'release_title',
			pattern: '\\bHLG\\b',
			required: true,
			negate: true
		},
		{
			name: 'No explicit HDR',
			type: 'release_title',
			pattern: '\\bHDR\\b',
			required: true,
			negate: true
		}
	]
};

/**
 * HDR10 (Missing)
 *
 * For 2160p Bluray encodes from groups that don't label HDR10.
 * Most UHD Bluray encodes have HDR10 even when not labeled.
 */
export const HDR10_MISSING_FORMAT: CustomFormat = {
	id: 'hdr10-missing',
	name: 'HDR10 (Missing)',
	description:
		'UHD Bluray encode likely has HDR10 but not labeled. Applies to 2160p Bluray x265 encodes only.',
	category: 'hdr',
	tags: ['Colour Grade', 'HDR', 'HDR10', 'Missing'],
	conditions: [
		{
			name: 'Is 2160p',
			type: 'release_title',
			pattern: '\\b(2160p|4K|UHD)\\b',
			required: true,
			negate: false
		},
		{
			name: 'Bluray source',
			type: 'release_title',
			pattern: '\\b(BluRay|Blu-Ray|BDREMUX)\\b',
			required: true,
			negate: false
		},
		{
			name: 'Is x265 encode (not REMUX)',
			type: 'release_title',
			pattern: '\\b(x265|h\\.?265|HEVC)\\b',
			required: true,
			negate: false
		},
		{
			name: 'Not REMUX (REMUXes always label HDR)',
			type: 'release_title',
			pattern: '\\bREMUX\\b',
			required: true,
			negate: true
		},
		{
			name: 'Not WEB source',
			type: 'release_title',
			pattern: '\\b(WEB[-.]?DL|WEB[-.]?Rip|WEB)\\b',
			required: true,
			negate: true
		},
		// Must NOT have any explicit HDR/SDR labels
		{
			name: 'No explicit SDR',
			type: 'release_title',
			pattern: '\\bSDR\\b',
			required: true,
			negate: true
		},
		{
			name: 'No explicit PQ',
			type: 'release_title',
			pattern: '\\b(PQ|PQ10)\\b',
			required: true,
			negate: true
		},
		{
			name: 'No explicit HLG',
			type: 'release_title',
			pattern: '\\bHLG\\b',
			required: true,
			negate: true
		},
		{
			name: 'No explicit HDR',
			type: 'release_title',
			pattern: '\\bHDR\\b',
			required: true,
			negate: true
		},
		{
			name: 'No explicit HDR10',
			type: 'release_title',
			pattern: '\\bHDR10\\b',
			required: true,
			negate: true
		},
		{
			name: 'No explicit HDR10+',
			type: 'release_title',
			pattern: '\\bHDR10.?(\\+|P(lus)?\\b)',
			required: true,
			negate: true
		},
		{
			name: 'No Dolby Vision',
			type: 'release_title',
			pattern: '\\b(dv(?![ .](HLG|SDR))|dovi|dolby[ .]?vision)\\b',
			required: true,
			negate: true
		}
	]
};

// =============================================================================
// EXPORTS
// =============================================================================

/**
 * Dolby Vision formats (best HDR - dynamic metadata)
 */
export const DOLBY_VISION_FORMATS: CustomFormat[] = [
	DOLBY_VISION_FORMAT,
	DOLBY_VISION_NO_FALLBACK_FORMAT
];

/**
 * HDR10 family formats
 */
export const HDR10_FORMATS: CustomFormat[] = [HDR10_PLUS_FORMAT, HDR10_FORMAT, HDR_GENERIC_FORMAT];

/**
 * Other HDR formats (broadcast, transfer function)
 */
export const OTHER_HDR_FORMATS: CustomFormat[] = [HLG_FORMAT, PQ_FORMAT];

/**
 * Missing format detection (for BTN-style naming)
 */
export const MISSING_HDR_FORMATS: CustomFormat[] = [HDR_MISSING_FORMAT, HDR10_MISSING_FORMAT];

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
	SDR_FORMAT,
	// Missing detection (fallback inference)
	...MISSING_HDR_FORMATS
];

// Legacy export for backwards compatibility
export const HDR_FORMATS = ALL_HDR_FORMATS;
