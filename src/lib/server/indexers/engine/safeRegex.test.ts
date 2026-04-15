import { describe, it, expect } from 'vitest';
import { createSafeRegex, safeReplace } from './safeRegex';

describe('safeRegex', () => {
	it('supports leading inline case-insensitive flag syntax', () => {
		const regex = createSafeRegex('(?i)(\\s*/\\s*[^/]+)$', 'g');
		expect(regex).not.toBeNull();
		expect(regex?.flags.includes('g')).toBe(true);
		expect(regex?.flags.includes('i')).toBe(true);

		const result = safeReplace('War Machine / Военная машина', regex!, '');
		expect(result).toBe('War Machine');
	});

	it('adds inline case-insensitive flag for matching', () => {
		const regex = createSafeRegex('(?i)abc');
		expect(regex).not.toBeNull();
		expect(regex?.flags.includes('i')).toBe(true);
		expect(regex?.test('ABC')).toBe(true);
	});

	it('supports disabling inherited inline flags', () => {
		const regex = createSafeRegex('(?-i)abc', 'i');
		expect(regex).not.toBeNull();
		expect(regex?.flags.includes('i')).toBe(false);
		expect(regex?.test('ABC')).toBe(false);
		expect(regex?.test('abc')).toBe(true);
	});
});
