/**
 * Release Group Format Definitions
 *
 * Individual detection formats for release groups.
 * No tiers or quality judgments - just detection.
 * Users assign scores in their profiles based on their preferences.
 *
 * Philosophy: Formats DETECT, Profiles SCORE.
 */

import type { CustomFormat } from '../types.js';

/**
 * Helper to create a simple release group format
 */
function createGroupFormat(name: string, description?: string, tags: string[] = []): CustomFormat {
	// Keep hyphens in ID for readability, remove other special chars
	const id = `group-${name.toLowerCase().replace(/[^a-z0-9-]/g, '')}`;
	return {
		id,
		name,
		description: description || `${name} release group`,
		category: 'release_group_tier',
		tags: ['Release Group', ...tags],
		conditions: [
			{
				name,
				type: 'release_group',
				pattern: `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
				required: true,
				negate: false
			}
		]
	};
}

// =============================================================================
// RELEASE GROUPS - Alphabetically organized for maintainability
// =============================================================================

/**
 * All release group definitions
 * Organized alphabetically - no quality judgments, just detection
 */
export const RELEASE_GROUP_FORMATS: CustomFormat[] = [
	// A
	createGroupFormat('3L', 'Quality remux group'),
	createGroupFormat('4K4U'),
	createGroupFormat('AMIABLE', 'Scene group'),
	createGroupFormat('AOC'),
	createGroupFormat('Arid', 'Anime group', ['Anime']),

	// B
	createGroupFormat('BiZKiT', 'Remux group'),
	createGroupFormat('BLASPHEMY'),
	createGroupFormat('BLURANiUM', 'Remux group'),
	createGroupFormat('BOLS'),
	createGroupFormat('BTM'),
	createGroupFormat('BeyondHD', 'Encode group (not their remuxes)'),

	// C
	createGroupFormat('CBT', 'Anime group', ['Anime']),
	createGroupFormat('CiNEPHiLES', 'Remux group'),
	createGroupFormat('CLASSiCALHD'),
	createGroupFormat('CMRG', 'WEB-DL group'),
	createGroupFormat('CREATiVE24'),
	createGroupFormat('CTR', 'Anime group', ['Anime']),
	createGroupFormat('CtrlHD', 'Quality encode group'),

	// D
	createGroupFormat('D-Z0N3', 'Top tier encode group'),
	createGroupFormat('DarQ', 'Efficient x265 encoder'),
	createGroupFormat('d3g'),
	createGroupFormat('decibeL', 'Quality encode/remux group'),
	createGroupFormat('Dekinai', 'Anime group', ['Anime']),
	createGroupFormat('DepraveD'),
	createGroupFormat('DeViSiVE'),
	createGroupFormat('dkore', 'Efficient x265 encoder'),
	createGroupFormat('DON', 'Top tier encode group'),
	createGroupFormat('Drag', 'Anime group', ['Anime']),
	createGroupFormat('DRONES', 'Scene group'),
	createGroupFormat('DRX'),

	// E
	createGroupFormat('EA', 'Quality encode group'),
	createGroupFormat('EbP', 'Top tier encode group'),
	createGroupFormat('edge2020', 'Efficient x265 encoder'),
	createGroupFormat('EPSiLON', 'Remux group'),
	createGroupFormat('Erai-raws', 'Anime WEB source', ['Anime']),
	createGroupFormat('ETRG', 'Micro encoder', ['Micro']),
	createGroupFormat('ETTV', 'Micro encoder', ['Micro']),
	createGroupFormat('EXP', 'Anime group', ['Anime']),
	createGroupFormat('EZTV', 'Micro encoder', ['Micro']),

	// F
	createGroupFormat('FGT'),
	createGroupFormat('Flights'),
	createGroupFormat('Flugel', 'Anime group', ['Anime']),
	createGroupFormat('FLUX', 'Quality WEB-DL/encode group'),
	createGroupFormat('FraMeSToR', 'Top tier remux group'),

	// G
	createGroupFormat('GalaxyRG', 'Micro encoder', ['Micro']),
	createGroupFormat('GECKOS', 'Scene group'),
	createGroupFormat('GRiMM', 'Efficient x265 encoder'),

	// H
	createGroupFormat('hallowed', 'Scene group'),
	createGroupFormat('HDS'),
	createGroupFormat('Headpatter', 'Anime group', ['Anime']),
	createGroupFormat('HiFi', 'Quality encode group'),
	createGroupFormat('Holomux', 'Anime group', ['Anime']),
	createGroupFormat('HorribleSubs', 'Anime WEB source', ['Anime']),
	createGroupFormat('HQMUX', 'Quality 4K encode group'),
	createGroupFormat('hydes', 'Anime group', ['Anime']),

	// I
	createGroupFormat('iFT', 'Quality 4K encode group'),
	createGroupFormat('IK', 'Anime group', ['Anime']),
	createGroupFormat('ION10', 'Micro encoder', ['Micro']),
	createGroupFormat('iVy'),

	// K
	createGroupFormat('Kametsu', 'Anime group', ['Anime']),
	createGroupFormat('KC'),
	createGroupFormat('KH', 'Anime group', ['Anime']),
	createGroupFormat('kuchikirukia', 'Anime group', ['Anime']),

	// L
	createGroupFormat('LSt', 'Efficient x265 encoder'),
	createGroupFormat('Lulu', 'Anime group', ['Anime']),
	createGroupFormat('LYS1TH3A', 'Top tier anime group', ['Anime']),

	// M
	createGroupFormat('MeGusta', 'Micro encoder', ['Micro']),
	createGroupFormat('MgB'),
	createGroupFormat('MTBB', 'Top tier anime group', ['Anime']),
	createGroupFormat('Mysteria', 'Anime group', ['Anime']),

	// N
	createGroupFormat('NAHOM'),
	createGroupFormat('NAN0', 'Efficient x265 encoder'),
	createGroupFormat('Netaro', 'Anime group', ['Anime']),
	createGroupFormat('NhaNc3'),
	createGroupFormat('NoGroup'),
	createGroupFormat('NTb', 'Quality WEB-DL group'),
	createGroupFormat('NTG', 'Quality WEB-DL group'),

	// O
	createGroupFormat('OEPlus'),
	createGroupFormat('Okay-Subs', 'Anime group', ['Anime']),
	createGroupFormat('OZR', 'Top tier anime group', ['Anime']),

	// P
	createGroupFormat('PECULATE', 'WEB-DL group'),
	createGroupFormat('PiRaTeS'),
	createGroupFormat('playBD', 'Quality encode/remux group'),
	createGroupFormat('pog42', 'Anime group', ['Anime']),
	createGroupFormat('Pookie', 'Anime group', ['Anime']),
	createGroupFormat('PSA', 'Micro encoder', ['Micro']),
	createGroupFormat('PTer', 'Quality encode group'),

	// Q
	createGroupFormat('Quetzal', 'Anime group', ['Anime']),
	createGroupFormat('QxR', 'Quality micro encoder', ['Micro']),

	// R
	createGroupFormat('Ralphy', 'Efficient x265 encoder'),
	createGroupFormat('RARBG', 'Popular scene group', ['Micro']),
	createGroupFormat('Rasetsu', 'Anime group', ['Anime']),
	createGroupFormat('RCVR', 'Efficient x265 encoder'),
	createGroupFormat('REBORN', 'Top tier 4K encode group'),

	// S
	createGroupFormat('SA89', 'Top tier 4K encode group'),
	createGroupFormat('sam', 'Top tier anime group', ['Anime']),
	createGroupFormat('SAMPA', 'Efficient x265 encoder'),
	createGroupFormat('SbR', 'Quality encode group'),
	createGroupFormat('SCY', 'Top tier anime group', ['Anime']),
	createGroupFormat('SECTOR7', 'Scene group'),
	createGroupFormat('Senjou', 'Anime group', ['Anime']),
	createGroupFormat('SHD'),
	createGroupFormat('ShieldBearer'),
	createGroupFormat('SiCFoI', 'Remux group'),
	createGroupFormat('SiGMA', 'WEB-DL group'),
	createGroupFormat('Silence', 'Efficient x265 encoder'),
	createGroupFormat('smol', 'Top tier anime group', ['Anime']),
	createGroupFormat('SMURF', 'WEB-DL group'),
	createGroupFormat('SoLaR', 'Top tier 4K encode group'),
	createGroupFormat('SPARKS', 'Scene group'),
	createGroupFormat('STUTTERSHIT'),
	createGroupFormat('SubsPlease', 'Anime WEB source', ['Anime']),

	// T
	createGroupFormat('TAoE', 'Quality efficient encoder'),
	createGroupFormat('tarunk9c'),
	createGroupFormat('TeamSyndicate', 'Quality encode group'),
	createGroupFormat('TEKNO3D'),
	createGroupFormat('TEPES', 'WEB-DL group'),
	createGroupFormat('TGx', 'Micro encoder', ['Micro']),
	createGroupFormat('TheFarm', 'Quality WEB-DL group'),
	createGroupFormat('Tigole', 'Quality micro encoder', ['Micro']),
	createGroupFormat('ToNaTo', 'Efficient x265 encoder'),
	createGroupFormat('TvR'),

	// U
	createGroupFormat('UDF', 'Anime group', ['Anime']),
	createGroupFormat('UnKn0wn'),

	// V
	createGroupFormat('VECTOR'),
	createGroupFormat('Vialle', 'Efficient x265 encoder'),
	createGroupFormat('VietHD', 'Quality encode group'),
	createGroupFormat('Vodes', 'Top tier anime group', ['Anime']),
	createGroupFormat('Vyndros', 'Efficient x265 encoder'),

	// W
	createGroupFormat('W4NK3R', 'Quality 4K encode group'),
	createGroupFormat('WBDP', 'Anime group', ['Anime']),
	createGroupFormat('WiLDCAT', 'Remux group'),

	// X
	createGroupFormat('x0r', 'Micro encoder', ['Micro']),

	// Y
	createGroupFormat('YELLO', 'Efficient x265 encoder'),
	createGroupFormat('YIFY', 'Micro encoder', ['Micro']),
	// YTS with all variants (YTS.MX, YTS.LT, YTS.AG)
	{
		id: 'group-yts',
		name: 'YTS',
		description: 'YTS/YIFY - Popular micro encoder',
		category: 'release_group_tier',
		tags: ['Release Group', 'Micro'],
		conditions: [
			{
				name: 'YTS',
				type: 'release_group',
				pattern: '^YTS(\\.MX|\\.LT|\\.AG)?$',
				required: false,
				negate: false
			},
			{
				name: 'YTS Title',
				type: 'release_title',
				pattern: '\\bYTS(\\.MX|\\.LT|\\.AG)?\\b',
				required: false,
				negate: false
			},
			{
				name: 'YTS Indexer',
				type: 'indexer',
				indexer: 'YTS',
				required: false,
				negate: false
			}
		]
	},
	createGroupFormat('YURI', 'Anime group', ['Anime']),

	// Z
	createGroupFormat('ZoroSenpai', 'Quality encode group'),
	createGroupFormat('ZQ', 'Quality 4K encode group'),
	createGroupFormat('ZR', 'Anime group', ['Anime'])
];

/**
 * All release group tier formats (for backwards compat with index.ts)
 */
export const ALL_GROUP_TIER_FORMATS: CustomFormat[] = RELEASE_GROUP_FORMATS;

/**
 * Get all group names for quick lookup
 */
export const RELEASE_GROUP_NAMES = RELEASE_GROUP_FORMATS.map((f) => f.name);

/**
 * Check if a release group is known
 */
export function isKnownGroup(group: string | undefined): boolean {
	if (!group) return false;
	return RELEASE_GROUP_NAMES.some((name) => group.toLowerCase() === name.toLowerCase());
}
