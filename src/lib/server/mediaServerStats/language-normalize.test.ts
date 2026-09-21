import { describe, expect, it } from 'vitest';
import {
	dedupeStreamsByLanguage,
	hasSelectionFlag,
	normalizeLanguageLists,
	pickPrimaryStream
} from './language-normalize.js';

describe('normalizeLanguageLists', () => {
	it('canonicalizes mixed-case and 3-letter codes while preserving raws', () => {
		const { canonical, raw } = normalizeLanguageLists(['ENG', 'fre', 'Jpn']);
		expect(canonical).toEqual(['en', 'fr', 'ja']);
		expect(raw).toEqual(['ENG', 'fre', 'Jpn']);
	});

	it('drops empty values from both views', () => {
		const { canonical, raw } = normalizeLanguageLists(['', '   ', 'eng']);
		expect(canonical).toEqual(['en']);
		expect(raw).toEqual(['eng']);
	});

	it('keeps unknown non-empty values only in the raw view', () => {
		const { canonical, raw } = normalizeLanguageLists(['multi', 'eng', 'unknown']);
		expect(canonical).toEqual(['en']);
		expect(raw).toEqual(['multi', 'eng', 'unknown']);
	});

	it('dedupes canonical tags onto first occurrence while raws stay distinct', () => {
		const { canonical, raw } = normalizeLanguageLists(['eng', 'EN', 'en-US', 'eng']);
		// 'eng' and 'EN' collapse to 'en'; the region-qualified 'en-US' is its own tag.
		expect(canonical).toEqual(['en', 'en-US']);
		expect(raw).toEqual(['eng', 'EN', 'en-US']);
	});

	it('skips non-string values and returns empty lists for no input', () => {
		expect(normalizeLanguageLists([])).toEqual({ canonical: [], raw: [] });
		const { canonical, raw } = normalizeLanguageLists([null, undefined, 42]);
		expect(canonical).toEqual([]);
		expect(raw).toEqual([]);
	});
});

describe('dedupeStreamsByLanguage', () => {
	it('keeps the first stream per normalized tag', () => {
		const streams = [
			{ id: 1, languageCode: 'eng' },
			{ id: 2, languageCode: 'ENG' },
			{ id: 3, languageCode: 'fre' }
		];
		const deduped = dedupeStreamsByLanguage(streams, (s) => s.languageCode);
		expect(deduped.map((s) => s.id)).toEqual([1, 3]);
	});

	it('collapses unlabeled streams onto the first one', () => {
		const streams = [
			{ id: 1, languageCode: undefined },
			{ id: 2, languageCode: 'eng' },
			{ id: 3, languageCode: undefined }
		];
		const deduped = dedupeStreamsByLanguage(streams, (s) => s.languageCode);
		expect(deduped.map((s) => s.id)).toEqual([1, 2]);
	});
});

describe('hasSelectionFlag', () => {
	it('recognizes Plex-style flags', () => {
		expect(hasSelectionFlag({ default: 1 })).toBe(true);
		expect(hasSelectionFlag({ selected: '1' })).toBe(true);
		expect(hasSelectionFlag({ default: true })).toBe(true);
	});

	it('recognizes Jellyfin/Emby-style flags', () => {
		expect(hasSelectionFlag({ IsDefault: true })).toBe(true);
		expect(hasSelectionFlag({ IsSelected: 1 })).toBe(true);
	});

	it('rejects absent and off flags', () => {
		expect(hasSelectionFlag({ default: 0 })).toBe(false);
		expect(hasSelectionFlag({ default: '0' })).toBe(false);
		expect(hasSelectionFlag({})).toBe(false);
		expect(hasSelectionFlag(null)).toBe(false);
		expect(hasSelectionFlag('default')).toBe(false);
	});
});

describe('pickPrimaryStream', () => {
	it('prefers the first stream with a selection flag', () => {
		const streams = [
			{ id: 1, codec: 'dts' },
			{ id: 2, codec: 'aac', default: 1 },
			{ id: 3, codec: 'flac', default: 1 }
		];
		expect(pickPrimaryStream(streams)?.id).toBe(2);
	});

	it('falls back to the first stream when nothing is flagged', () => {
		const streams = [{ id: 1 }, { id: 2 }];
		expect(pickPrimaryStream(streams)?.id).toBe(1);
		expect(pickPrimaryStream([])).toBeNull();
	});
});
