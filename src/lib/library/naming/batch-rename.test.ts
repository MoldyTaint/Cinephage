import { describe, it, expect } from 'vitest';
import { chunkFileIds, RENAME_BATCH_SIZE } from './batch-rename';

describe('chunkFileIds', () => {
	it('returns one chunk when under the cap', () => {
		expect(chunkFileIds(['a', 'b'])).toEqual([['a', 'b']]);
	});

	it('splits at the server cap of 500', () => {
		const ids = Array.from({ length: 1200 }, (_, i) => `f${i}`);
		const chunks = chunkFileIds(ids);
		expect(chunks.length).toBe(3);
		expect(chunks[0].length).toBe(RENAME_BATCH_SIZE);
		expect(chunks[2].length).toBe(200);
		expect(chunks.flat()).toEqual(ids);
	});

	it('returns an empty array for empty input', () => {
		expect(chunkFileIds([])).toEqual([]);
	});
});
