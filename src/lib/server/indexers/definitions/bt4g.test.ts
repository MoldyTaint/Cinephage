/**
 * BT4G Definition Filter Tests
 *
 * Guards the re_replace chains in data/indexers/definitions/bt4g.yaml that
 * extract size and infohash from the RSS <description> element, whose payload
 * looks like: "Title<br>1.85GB<br>Movie<br><40-hex-infohash>".
 */

import { describe, it, expect } from 'vitest';
import { createFilterEngine } from '../engine/FilterEngine.js';
import type { FilterBlock } from '../schema/yamlDefinition';

// Live-captured RSS description payload (bt4gprx.com, 2026-07-18)
const LIVE_DESCRIPTION =
	'Inception (2010) [1080p]<br>1.85GB<br>Movie<br>224bf45881252643dfc2e71abc7b2660a21c68c4';

// Must match the size field filters in bt4g.yaml
const SIZE_FILTERS: FilterBlock[] = [
	{ name: 're_replace', args: ['(?is)^.*?<br\\s*/?>\\s*([^<]+).*$', '$1'] },
	{ name: 'trim' }
];

// Must match the infohash field filters in bt4g.yaml
const INFOHASH_FILTERS: FilterBlock[] = [
	{ name: 're_replace', args: ['(?is)^.*<br\\s*/?>\\s*([a-fA-F0-9]{40})\\s*$', '$1'] }
];

describe('BT4G description parsing', () => {
	const engine = createFilterEngine();

	it('extracts size from the first <br> segment', () => {
		const result = engine.applyFilters(LIVE_DESCRIPTION, SIZE_FILTERS);
		expect(result).toBe('1.85GB');
	});

	it('extracts the 40-hex infohash from the last <br> segment', () => {
		const result = engine.applyFilters(LIVE_DESCRIPTION, INFOHASH_FILTERS);
		expect(result).toBe('224bf45881252643dfc2e71abc7b2660a21c68c4');
	});

	it('handles self-closing <br/> variants', () => {
		const selfClosing =
			'Some Show S01E01<br/>700.5 MB<br/>Movie<br/>abcdef0123456789abcdef0123456789abcdef01';
		expect(engine.applyFilters(selfClosing, SIZE_FILTERS)).toBe('700.5 MB');
		expect(engine.applyFilters(selfClosing, INFOHASH_FILTERS)).toBe(
			'abcdef0123456789abcdef0123456789abcdef01'
		);
	});

	it('passes the description through unchanged when no infohash is present', () => {
		const noHash = 'Some Title<br>1.2GB<br>Movie<br>not-a-hash';
		expect(engine.applyFilters(noHash, INFOHASH_FILTERS)).toBe(noHash);
	});
});
