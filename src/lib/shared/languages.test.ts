import { describe, expect, it } from 'vitest';
import {
	ALL_LANGUAGE_OPTIONS,
	SUPPORTED_LANGUAGES,
	canonicalizeLanguageTag,
	getLanguageDefinition,
	getLanguageName,
	isValidLanguageCode,
	normalizeLanguageCode
} from './languages.js';

describe('canonicalizeLanguageTag', () => {
	it('maps bibliographic and terminologic ISO 639-2 codes to base tags', () => {
		expect(canonicalizeLanguageTag('eng')).toBe('en');
		expect(canonicalizeLanguageTag('ger')).toBe('de');
		expect(canonicalizeLanguageTag('deu')).toBe('de');
		expect(canonicalizeLanguageTag('fre')).toBe('fr');
		expect(canonicalizeLanguageTag('fra')).toBe('fr');
		expect(canonicalizeLanguageTag('dut')).toBe('nl');
		expect(canonicalizeLanguageTag('nld')).toBe('nl');
		expect(canonicalizeLanguageTag('ces')).toBe('cs');
		expect(canonicalizeLanguageTag('cze')).toBe('cs');
	});

	it('normalizes case, whitespace, and separators', () => {
		expect(canonicalizeLanguageTag('EN')).toBe('en');
		expect(canonicalizeLanguageTag(' pt_br ')).toBe('pt-BR');
		expect(canonicalizeLanguageTag('de-de')).toBe('de-DE');
		expect(canonicalizeLanguageTag('en-US')).toBe('en-US');
	});

	it('maps Chinese and legacy variants to canonical tags', () => {
		expect(canonicalizeLanguageTag('zh-cn')).toBe('zh-Hans');
		expect(canonicalizeLanguageTag('chs')).toBe('zh-Hans');
		expect(canonicalizeLanguageTag('zhs')).toBe('zh-Hans');
		expect(canonicalizeLanguageTag('zh-tw')).toBe('zh-Hant');
		expect(canonicalizeLanguageTag('cht')).toBe('zh-Hant');
		expect(canonicalizeLanguageTag('zht')).toBe('zh-Hant');
		expect(canonicalizeLanguageTag('chi')).toBe('zh');
		expect(canonicalizeLanguageTag('es-la')).toBe('es-419');
		expect(canonicalizeLanguageTag('pob')).toBe('pt-BR');
	});

	it('returns an empty string for unknown languages', () => {
		expect(canonicalizeLanguageTag('xx-zz')).toBe('');
		expect(canonicalizeLanguageTag('')).toBe('');
		expect(canonicalizeLanguageTag('not a language')).toBe('');
	});
});

describe('registry data', () => {
	it('contains a fixed Armenian native name', () => {
		const armenian = SUPPORTED_LANGUAGES.find((lang) => lang.code === 'hy');
		expect(armenian?.nativeName).toBe('Հայերեն');
	});

	it('exposes title-case canonical variants in dropdown options', () => {
		const codes = ALL_LANGUAGE_OPTIONS.map((option) => option.code);
		expect(codes).toContain('pt-BR');
		expect(codes).toContain('zh-Hans');
		expect(codes).toContain('zh-Hant');
		expect(codes).toContain('es-419');
	});
});

describe('helper compatibility', () => {
	it('accepts alpha-3 codes consistently', () => {
		expect(isValidLanguageCode('eng')).toBe(true);
		expect(isValidLanguageCode('deu')).toBe(true);
		expect(isValidLanguageCode('xx')).toBe(false);
	});

	it('normalizes for display lookup without throwing on unknown input', () => {
		expect(normalizeLanguageCode('ENG')).toBe('en');
		expect(normalizeLanguageCode('xx')).toBe('xx');
	});

	it('resolves names through canonicalization', () => {
		expect(getLanguageName('eng')).toBe('English');
		expect(getLanguageName('pt-br')).toBe('Portuguese (Brazil)');
		expect(getLanguageName('de-DE')).toBe('German (DE)');
		expect(getLanguageName('xx')).toBe('XX');
	});

	it('looks definitions up by alias or canonical tag', () => {
		expect(getLanguageDefinition('ger')?.code).toBe('de');
		expect(getLanguageDefinition('zh-cn')?.name).toBe('Chinese (Simplified)');
		expect(getLanguageDefinition('xx')).toBeUndefined();
	});
});
