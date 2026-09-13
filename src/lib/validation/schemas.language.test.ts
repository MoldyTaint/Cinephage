import { describe, expect, it } from 'vitest';
import {
	audioPreferenceSchema,
	languageProfileV2CreateSchema,
	languageProfileV2UpdateSchema,
	subtitleRequirementSchema
} from './schemas.js';

describe('subtitleRequirementSchema', () => {
	it('canonicalizes tags and applies defaults', () => {
		const parsed = subtitleRequirementSchema.parse({ tag: 'POB' });
		expect(parsed).toEqual({ tag: 'pt-BR', variant: 'regular', accessibility: 'any' });
	});

	it('rejects unknown language codes', () => {
		expect(() => subtitleRequirementSchema.parse({ tag: 'xx' })).toThrow();
	});
});

describe('audioPreferenceSchema', () => {
	it('defaults to original audio with no fallbacks', () => {
		expect(audioPreferenceSchema.parse({})).toEqual({ preferOriginal: true, languages: [] });
	});

	it('canonicalizes fallback languages', () => {
		expect(audioPreferenceSchema.parse({ languages: ['FRE', 'ger'] })).toEqual({
			preferOriginal: true,
			languages: ['fr', 'de']
		});
	});
});

describe('languageProfileV2CreateSchema', () => {
	const validBody = {
		name: 'Anime',
		subtitles: [{ tag: 'ja' }, { tag: 'en', variant: 'forced' }]
	};

	it('accepts a valid profile and applies defaults', () => {
		const parsed = languageProfileV2CreateSchema.parse(validBody);
		expect(parsed.minimumScore).toBe(70);
		expect(parsed.cutoffRank).toBeNull();
		expect(parsed.subtitles[0]).toEqual({ tag: 'ja', variant: 'regular', accessibility: 'any' });
	});

	it('rejects a cutoff rank outside the requirement list', () => {
		expect(() =>
			languageProfileV2CreateSchema.parse({ ...validBody, cutoffRank: 2 })
		).toThrow();
	});

	it('accepts a cutoff rank on the last requirement', () => {
		const parsed = languageProfileV2CreateSchema.parse({ ...validBody, cutoffRank: 1 });
		expect(parsed.cutoffRank).toBe(1);
	});

	it('rejects duplicate requirement tuples', () => {
		expect(() =>
			languageProfileV2CreateSchema.parse({
				name: 'Dupes',
				subtitles: [{ tag: 'en' }, { tag: 'eng' }]
			})
		).toThrow();
	});

	it('clamps the score scale to 0-100', () => {
		expect(() =>
			languageProfileV2CreateSchema.parse({ ...validBody, minimumScore: 360 })
		).toThrow();
	});
});

describe('languageProfileV2UpdateSchema', () => {
	it('accepts partial updates', () => {
		expect(languageProfileV2UpdateSchema.parse({ minimumScore: 50 })).toMatchObject({
			minimumScore: 50
		});
	});
});
