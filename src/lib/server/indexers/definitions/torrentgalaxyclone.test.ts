/**
 * TorrentGalaxy Clone Definition Filter Tests
 *
 * Guards the filter chains in data/indexers/definitions/torrentgalaxyclone.yaml:
 * - imdbid extraction from /get-posts/keywords:tt123... hrefs (the upstream
 *   community definition shipped a double-escaped \\d that never matched)
 * - date parsing for the site's compound relative ages ("1 week, 5 days"),
 *   which the timeago filter alone cannot parse (it requires an "ago" suffix)
 */

import { describe, it, expect } from 'vitest';
import { createFilterEngine } from '../engine/FilterEngine.js';
import type { FilterBlock } from '../schema/yamlDefinition';

// Must match the imdbid field filters in torrentgalaxyclone.yaml
const IMDBID_FILTERS: FilterBlock[] = [
	{ name: 're_replace', args: ['.*keywords:(tt\\d+).*', '$1'] }
];

// Must match the date field filters in torrentgalaxyclone.yaml
const DATE_FILTERS: FilterBlock[] = [
	{ name: 'split', args: [',', '0'] },
	{ name: 'append', args: ' ago' },
	{ name: 'timeago' }
];

describe('TorrentGalaxy Clone imdbid extraction', () => {
	const engine = createFilterEngine();

	it('extracts the imdb id from a live-format keywords href', () => {
		const result = engine.applyFilters('/get-posts/keywords:tt1375666', IMDBID_FILTERS);
		expect(result).toBe('tt1375666');
	});

	it('extracts the imdb id when the href has trailing segments', () => {
		const result = engine.applyFilters('/get-posts/keywords:tt0944947:foo', IMDBID_FILTERS);
		expect(result).toBe('tt0944947');
	});
});

describe('TorrentGalaxy Clone date parsing', () => {
	const engine = createFilterEngine();

	it('parses compound relative ages by keeping the leading segment', () => {
		const result = engine.applyFilters('1 week, 5 days', DATE_FILTERS);
		expect(result).not.toBe('1 week, 5 days');
		const parsed = new Date(result);
		expect(Number.isNaN(parsed.getTime())).toBe(false);
		const ageMs = Date.now() - parsed.getTime();
		const sixDays = 6 * 24 * 60 * 60 * 1000;
		const eightDays = 8 * 24 * 60 * 60 * 1000;
		expect(ageMs).toBeGreaterThan(sixDays);
		expect(ageMs).toBeLessThan(eightDays);
	});

	it('parses single-segment relative ages', () => {
		const result = engine.applyFilters('23 hours', DATE_FILTERS);
		const parsed = new Date(result);
		expect(Number.isNaN(parsed.getTime())).toBe(false);
	});
});
