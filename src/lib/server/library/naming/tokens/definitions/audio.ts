/**
 * Audio tokens - AudioCodec, AudioChannels, AudioLanguages
 */

import type { TokenDefinition } from '../types';
import { normalizeAudioCodec } from '../../normalization';

export const audioTokens: TokenDefinition[] = [
	{
		name: 'AudioCodec',
		category: 'audio',
		description: 'Audio codec (TrueHD, DTS-HD MA, etc.)',
		applicability: ['movie', 'episode'],
		render: (info, config) =>
			config.includeMediaInfo ? normalizeAudioCodec(info.audioCodec) || '' : ''
	},
	{
		name: 'AudioChannels',
		category: 'audio',
		description: 'Audio channels (5.1, 7.1, etc.)',
		applicability: ['movie', 'episode'],
		render: (info, config) => (config.includeMediaInfo ? info.audioChannels || '' : '')
	},
	{
		name: 'AudioLanguages',
		category: 'audio',
		description: 'Audio languages in file',
		applicability: ['movie', 'episode'],
		render: (info, config) => (config.includeMediaInfo ? info.audioLanguages?.join(' ') || '' : '')
	}
];
