import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AniListProvider } from './anilist.js';
import type { MetadataTitleVariant } from './types.js';

const fetchMock = vi.fn();

vi.stubGlobal('fetch', fetchMock);

const anilistResponse = {
	ok: true,
	json: async () => ({
		data: {
			Media: {
				id: 1,
				title: {
					romaji: 'Kino no Tabi: The Beautiful World',
					english: 'Kino\u2019s Journey',
					native: 'キノの旅 -the Beautiful World-'
				},
				countryOfOrigin: 'JP',
				description: 'A traveller rides across countries.',
				startDate: { year: 2003 },
				coverImage: { large: 'https://img.example/kino.jpg' },
				bannerImage: null,
				genres: ['Adventure'],
				status: 'FINISHED',
				isAdult: false,
				studios: { nodes: [{ name: 'A.C.G.T' }] }
			}
		}
	})
};

describe('AniListProvider.getDetails title variants', () => {
	beforeEach(() => {
		fetchMock.mockReset();
		fetchMock.mockResolvedValue(anilistResponse);
	});

	it('exposes romaji, english and native instead of collapsing them', async () => {
		const provider = new AniListProvider(true);
		const details = await provider.getDetails('1');

		expect(details).not.toBeNull();
		// Display mapping is unchanged (english ?? romaji ?? native).
		expect(details?.title).toBe('Kino\u2019s Journey');
		expect(details?.originalTitle).toBe('キノの旅 -the Beautiful World-');

		const variants = (details?.alternateTitles ?? []).map((v: MetadataTitleVariant) => v.title);
		expect(variants).toEqual([
			'Kino no Tabi: The Beautiful World',
			'Kino\u2019s Journey',
			'キノの旅 -the Beautiful World-'
		]);
	});

	it('keeps language null (AniList supplies no language codes) and attaches countryOfOrigin to the native variant', async () => {
		const provider = new AniListProvider(true);
		const details = await provider.getDetails('1');

		const variants = details?.alternateTitles ?? [];
		expect(variants.map((v) => v.language)).toEqual([null, null, null]);
		expect(variants.find((v) => v.title === 'キノの旅 -the Beautiful World-')?.country).toBe('JP');
		expect(variants.find((v) => v.title === 'Kino\u2019s Journey')?.country).toBeNull();
	});

	it('skips missing titles and duplicates', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({
				data: {
					Media: {
						id: 2,
						title: { romaji: 'Same Title', english: 'Same Title', native: null },
						countryOfOrigin: 'JP'
					}
				}
			})
		});

		const provider = new AniListProvider(true);
		const details = await provider.getDetails('2');

		expect(details?.alternateTitles).toEqual([
			{ title: 'Same Title', language: null, country: null }
		]);
	});
});
