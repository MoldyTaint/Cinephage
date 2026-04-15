import { describe, it, expect } from 'vitest';
import { mapDeltasToCues, downsampleSpans } from './subtitle-sync.js';
import type { TimeSpan } from './types.js';

describe('subtitle-sync', () => {
	// =========================================================================
	// mapDeltasToCues
	// =========================================================================
	describe('mapDeltasToCues', () => {
		it('should map deltas using index mapping', () => {
			// 3 prepared spans with deltas, indices mapping 4 original cues
			const preparedDeltas = [100, -200, 300];
			const indices = [0, 1, 1, 2]; // cue 1 and 2 map to same prepared span
			const result = mapDeltasToCues(preparedDeltas, indices, 4);
			expect(result).toEqual([100, -200, -200, 300]);
		});

		it('should return 0 for cues beyond indices length', () => {
			const preparedDeltas = [100, 200];
			const indices = [0, 1];
			// 4 cues, but only 2 indices
			const result = mapDeltasToCues(preparedDeltas, indices, 4);
			expect(result).toEqual([100, 200, 0, 0]);
		});

		it('should return 0 for out-of-range prepared indices', () => {
			const preparedDeltas = [100];
			const indices = [0, 5]; // index 5 is beyond preparedDeltas
			const result = mapDeltasToCues(preparedDeltas, indices, 2);
			expect(result).toEqual([100, 0]);
		});

		it('should handle empty inputs', () => {
			const result = mapDeltasToCues([], [], 0);
			expect(result).toEqual([]);
		});

		it('should handle single cue', () => {
			const result = mapDeltasToCues([500], [0], 1);
			expect(result).toEqual([500]);
		});

		it('should handle all cues mapping to same prepared span', () => {
			const preparedDeltas = [42];
			const indices = [0, 0, 0];
			const result = mapDeltasToCues(preparedDeltas, indices, 3);
			expect(result).toEqual([42, 42, 42]);
		});
	});

	// =========================================================================
	// downsampleSpans
	// =========================================================================
	describe('downsampleSpans', () => {
		it('should return input unchanged if already below max', () => {
			const spans: TimeSpan[] = [
				{ start: 0, end: 100 },
				{ start: 200, end: 300 }
			];
			const result = downsampleSpans(spans, 10);
			expect(result).toHaveLength(2);
		});

		it('should return input unchanged if exactly at max', () => {
			const spans: TimeSpan[] = [
				{ start: 0, end: 100 },
				{ start: 200, end: 300 },
				{ start: 400, end: 500 }
			];
			const result = downsampleSpans(spans, 3);
			expect(result).toHaveLength(3);
		});

		it('should merge close spans to reduce count', () => {
			// 10 spans each 100ms wide, separated by 400ms gaps
			const spans: TimeSpan[] = [];
			for (let i = 0; i < 10; i++) {
				spans.push({ start: i * 500, end: i * 500 + 100 });
			}
			const result = downsampleSpans(spans, 5);
			expect(result.length).toBeLessThanOrEqual(5);
		});

		it('should progressively increase merge gap', () => {
			// Many closely-spaced spans
			const spans: TimeSpan[] = [];
			for (let i = 0; i < 100; i++) {
				spans.push({ start: i * 200, end: i * 200 + 100 });
			}
			const result = downsampleSpans(spans, 10);
			expect(result.length).toBeLessThanOrEqual(10);
			// All result spans should be valid (end > start)
			for (const span of result) {
				expect(span.end).toBeGreaterThan(span.start);
			}
		});

		it('should handle single span', () => {
			const spans: TimeSpan[] = [{ start: 0, end: 1000 }];
			const result = downsampleSpans(spans, 1);
			expect(result).toHaveLength(1);
		});

		it('should handle empty input', () => {
			const result = downsampleSpans([], 5);
			expect(result).toEqual([]);
		});
	});
});
