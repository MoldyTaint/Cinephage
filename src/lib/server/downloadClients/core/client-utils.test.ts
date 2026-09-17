import { describe, expect, it } from 'vitest';
import { joinCategoryPath } from './client-utils.js';

describe('joinCategoryPath', () => {
	it('joins base and category', () => {
		expect(joinCategoryPath('/downloads', 'movies')).toBe('/downloads/movies');
	});

	it('trims whitespace and trailing slashes', () => {
		expect(joinCategoryPath('/downloads///', '  tv  ')).toBe('/downloads/tv');
	});

	it('returns empty for blank base or category', () => {
		expect(joinCategoryPath('', 'movies')).toBe('');
		expect(joinCategoryPath('/downloads', '')).toBe('');
		expect(joinCategoryPath('/downloads', '   ')).toBe('');
	});
});
