/**
 * Audio tokens - AudioCodec, AudioChannels, AudioLanguages
 */

import type { TokenDefinition } from '../types';
import { normalizeAudioCodec } from '../../normalization';
import { normalizeLanguageTag } from '../../../../languages/normalize.js';

export const audioTokens: TokenDefinition[] = [
	{
		name: 'AudioCodec',
		aliases: ['MediaInfo AudioCodec'],
		category: 'audio',
		description: 'Audio codec (TrueHD, DTS-HD MA, etc.)',
		applicability: ['movie', 'episode'],
		render: (info, config) =>
			config.includeMediaInfo ? normalizeAudioCodec(info.audioCodec) || '' : ''
	},
	{
		name: 'AudioChannels',
		aliases: [
			'MediaInfo AudioChannels',
			'MediaInfo AudioChannelsFriendly',
			'Audio',
			'Audio Channels'
		],
		category: 'audio',
		description: 'Audio channels (5.1, 7.1, etc.)',
		applicability: ['movie', 'episode'],
		render: (info, config) => (config.includeMediaInfo ? info.audioChannels || '' : '')
	},
	{
		name: 'AudioLanguages',
		category: 'audio',
		description: 'Canonical audio language tags in file (und when unknown)',
		applicability: ['movie', 'episode'],
		render: (info, config) => {
			if (!config.includeMediaInfo) return '';
			// Canonicalize every source value (ffprobe emits ISO 639-2 like `eng`);
			// markers such as `multi`/`und` normalize to `und`, never to a guess.
			// Duplicate tracks (main + commentary both English) render ONCE.
			const seen = new Set<string>();
			const meaningful: string[] = [];
			for (const code of info.audioLanguages ?? []) {
				const tag = normalizeLanguageTag(code);
				if (tag === 'und' || seen.has(tag)) continue;
				seen.add(tag);
				meaningful.push(tag);
			}
			// Empty or fully-unknown track sets render as `und`.
			return meaningful.length > 0 ? meaningful.join(' ') : 'und';
		}
	}
];
