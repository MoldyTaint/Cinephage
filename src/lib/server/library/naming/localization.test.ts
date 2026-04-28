import { describe, it, expect } from 'vitest';
import { extractLanguageCodes } from './localization';
import { coreTokens } from './tokens/definitions/core';

describe('extractLanguageCodes', () => {
	it('extracts language codes from format string', () => {
		expect(extractLanguageCodes('{Title:ES} ({Year})')).toEqual(['es']);
	});

	it('extracts multiple unique codes', () => {
		expect(extractLanguageCodes('{Title:ES} - {CleanTitle:FR}')).toEqual(['es', 'fr']);
	});

	it('deduplicates codes', () => {
		expect(extractLanguageCodes('{Title:ES} - {CleanTitle:ES}')).toEqual(['es']);
	});

	it('returns empty for no language tokens', () => {
		expect(extractLanguageCodes('{Title} ({Year})')).toEqual([]);
	});

	it('handles case-insensitive codes', () => {
		expect(extractLanguageCodes('{Title:es}')).toEqual(['es']);
	});
});

describe('Language-aware title tokens', () => {
	const titleToken = coreTokens.find((t) => t.name === 'Title')!;
	const cleanToken = coreTokens.find((t) => t.name === 'CleanTitle')!;

	it('Title with language code returns localized title', () => {
		expect(
			titleToken.render(
				{ title: 'Fight Club', localizedTitles: { es: 'El club de la lucha' } },
				{} as any,
				'ES'
			)
		).toBe('El club de la lucha');
	});

	it('Title falls back to default when language not in map', () => {
		expect(
			titleToken.render(
				{ title: 'Fight Club', localizedTitles: { es: 'El club de la lucha' } },
				{} as any,
				'FR'
			)
		).toBe('Fight Club');
	});

	it('Title without format spec returns default title', () => {
		expect(
			titleToken.render(
				{ title: 'Fight Club', localizedTitles: { es: 'El club de la lucha' } },
				{} as any
			)
		).toBe('Fight Club');
	});

	it('CleanTitle with language code returns localized clean title', () => {
		expect(
			cleanToken.render(
				{ title: 'Fight Club', localizedTitles: { es: 'El club de la lucha: Editado' } },
				{} as any,
				'ES'
			)
		).toBe('El club de la lucha: Editado');
	});

	it('numeric format spec is not treated as language code', () => {
		expect(
			titleToken.render({ title: 'Test', localizedTitles: { '00': 'Wrong' } }, {} as any, '00')
		).toBe('Test');
	});
});
