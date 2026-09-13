import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MalProvider } from './mal.js';
import type { MetadataTitleVariant } from './types.js';

const fetchMock = vi.fn();

vi.stubGlobal('fetch', fetchMock);

function jikanResponse(data: unknown) {
	return { ok: true, json: async () => ({ data }) };
}

const fullAnime = {
	mal_id: 437,
	title: 'Kino no Tabi: The Beautiful World - The Animated Series',
	title_english: 'Kino\u2019s Journey -the Beautiful World- the Animated Series',
	title_japanese: 'キノの旅 -the Beautiful World- the Animated Series',
	titles: [
		{ type: 'Default', title: 'Kino no Tabi: The Beautiful World - The Animated Series' },
		{ type: 'Japanese', title: 'キノの旅 -the Beautiful World- the Animated Series' },
		{ type: 'English', title: 'Kino\u2019s Journey -the Beautiful World- the Animated Series' },
		{ type: 'Synonym', title: 'Kino\u2019s Journey: The Animated Series' }
	],
	images: { jpg: { large_image_url: 'https://img.example/kino.jpg' } },
	synopsis: 'A traveller rides across countries.',
	year: 2017,
	genres: [{ name: 'Adventure' }],
	studios: [{ name: 'Lerche' }],
	status: 'Finished Airing',
	rating: 'PG-13 - Teens 13 or older'
};

describe('MalProvider.getDetails title variants', () => {
	beforeEach(() => {
		fetchMock.mockReset();
		fetchMock.mockResolvedValue(jikanResponse(fullAnime));
	});

	it('exposes english, japanese and titles[] variants instead of discarding them', async () => {
		const provider = new MalProvider(true);
		const details = await provider.getDetails('437');

		expect(details).not.toBeNull();
		// Display mapping is unchanged.
		expect(details?.title).toBe(fullAnime.title_english);
		expect(details?.originalTitle).toBe(fullAnime.title_japanese);

		const variantTitles = (details?.alternateTitles ?? []).map((v: MetadataTitleVariant) => v.title);
		expect(variantTitles).toEqual([
			'Kino\u2019s Journey -the Beautiful World- the Animated Series',
			'キノの旅 -the Beautiful World- the Animated Series',
			'Kino no Tabi: The Beautiful World - The Animated Series',
			'Kino\u2019s Journey: The Animated Series'
		]);
	});

	it('never invents language or country values (Jikan supplies none)', async () => {
		const provider = new MalProvider(true);
		const details = await provider.getDetails('437');

		for (const variant of details?.alternateTitles ?? []) {
			expect(variant.language).toBeNull();
			expect(variant.country).toBeNull();
		}
	});
});
