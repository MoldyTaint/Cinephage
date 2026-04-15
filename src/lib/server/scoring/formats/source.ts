/**
 * Source-Only Formats
 *
 * These formats match on source alone when resolution detection fails.
 * They provide a baseline score when full resolution+source formats don't match.
 * Scores are intentionally lower than full resolution+source combos.
 */

import type { CustomFormat } from '../types.js';

export const SOURCE_FORMATS: CustomFormat[] = [
	{
		id: 'source-remux',
		name: 'Remux (Any Resolution)',
		description: 'Remux source without detected resolution',
		category: 'source',
		tags: ['Remux', 'Source', 'Lossless'],
		conditions: [{ name: 'Remux', type: 'source', source: 'remux', required: true, negate: false }]
	},
	{
		id: 'source-bluray',
		name: 'BluRay (Any Resolution)',
		description: 'BluRay source without detected resolution',
		category: 'source',
		tags: ['BluRay', 'Source'],
		conditions: [
			{ name: 'BluRay', type: 'source', source: 'bluray', required: true, negate: false }
		]
	},
	{
		id: 'source-hdrip',
		name: 'HDRip (Any Resolution)',
		description: 'HDRip source without detected resolution',
		category: 'source',
		tags: ['HDRip', 'Source'],
		conditions: [{ name: 'HDRip', type: 'source', source: 'hdrip', required: true, negate: false }]
	},
	{
		id: 'source-webdl',
		name: 'WEB-DL (Any Resolution)',
		description: 'WEB-DL source without detected resolution',
		category: 'source',
		tags: ['WEB-DL', 'Source', 'Streaming'],
		conditions: [{ name: 'WEB-DL', type: 'source', source: 'webdl', required: true, negate: false }]
	},
	{
		id: 'source-webrip',
		name: 'WEBRip (Any Resolution)',
		description: 'WEBRip source without detected resolution',
		category: 'source',
		tags: ['WEBRip', 'Source'],
		conditions: [
			{ name: 'WEBRip', type: 'source', source: 'webrip', required: true, negate: false }
		]
	},
	{
		id: 'source-hdtv',
		name: 'HDTV (Any Resolution)',
		description: 'HDTV source without detected resolution',
		category: 'source',
		tags: ['HDTV', 'Source'],
		conditions: [{ name: 'HDTV', type: 'source', source: 'hdtv', required: true, negate: false }]
	},
	{
		id: 'source-dvd',
		name: 'DVD (Any Resolution)',
		description: 'DVD source without detected resolution',
		category: 'source',
		tags: ['DVD', 'Source', 'SD'],
		conditions: [{ name: 'DVD', type: 'source', source: 'dvd', required: true, negate: false }]
	}
];

export const ALL_SOURCE_FORMATS: CustomFormat[] = SOURCE_FORMATS;
