import { describe, expect, it } from 'vitest';
import { ensureVersionPrefix } from './version.js';

describe('ensureVersionPrefix', () => {
	it('adds the v prefix to a bare version', () => {
		expect(ensureVersionPrefix('0.16.0')).toBe('v0.16.0');
	});

	it('does not duplicate an existing v prefix', () => {
		expect(ensureVersionPrefix('v0.16.0')).toBe('v0.16.0');
	});

	it('leaves dev builds unchanged', () => {
		expect(ensureVersionPrefix('dev-20260901-492')).toBe('dev-20260901-492');
	});

	it('leaves sha builds unchanged', () => {
		expect(ensureVersionPrefix('sha-abc1234')).toBe('sha-abc1234');
	});
});
