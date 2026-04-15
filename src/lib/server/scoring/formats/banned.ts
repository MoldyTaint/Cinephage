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
	},
	{
		id: 'banned-trailer',
		name: 'Trailer / Promo',
		description: 'Trailer, teaser, promo, preview, clip, or featurette content',
		category: 'banned',
		tags: ['Banned', 'Trailer', 'Promo'],
		conditions: [
			{
				name: 'Trailer / Promo',
				type: 'release_title',
				pattern: '\\b(Trailer|Teaser|Promo|Preview|Clip|Featurette)\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'banned-disc-image',
		name: 'Disc Image',
		description: 'ISO/disc image files (not directly playable)',
		category: 'banned',
		tags: ['Banned', 'ISO', 'Disc'],
		conditions: [
			{
				name: 'Disc Image',
				type: 'release_title',
				pattern: '\\.(iso|img|bin|nrg|mdf)\\b|\\b(DVD|BD|Blu-?ray)[. -]?ISO\\b',
				required: true,
				negate: false
			}
		]
	}
];

/**
 * Raw disk / BR-DISK releases
 * These are full disc structures (BDMV folders, untouched Blu-rays) that are:
 * - Not directly playable without special software
 * - Often contain malicious content disguised as media
 * - Waste bandwidth (50-100GB for content that could be 5-15GB remuxed)
 *
 * Patterns derived from Radarr's RawDiskSpecification and QualityParser
 * @see https://github.com/Radarr/Radarr/blob/develop/src/NzbDrone.Core/DecisionEngine/Specifications/RawDiskSpecification.cs
 * @see https://github.com/Radarr/Radarr/blob/develop/src/NzbDrone.Core/Parser/QualityParser.cs
 */
export const BANNED_RAW_DISK: CustomFormat[] = [
	{
		id: 'banned-brdisk',
		name: 'BR-DISK',
		description: 'Raw Blu-ray disc structure (BDMV/untouched)',
		category: 'banned',
		tags: ['Banned', 'BR-DISK', 'Raw', 'Disc'],
		conditions: [
			{
				name: 'BR-DISK',
				type: 'release_title',
				// Matches: BR-DISK, BD-ISO, BDISO, COMPLETE BLURAY, Full Blu-ray, BDMV, AVC/HEVC with Blu-ray (untouched indicators)
				// Also matches: BD25, BD50, BD66, BD100, UHD ISO variants
				pattern:
					'\\b(BR[-_. ]?DISK|BD[-_. ]?ISO|BDISO|COMPLETE[-_. ]?BLURAY|FULL[-_. ]?BLURAY|FULL[-_. ]?BD|BD[-_. ]?FULL|BDMV|VOB[-_. ]?IFO)\\b|\\b(BD|UHD)[-_. ]?(25|50|66|100)[-_. ]?ISO\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'banned-disc-numbered',
		name: 'Disc Numbered Release',
		description: 'Multi-disc Blu-ray releases (Disc 1, Disc 2, etc.)',
		category: 'banned',
		tags: ['Banned', 'BR-DISK', 'Raw', 'Disc'],
		conditions: [
			{
				name: 'Disc Numbered',
				type: 'release_title',
				// Matches: "Disc 1 1080p Blu-ray", "Disk 2 Bluray", etc.
				pattern: '\\b(Dis[ck])[-_. ]?\\d+[-_. ](?:(?:480|720|1080|2160)[ip][-_. ])?Blu-?ray\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'banned-full-bluray',
		name: 'Full Blu-ray',
		description: 'Full/untouched Blu-ray releases',
		category: 'banned',
		tags: ['Banned', 'BR-DISK', 'Raw', 'Disc'],
		conditions: [
			{
				name: 'Full Blu-ray',
				type: 'release_title',
				// Matches: "1080p Full Blu-ray", "Full Bluray 2160p", etc.
				pattern: '\\b(?:480|720|1080|2160)[ip][-_. ]FULL[-_. ]Blu-?ray\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'banned-dvd-disk',
		name: 'DVD-R/DVD5/DVD9',
		description: 'Raw DVD disc images',
		category: 'banned',
		tags: ['Banned', 'DVD', 'Raw', 'Disc'],
		conditions: [
			{
				name: 'DVD Disk',
				type: 'release_title',
				// Matches: DVD-R, DVDR, DVD5, DVD9, xDVD9, MDVD-R, etc.
				pattern: '\\b\\d?x?M?DVD[-_. ]?[R59]\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'banned-3d-bd',
		name: '3D BD',
		description: '3D Blu-ray disc releases',
		category: 'banned',
		tags: ['Banned', 'BR-DISK', '3D', 'Disc'],
		conditions: [
			{
				name: '3D BD',
				type: 'release_title',
				pattern: '\\b3D[-_. ]?BD\\b',
				required: true,
				negate: false
			}
		]
	}
];

/**
 * Music/Soundtrack releases
 * These are audio-only releases, not video content
 */
export const BANNED_MUSIC: CustomFormat[] = [
	{
		id: 'banned-soundtrack',
		name: 'Soundtrack/OST',
		description: 'Music soundtrack releases (not video content)',
		category: 'banned',
		tags: ['Banned', 'Music', 'Soundtrack'],
		conditions: [
			{
				name: 'Soundtrack',
				type: 'release_title',
				pattern:
					'\\b(OST|O\\.?S\\.?T\\.?|Original[. ]?(Motion[. ]?Picture|Television|Series|Film|Game)?[. ]?Soundtrack|Soundtrack|Film[. ]?Score|Motion[. ]?Picture[. ]?Score)\\b|-OST-',
				required: true,
				negate: false
			}
		]
	}
];

/**
 * Game/Software releases
 * These are not video content - should be blocked for movie/TV searches
 */
export const BANNED_GAMES: CustomFormat[] = [
	{
		id: 'banned-game-repack',
		name: 'Game Repack',
		description: 'Game repack releases (not video content)',
		category: 'banned',
		tags: ['Banned', 'Game', 'Software'],
		conditions: [
			{
				name: 'Game Repack',
				type: 'release_title',
				pattern:
					'\\b(FitGirl|DODI|ElAmigos|CODEX|SKIDROW|PLAZA|GOG|Goldberg|TiNYiSO|EMPRESS|RUNE|CPY|RELOADED|DARKSiDERS|HOODLUM|RAZOR1911)\\b|\\bRePack\\b.*\\b(PC|Game)\\b|\\b(PC|Game)[. ]RePack\\b',
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
	...BANNED_RAW_DISK,
	...BANNED_MUSIC,
	...BANNED_GAMES,
	...BANNED_SOURCES
];

/**
 * List of truly banned group names for quick lookup
 * Only includes deceptive groups (retagging, fake HDR)
 */
export const BANNED_GROUP_NAMES = [
	// Retagging groups (deceptive - claim to be other groups)
	'AROMA',
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
