import { describe, expect, it } from 'vitest';
import { displayTitle, resolvePreferOriginalTitle } from './title-display';

describe('resolvePreferOriginalTitle', () => {
	it('prefers an explicit per-item true over an off instance default', () => {
		expect(resolvePreferOriginalTitle({ preferOriginalTitle: true }, false)).toBe(true);
	});

	it('prefers an explicit per-item false over an on instance default', () => {
		expect(resolvePreferOriginalTitle({ preferOriginalTitle: false }, true)).toBe(false);
	});

	it('fills the unset per-item case with the instance default', () => {
		expect(resolvePreferOriginalTitle({ preferOriginalTitle: null }, true)).toBe(true);
		expect(resolvePreferOriginalTitle({ preferOriginalTitle: undefined }, true)).toBe(true);
		expect(resolvePreferOriginalTitle({ preferOriginalTitle: null }, false)).toBe(false);
		expect(resolvePreferOriginalTitle({}, true)).toBe(true);
	});

	it('falls back to false when neither the item nor the instance default is set', () => {
		expect(resolvePreferOriginalTitle({})).toBe(false);
		expect(resolvePreferOriginalTitle({ preferOriginalTitle: null }, null)).toBe(false);
	});
});

describe('displayTitle', () => {
	const item = { title: 'Le Film', originalTitle: 'The Movie', preferOriginalTitle: null };

	it('returns the localized title by default', () => {
		expect(displayTitle(item)).toBe('Le Film');
		expect(displayTitle(item, false)).toBe('Le Film');
	});

	it('returns originalTitle when the instance default is on and the item is unset', () => {
		expect(displayTitle(item, true)).toBe('The Movie');
	});

	it('keeps per-item behavior unchanged when set', () => {
		expect(displayTitle({ ...item, preferOriginalTitle: true }, false)).toBe('The Movie');
		expect(displayTitle({ ...item, preferOriginalTitle: false }, true)).toBe('Le Film');
	});

	it('falls back to the title when originalTitle is missing', () => {
		expect(displayTitle({ title: 'Only', originalTitle: null }, true)).toBe('Only');
		expect(displayTitle({ title: 'Only', originalTitle: null, preferOriginalTitle: true })).toBe(
			'Only'
		);
	});
});
