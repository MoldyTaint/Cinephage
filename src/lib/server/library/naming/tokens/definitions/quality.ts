/**
 * Quality tokens - Quality, QualityFull, Resolution, Source, Proper, Repack
 */

import type { TokenDefinition } from '../types';
import { normalizeSource } from '../../normalization';

/**
 * Build quality string like "Bluray-1080p"
 */
function buildQualityString(source?: string, resolution?: string): string {
	const parts: string[] = [];
	if (source) {
		parts.push(normalizeSource(source));
	}
	if (resolution) {
		parts.push(resolution);
	}
	return parts.join('-');
}

/**
 * Build full quality string with Proper/Repack markers
 */
function buildQualityFullString(
	source?: string,
	resolution?: string,
	proper?: boolean,
	repack?: boolean
): string {
	const parts: string[] = [];
	if (proper) parts.push('Proper');
	if (repack) parts.push('Repack');
	const quality = buildQualityString(source, resolution);
	if (quality) parts.push(quality);
	return parts.join(' ');
}

export const qualityTokens: TokenDefinition[] = [
	{
		name: 'Quality',
		category: 'quality',
		description: 'Quality string (Source-Resolution)',
		example: 'Bluray-1080p',
		applicability: ['movie', 'episode'],
		render: (info) => buildQualityString(info.source, info.resolution)
	},
	{
		name: 'QualityFull',
		category: 'quality',
		description: 'Quality with Proper/Repack markers',
		example: 'Proper Bluray-1080p',
		applicability: ['movie', 'episode'],
		render: (info) => buildQualityFullString(info.source, info.resolution, info.proper, info.repack)
	},
	{
		name: 'Resolution',
		category: 'quality',
		description: 'Resolution only (2160p, 1080p, etc.)',
		applicability: ['movie', 'episode'],
		render: (info) => info.resolution || ''
	},
	{
		name: 'Source',
		category: 'quality',
		description: 'Source only (Bluray, WEB-DL, etc.)',
		applicability: ['movie', 'episode'],
		render: (info) => (info.source ? normalizeSource(info.source) : '')
	},
	{
		name: 'Proper',
		category: 'quality',
		description: '"PROPER" if applicable',
		applicability: ['movie', 'episode'],
		render: (info) => (info.proper ? 'PROPER' : '')
	},
	{
		name: 'Repack',
		category: 'quality',
		description: '"REPACK" if applicable',
		applicability: ['movie', 'episode'],
		render: (info) => (info.repack ? 'REPACK' : '')
	}
];
