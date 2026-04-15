import { describe, expect, it } from 'vitest';

import { normalizeLiveTvChannelName } from './channel-name-normalizer';

describe('normalizeLiveTvChannelName', () => {
	it('cleans common stalker prefixes and quality suffixes', () => {
		expect(normalizeLiveTvChannelName('(US) A&E 4K+', 'stalker')).toBe('A&E');
		expect(normalizeLiveTvChannelName('SLING| NEWSNATION ᴿᴬᵂ', 'stalker')).toBe('NewsNation');
		expect(normalizeLiveTvChannelName('SLING| FOX SPORTS 1 ᴿᴬᵂ', 'stalker')).toBe('FOX Sports 1');
		expect(normalizeLiveTvChannelName('UK| SKY KIDS HEVC FHD', 'stalker')).toBe('Sky Kids');
		expect(normalizeLiveTvChannelName('ENGLISH| NAT GEO WILD HD', 'stalker')).toBe('Nat Geo Wild');
	});

	it('removes parenthetical and bracketed metadata from m3u names', () => {
		expect(normalizeLiveTvChannelName('Super Simple Songs (1080p)', 'm3u')).toBe(
			'Super Simple Songs'
		);
		expect(normalizeLiveTvChannelName('Newsmax 2 (1080p) [Geo-blocked]', 'm3u')).toBe('Newsmax 2');
		expect(normalizeLiveTvChannelName('AFV en Español (720p) [Not 24/7]', 'm3u')).toBe(
			'AFV en Español'
		);
	});

	it('keeps meaningful channel variants and brands intact', () => {
		expect(normalizeLiveTvChannelName('UK| EDEN +1', 'stalker')).toBe('EDEN +1');
		expect(normalizeLiveTvChannelName('Disney+', 'iptvorg')).toBe('Disney+');
		expect(normalizeLiveTvChannelName('Paramount+', 'm3u')).toBe('Paramount+');
		expect(normalizeLiveTvChannelName('ABC 9 WAUSAU WI (WAOW)', 'stalker')).toBe(
			'ABC 9 WAUSAU WI (WAOW)'
		);
	});

	it('cleans decorative wrappers and better casing', () => {
		expect(normalizeLiveTvChannelName('##### FOX WASHINGTON #####', 'stalker')).toBe(
			'FOX Washington'
		);
		expect(normalizeLiveTvChannelName('EN| ONEPLAY BABYSHARK ᴴᴰ', 'stalker')).toBe(
			'OnePlay BabyShark'
		);
		expect(normalizeLiveTvChannelName('US| SPORTSNET LA LAKERS HD', 'stalker')).toBe(
			'Sportsnet LA Lakers'
		);
	});

	it('cleans pseudo-channels and event artifacts without mangling sports feeds', () => {
		expect(normalizeLiveTvChannelName('24/7 STILL THE KING', 'stalker')).toBe('Still the King');
		expect(normalizeLiveTvChannelName('24/7 MR BEAN THE ANIMATED SERIES', 'stalker')).toBe(
			'Mr Bean the Animated Series'
		);
		expect(normalizeLiveTvChannelName('UFC| 24/7', 'stalker')).toBe('UFC| 24/7');
		expect(normalizeLiveTvChannelName('NHL | 04 - 7pm Mammoth @ Capitals', 'stalker')).toBe(
			'NHL | 04 - 7pm Mammoth @ Capitals'
		);
	});

	it('strips noisy live-event provider wrappers when the title survives', () => {
		expect(
			normalizeLiveTvChannelName(
				'(FLSP 964) | flolive: 2026 George Fox University vs Whitman _ Women`s Lacrosse (George Fox vs Whitman) (2026-03-08 16:00:20)',
				'stalker'
			)
		).toBe('2026 George Fox University vs Whitman Women`s Lacrosse (George Fox vs Whitman)');
	});

	it('leaves already clean names alone', () => {
		expect(normalizeLiveTvChannelName('Mythbusters', 'iptvorg')).toBe('Mythbusters');
		expect(normalizeLiveTvChannelName('Court TV', 'iptvorg')).toBe('Court TV');
	});
});
