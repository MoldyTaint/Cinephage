import { describe, it, expect } from 'vitest';
import { MAX_BULK_IMPORT_JOBS } from './bulk-import.js';

describe('MAX_BULK_IMPORT_JOBS', () => {
	it('allows the reported 2600-file scenario', () => {
		expect(MAX_BULK_IMPORT_JOBS).toBeGreaterThanOrEqual(2600);
	});

	it('stays within a single HTTP batch that fits the 10M body limit', () => {
		// Realistic jobs are ~250 bytes; 5000 * 250B = 1.25MB < 10MB
		expect(MAX_BULK_IMPORT_JOBS * 250).toBeLessThan(10 * 1024 * 1024);
	});
});
