/**
 * HDR format normalization for media naming
 *
 * Maps various HDR format name variants to standardized formats.
 */

import { createNormalizationMap, type NormalizationMap } from './types';

const HDR_MAPPINGS: Record<string, string> = {
	// Dolby Vision
	'dolby-vision': 'DV',
	dolbyvision: 'DV',
	dv: 'DV',
	dovi: 'DV',

	// HDR10
	hdr10: 'HDR10',
	hdr: 'HDR10',

	// HDR10+
	'hdr10+': 'HDR10+',
	hdr10plus: 'HDR10+',

	// Dolby Vision variants collapse to plain DV
	'dolby-vision-hdr10': 'DV',
	'dv-hdr10': 'DV',
	'dv hdr10': 'DV',
	'dolby-vision-hdr10+': 'DV',
	'dv-hdr10+': 'DV',
	'dv hdr10+': 'DV',

	// HLG
	hlg: 'HLG'
};

export const hdrNormalizer: NormalizationMap = createNormalizationMap(HDR_MAPPINGS);

/**
 * Normalize an HDR format name to standard format
 */
export function normalizeHdr(hdr: string | undefined): string | undefined {
	if (!hdr) return undefined;
	const lowerHdr = hdr.toLowerCase();
	// If it's a known format, use the mapping
	if (hdrNormalizer.isKnown(lowerHdr)) {
		return hdrNormalizer.normalize(lowerHdr);
	}
	// Return undefined for unknown formats
	return undefined;
}
