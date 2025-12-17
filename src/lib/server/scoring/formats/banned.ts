/**
 * Banned/Deceptive Release Format Definitions
 *
 * Defines releases that should be HARD BLOCKED due to:
 * - Retagging (claiming to be other groups - deceptive)
 * - Fake HDR/DV layers (deceptive metadata)
 * - Unusable sources (CAM, TS, Screener)
 * - Unwanted content (Extras, Samples)
 * - Upscaled content (fake resolution)
 *
 * NOTE: "Poor quality" groups are NOT in this file.
 * They are defined in groups.ts with neutral base scores,
 * allowing profiles to score them appropriately (positive or negative).
 */

import type { CustomFormat } from '../types.js';

/**
 * Groups banned for retagging (claiming to be other groups)
 * These are DECEPTIVE - you don't get what you think you're getting
 */
export const BANNED_RETAGGING: CustomFormat[] = [
	{
		id: 'banned-aroma',
		name: 'AROMA',
		description: 'Banned for retagging',
		category: 'banned',
		tags: ['Banned', 'Retagging', 'Deceptive'],
		conditions: [
			{ name: 'AROMA', type: 'release_group', pattern: '^AROMA$', required: true, negate: false }
		]
	},
	{
		id: 'banned-lama',
		name: 'LAMA',
		description: 'Banned for retagging',
		category: 'banned',
		tags: ['Banned', 'Retagging', 'Deceptive'],
		conditions: [
			{ name: 'LAMA', type: 'release_group', pattern: '^LAMA$', required: true, negate: false }
		]
	},
	{
		id: 'banned-telly',
		name: 'Telly',
		description: 'Banned for retagging',
		category: 'banned',
		tags: ['Banned', 'Retagging', 'Deceptive'],
		conditions: [
			{ name: 'Telly', type: 'release_group', pattern: '^Telly$', required: true, negate: false }
		]
	},
	{
		id: 'banned-vd0n',
		name: 'VD0N',
		description: 'Banned for imitating DON releases (deceptive)',
		category: 'banned',
		tags: ['Banned', 'Retagging', 'Deceptive'],
		conditions: [
			{ name: 'VD0N', type: 'release_group', pattern: '^VD0N$', required: true, negate: false }
		]
	}
];

/**
 * Groups banned for fake HDR/DV layers
 * These are DECEPTIVE - HDR metadata is fake/injected
 */
export const BANNED_FAKE_HDR: CustomFormat[] = [
	{
		id: 'banned-bitor',
		name: 'BiTOR',
		description: 'Banned for fake DV/HDR layer',
		category: 'banned',
		tags: ['Banned', 'Fake HDR', 'Deceptive'],
		conditions: [
			{ name: 'BiTOR', type: 'release_group', pattern: '^BiTOR$', required: true, negate: false }
		]
	},
	{
		id: 'banned-visionxpert',
		name: 'VisionXpert',
		description: 'Banned for fake DV/HDR layer',
		category: 'banned',
		tags: ['Banned', 'Fake HDR', 'Deceptive'],
		conditions: [
			{
				name: 'VisionXpert',
				type: 'release_group',
				pattern: '^VisionXpert$',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'banned-sasukeduck',
		name: 'SasukeducK',
		description: 'Banned for fake DV/HDR layer',
		category: 'banned',
		tags: ['Banned', 'Fake HDR', 'Deceptive'],
		conditions: [
			{
				name: 'SasukeducK',
				type: 'release_group',
				pattern: '^SasukeducK$',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'banned-jennaortegauhd',
		name: 'jennaortegaUHD',
		description: 'Banned for fake DV/HDR layer',
		category: 'banned',
		tags: ['Banned', 'Fake HDR', 'Deceptive'],
		conditions: [
			{
				name: 'jennaortegaUHD',
				type: 'release_group',
				pattern: '^jennaortegaUHD$',
				required: true,
				negate: false
			}
		]
	}
];

/**
 * Content to avoid (extras, samples)
 * Note: Upscaled and 3D are defined in enhancement.ts with more comprehensive patterns
 */
export const BANNED_CONTENT: CustomFormat[] = [
	{
		id: 'banned-extras',
		name: 'Extras',
		description: 'Bonus content / extras',
		category: 'banned',
		tags: ['Banned', 'Extras'],
		conditions: [
			{
				name: 'Extras',
				type: 'release_title',
				pattern: '\\b(Extras|Bonus|Behind[. ]The[. ]Scenes|Deleted[. ]Scenes|Featurettes?)\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'banned-sample',
		name: 'Sample',
		description: 'Sample files',
		category: 'banned',
		tags: ['Banned', 'Sample'],
		conditions: [
			{
				name: 'Sample',
				type: 'release_title',
				pattern: '\\bSample\\b',
				required: true,
				negate: false
			}
		]
	}
];

/**
 * Unusable low quality sources
 * These are so bad they're not worth downloading
 */
export const BANNED_SOURCES: CustomFormat[] = [
	{
		id: 'banned-cam',
		name: 'CAM',
		description: 'Camera recording from theater',
		category: 'banned',
		tags: ['Banned', 'CAM', 'Unusable'],
		conditions: [
			{
				name: 'CAM',
				type: 'release_title',
				pattern: '\\b(CAM|HDCAM|CAMRip)\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'banned-telesync',
		name: 'Telesync',
		description: 'Telesync recording',
		category: 'banned',
		tags: ['Banned', 'TS', 'Unusable'],
		conditions: [
			{
				name: 'Telesync',
				type: 'release_title',
				pattern: '\\b(TS|Telesync|HDTS|TELESYNC|PDVD)\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'banned-telecine',
		name: 'Telecine',
		description: 'Telecine recording',
		category: 'banned',
		tags: ['Banned', 'TC', 'Unusable'],
		conditions: [
			{
				name: 'Telecine',
				type: 'release_title',
				pattern: '\\b(TC|Telecine|HDTC)\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'banned-screener',
		name: 'Screener',
		description: 'Screener copy',
		category: 'banned',
		tags: ['Banned', 'Screener', 'Unusable'],
		conditions: [
			{
				name: 'Screener',
				type: 'release_title',
				pattern: '\\b(SCR|SCREENER|DVDSCR|BDSCR)\\b',
				required: true,
				negate: false
			}
		]
	}
];

/**
 * All banned formats combined (only truly deceptive/unusable content)
 */
export const ALL_BANNED_FORMATS: CustomFormat[] = [
	...BANNED_RETAGGING,
	...BANNED_FAKE_HDR,
	...BANNED_CONTENT,
	...BANNED_SOURCES
];

/**
 * List of truly banned group names for quick lookup
 * Only includes deceptive groups (retagging, fake HDR)
 */
export const BANNED_GROUP_NAMES = [
	// Retagging groups (deceptive - claim to be other groups)
	'AROMA',
	'LAMA',
	'Telly',
	'VD0N',
	// Fake HDR groups (deceptive - inject fake HDR metadata)
	'BiTOR',
	'VisionXpert',
	'SasukeducK',
	'jennaortegaUHD'
];

/**
 * Check if a release group is truly banned (deceptive)
 */
export function isBannedGroup(group: string | undefined): boolean {
	if (!group) return false;
	return BANNED_GROUP_NAMES.some((banned) => group.toLowerCase() === banned.toLowerCase());
}
