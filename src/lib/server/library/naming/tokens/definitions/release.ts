/**
 * Release tokens - ReleaseGroup, Edition
 */

import type { TokenDefinition } from '../types';

export const releaseTokens: TokenDefinition[] = [
	{
		name: 'ReleaseGroup',
		aliases: ['Group'],
		category: 'release',
		description: 'Release group name',
		applicability: ['movie', 'episode'],
		render: (info, config) => (config.includeReleaseGroup ? info.releaseGroup || '' : '')
	},
	{
		name: 'Edition',
		category: 'release',
		description: 'Edition (Directors Cut, Extended, etc.)',
		applicability: ['movie'],
		render: (info) => info.edition || ''
	}
];
