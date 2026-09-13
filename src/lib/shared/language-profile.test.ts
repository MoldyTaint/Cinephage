import { describe, expect, it } from 'vitest';
import { makeLanguageProfile, requirementKey } from './language-profile.js';

describe('makeLanguageProfile', () => {
	it('produces a complete default profile', () => {
		const profile = makeLanguageProfile('Movies');
		expect(profile.name).toBe('Movies');
		expect(profile.audio).toEqual({ preferOriginal: true, languages: [] });
		expect(profile.subtitles).toEqual([{ tag: 'en', variant: 'regular', accessibility: 'any' }]);
		expect(profile.cutoffRank).toBeNull();
		expect(profile.minimumScore).toBe(70);
		expect(profile.upgradesAllowed).toBe(true);
	});
});

describe('requirementKey', () => {
	it('returns a stable key over the full requirement tuple', () => {
		expect(
			requirementKey({ tag: 'pt-BR', variant: 'forced', accessibility: 'require-hi' })
		).toBe('pt-BR|forced|require-hi');
	});
});
