/**
 * TokenRegistry alias tests (issue #497)
 *
 * Docs-style token names must resolve through aliases, with whitespace
 * stripped during lookup, and suggestions must be alias-aware.
 */

import { describe, it, expect } from 'vitest';
import { tokenRegistry } from './index';

describe('TokenRegistry spaced aliases', () => {
	it.each([
		['Movie Title', 'Title'],
		['Series Title', 'Title'],
		['Movie CleanTitle', 'CleanTitle'],
		['Series CleanTitle', 'CleanTitle'],
		['Release Year', 'Year'],
		['Series Year', 'Year'],
		['Movie OriginalTitle', 'OriginalTitle'],
		['Series OriginalTitle', 'OriginalTitle'],
		['IMDb Id', 'ImdbId'],
		['TMDB Id', 'TmdbId'],
		['TMDb Id', 'TmdbId'],
		['TVDb Id', 'TvdbId'],
		['TVMDb Id', 'TvdbId'],
		['Quality Full', 'QualityFull'],
		['Quality Source', 'QualityFull'],
		['Quality Title', 'Resolution'],
		['Quality Type', 'Source'],
		['Release Group', 'ReleaseGroup'],
		['Edition Tags', 'Edition'],
		['MediaInfo VideoCodec', 'VideoCodec'],
		['MediaInfo AudioCodec', 'AudioCodec'],
		['MediaInfo AudioChannels', 'AudioChannels'],
		['MediaInfo AudioChannelsFriendly', 'AudioChannels'],
		['Audio', 'AudioChannels'],
		['Audio Channels', 'AudioChannels'],
		['MediaInfo VideoBitDepth', 'BitDepth'],
		['MediaInfo VideoDynamicRangeType', 'HDR'],
		['Air Date', 'AirDate'],
		['Absolute Episode', 'Absolute'],
		['Episode Title', 'EpisodeTitle'],
		['Movie Collection', 'Collection']
	])("resolves '{%s}' to token '%s'", (alias, tokenName) => {
		expect(tokenRegistry.has(alias)).toBe(true);
		expect(tokenRegistry.get(alias)?.name).toBe(tokenName);
	});

	it("does NOT alias 'Quality' (engine Quality = Source-Resolution, docs Quality = resolution only)", () => {
		expect(tokenRegistry.get('Quality')?.name).toBe('Quality');
	});

	it('renders through aliases', () => {
		const info = {
			title: 'The Matrix',
			year: 1999,
			resolution: '1080p',
			source: 'bluray'
		} as any;
		const config = { includeQuality: true, includeMediaInfo: true } as any;
		expect(tokenRegistry.render('Quality Full', info, config)).toBe('Bluray-1080p');
		expect(tokenRegistry.render('Release Year', info, config)).toBe('1999');
	});

	it('suggests spaced docs-style alias names for typos', () => {
		const result = tokenRegistry.validate('Movie Tital');
		expect(result.valid).toBe(false);
		expect(result.suggestion).toBe('Movie Title');
	});
});
