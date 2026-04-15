/**
 * Resolution-Only Format Definitions
 *
 * These formats match on resolution ALONE when resolution is detected.
 * They do NOT require source information.
 *
 * Score Philosophy:
 * - Resolution is a key quality indicator
 * - Each resolution gets its own score based on profile preferences
 * - Source, codec, audio, HDR are scored separately as standalone formats
 */

import type { CustomFormat } from '../types.js';

/**
 * Resolution-only formats
 *
 * These serve as the primary quality indicator when resolution is detected.
 * They are mutually exclusive by nature (a release is one resolution).
 */
export const ALL_RESOLUTION_FORMATS: CustomFormat[] = [
	{
		id: 'resolution-2160p',
		name: '2160p (4K)',
		description: '4K/UHD resolution - highest quality resolution',
		category: 'resolution',
		tags: ['2160p', '4K', 'UHD', 'Resolution'],
		conditions: [
			{
				name: '2160p',
				type: 'resolution',
				resolution: '2160p',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'resolution-1080p',
		name: '1080p (Full HD)',
		description: '1080p Full HD resolution - high quality',
		category: 'resolution',
		tags: ['1080p', 'FHD', 'Resolution'],
		conditions: [
			{
				name: '1080p',
				type: 'resolution',
				resolution: '1080p',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'resolution-720p',
		name: '720p (HD)',
		description: '720p HD resolution - good quality',
		category: 'resolution',
		tags: ['720p', 'HD', 'Resolution'],
		conditions: [
			{
				name: '720p',
				type: 'resolution',
				resolution: '720p',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'resolution-480p',
		name: '480p (SD)',
		description: '480p SD resolution - acceptable for small files',
		category: 'resolution',
		tags: ['480p', 'SD', 'Resolution'],
		conditions: [
			{
				name: '480p',
				type: 'resolution',
				resolution: '480p',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'resolution-unknown',
		name: 'Unknown Resolution',
		description: 'Release with undetectable resolution',
		category: 'resolution',
		tags: ['Resolution', 'Unknown'],
		conditions: [
			{
				name: 'Unknown Resolution',
				type: 'resolution',
				resolution: 'unknown',
				required: true,
				negate: false
			}
		]
	}
];

export const RESOLUTION_ONLY_FORMATS = ALL_RESOLUTION_FORMATS;
