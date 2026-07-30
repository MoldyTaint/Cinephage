import { describe, it, expect } from 'vitest';
import { formatBytes } from './format.js';

describe('formatBytes', () => {
	it('returns "0 B" for 0', () => {
		expect(formatBytes(0)).toBe('0 B');
	});

	it('returns "-" for null', () => {
		expect(formatBytes(null)).toBe('-');
	});

	it('returns "-" for undefined', () => {
		expect(formatBytes(undefined)).toBe('-');
	});

	it('formats bytes', () => {
		expect(formatBytes(500)).toBe('500 B');
	});

	it('formats kilobytes', () => {
		expect(formatBytes(1024)).toBe('1 KB');
	});

	it('formats megabytes with one decimal', () => {
		expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
	});

	it('formats gigabytes', () => {
		expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe('2 GB');
	});

	it('formats terabytes', () => {
		expect(formatBytes(1024 * 1024 * 1024 * 1024)).toBe('1 TB');
	});
});
