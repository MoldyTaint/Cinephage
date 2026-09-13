import { describe, expect, it } from 'vitest';
import {
	movieUpdateSchema,
	seriesUpdateSchema,
	normalizeLegacyMetadataLanguage
} from './schemas.js';

/**
 * The metadata-language override pair shared by the movie/series update
 * schemas: metadataLanguageMode ('inherit' | 'original' | 'explicit') +
 * metadataLanguageValue (required for explicit, forced null otherwise).
 */
describe('metadata language mode/value pair', () => {
	it('leaves the pair untouched when no language field is supplied (partial patch)', () => {
		const parsed = movieUpdateSchema.parse({ monitored: true });

		expect(parsed).not.toHaveProperty('metadataLanguageMode');
		expect(parsed).not.toHaveProperty('metadataLanguageValue');
		expect(parsed).not.toHaveProperty('metadataLanguage');
	});

	it('rejects explicit mode without a value', () => {
		const result = movieUpdateSchema.safeParse({ metadataLanguageMode: 'explicit' });
		expect(result.success).toBe(false);
	});

	it('rejects explicit mode with an invalid locale', () => {
		const result = movieUpdateSchema.safeParse({
			metadataLanguageMode: 'explicit',
			metadataLanguageValue: 'not a locale!!'
		});
		expect(result.success).toBe(false);
	});

	it('canonicalizes an explicit locale', () => {
		const parsed = movieUpdateSchema.parse({
			metadataLanguageMode: 'explicit',
			metadataLanguageValue: 'EN-us'
		});

		expect(parsed.metadataLanguageMode).toBe('explicit');
		expect(parsed.metadataLanguageValue).toBe('en-US');
	});

	it('forces the value null for original mode', () => {
		const parsed = seriesUpdateSchema.parse({
			metadataLanguageMode: 'original',
			metadataLanguageValue: 'de'
		});

		expect(parsed.metadataLanguageMode).toBe('original');
		expect(parsed.metadataLanguageValue).toBeNull();
	});

	it('forces the value null for inherit mode', () => {
		const parsed = movieUpdateSchema.parse({
			metadataLanguageMode: 'inherit',
			metadataLanguageValue: 'de'
		});

		expect(parsed.metadataLanguageMode).toBe('inherit');
		expect(parsed.metadataLanguageValue).toBeNull();
	});

	it('maps a bare legacy locale string onto explicit/canonical', () => {
		const parsed = movieUpdateSchema.parse({ metadataLanguage: 'EN-us' });

		expect(parsed.metadataLanguageMode).toBe('explicit');
		expect(parsed.metadataLanguageValue).toBe('en-US');
	});

	it("maps the legacy 'original' string onto original", () => {
		const parsed = seriesUpdateSchema.parse({ metadataLanguage: 'original' });

		expect(parsed.metadataLanguageMode).toBe('original');
		expect(parsed.metadataLanguageValue).toBeNull();
	});

	it('maps a null legacy string onto inherit', () => {
		const parsed = movieUpdateSchema.parse({ metadataLanguage: null });

		expect(parsed.metadataLanguageMode).toBe('inherit');
		expect(parsed.metadataLanguageValue).toBeNull();
	});

	it('degrades an unresolvable legacy string to inherit instead of failing', () => {
		const result = seriesUpdateSchema.safeParse({ metadataLanguage: 'garbage!!' });

		expect(result.success).toBe(true);
		expect(result.success && result.data.metadataLanguageMode).toBe('inherit');
		expect(result.success && result.data.metadataLanguageValue).toBeNull();
	});

	it('rejects mixing the legacy string with the mode/value pair', () => {
		const result = movieUpdateSchema.safeParse({
			metadataLanguage: 'de',
			metadataLanguageMode: 'explicit',
			metadataLanguageValue: 'fr'
		});

		expect(result.success).toBe(false);
	});

	it('normalizeLegacyMetadataLanguage maps each legacy form', () => {
		expect(normalizeLegacyMetadataLanguage('fr')).toEqual({ mode: 'explicit', value: 'fr' });
		expect(normalizeLegacyMetadataLanguage('original')).toEqual({
			mode: 'original',
			value: null
		});
		expect(normalizeLegacyMetadataLanguage(null)).toEqual({ mode: 'inherit', value: null });
		expect(normalizeLegacyMetadataLanguage(undefined)).toEqual({ mode: 'inherit', value: null });
		expect(normalizeLegacyMetadataLanguage('garbage!!')).toEqual({
			mode: 'inherit',
			value: null
		});
	});
});
