import { describe, expect, it } from 'vitest';
import { isRecord, getFirstString, getHttpErrorStatus } from './shared.js';

describe('cinephage/shared', () => {
	it('isRecord identifies plain objects only', () => {
		expect(isRecord({ a: 1 })).toBe(true);
		expect(isRecord(null)).toBe(false);
		expect(isRecord([1, 2])).toBe(false);
		expect(isRecord('x')).toBe(false);
	});

	it('getFirstString returns the first non-blank trimmed string', () => {
		expect(getFirstString(undefined, '', '  hello  ', 'world')).toBe('hello');
		expect(getFirstString(undefined, 42, null)).toBeUndefined();
	});

	it('getHttpErrorStatus reads a numeric status property', () => {
		expect(getHttpErrorStatus({ status: 401 })).toBe(401);
		expect(getHttpErrorStatus(new Error('nope'))).toBeUndefined();
		expect(getHttpErrorStatus('x')).toBeUndefined();
	});
});
