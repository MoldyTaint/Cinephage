import { describe, expect, it } from 'vitest';
import {
	normalizeLanguageTag,
	normalizeMetadataLocale,
	normalizeTmdbLanguage,
	parseObservedLanguage
} from './normalize.js';

describe('normalizeLanguageTag', () => {
	it('normalizes ISO and alias inputs to canonical tags', () => {
		expect(normalizeLanguageTag('eng')).toBe('en');
		expect(normalizeLanguageTag('EN')).toBe('en');
		expect(normalizeLanguageTag('deu')).toBe('de');
		expect(normalizeLanguageTag('pob')).toBe('pt-BR');
		expect(normalizeLanguageTag('pt_br')).toBe('pt-BR');
		expect(normalizeLanguageTag('zh-tw')).toBe('zh-Hant');
		expect(normalizeLanguageTag('es-la')).toBe('es-419');
	});

	it('handles languages missing from the curated registry', () => {
		expect(normalizeLanguageTag('ast')).toBe('ast');
		expect(normalizeLanguageTag('yue')).toBe('yue');
	});

	it('preserves valid region subtags for known languages', () => {
		expect(normalizeLanguageTag('de-DE')).toBe('de-DE');
		expect(normalizeLanguageTag('en-us')).toBe('en-US');
	});

	it('maps unknown and empty input to und', () => {
		expect(normalizeLanguageTag(null)).toBe('und');
		expect(normalizeLanguageTag(undefined)).toBe('und');
		expect(normalizeLanguageTag('')).toBe('und');
		expect(normalizeLanguageTag('xx-zz')).toBe('und');
		expect(normalizeLanguageTag('not a language')).toBe('und');
	});

	it('maps release markers to und rather than asserting English', () => {
		expect(normalizeLanguageTag('multi')).toBe('und');
		expect(normalizeLanguageTag('orig')).toBe('und');
		expect(normalizeLanguageTag('unknown')).toBe('und');
		expect(normalizeLanguageTag('und')).toBe('und');
	});
});

describe('parseObservedLanguage', () => {
	it('keeps the raw value alongside the canonical tag', () => {
		expect(parseObservedLanguage('ENG')).toEqual({ raw: 'ENG', canonical: 'en' });
		expect(parseObservedLanguage(null)).toEqual({ raw: '', canonical: 'und' });
	});
});

describe('normalizeMetadataLocale', () => {
	it('canonicalizes valid locales', () => {
		expect(normalizeMetadataLocale('EN-us')).toBe('en-US');
		expect(normalizeMetadataLocale('fr-fr')).toBe('fr-FR');
		expect(normalizeMetadataLocale('de')).toBe('de');
	});

	it('returns null for invalid or empty locales', () => {
		expect(normalizeMetadataLocale('')).toBeNull();
		expect(normalizeMetadataLocale(null)).toBeNull();
		expect(normalizeMetadataLocale('not a locale')).toBeNull();
	});
});

describe('normalizeTmdbLanguage', () => {
	it('reduces tags to the TMDB base language', () => {
		expect(normalizeTmdbLanguage('eng')).toBe('en');
		expect(normalizeTmdbLanguage('pt-BR')).toBe('pt');
		expect(normalizeTmdbLanguage('zh-Hant')).toBe('zh');
	});

	it('returns null for unresolved input', () => {
		expect(normalizeTmdbLanguage('xx')).toBeNull();
		expect(normalizeTmdbLanguage(null)).toBeNull();
	});
});
