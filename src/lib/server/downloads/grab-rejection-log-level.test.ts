import { describe, it, expect } from 'vitest';
import { grabRejectionLogLevel } from './grab-rejection-log-level.js';

describe('grabRejectionLogLevel', () => {
	it('returns warn for interactive (user-initiated) grabs', () => {
		expect(grabRejectionLogLevel(false)).toBe('warn');
	});

	it('returns debug for automated grabs', () => {
		expect(grabRejectionLogLevel(true)).toBe('debug');
	});

	it('defaults to warn when isAutomatic is unspecified', () => {
		expect(grabRejectionLogLevel(undefined as unknown as boolean)).toBe('warn');
	});
});
