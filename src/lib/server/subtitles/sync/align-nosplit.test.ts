import { describe, it, expect } from 'vitest';
import {
	getOffsetBounds,
	alignConstantDeltaBucketSort,
	alignConstantDeltaMergeSort,
	alignNosplit
} from './align-nosplit.js';
import { standardScoring } from './scoring.js';
import type { TimeSpan } from './types.js';

describe('align-nosplit', () => {
	describe('getOffsetBounds', () => {
		it('should compute correct offset bounds', () => {
			const ref: TimeSpan[] = [{ start: 1000, end: 2000 }];
			const inc: TimeSpan[] = [{ start: 500, end: 1500 }];
			const [min, max] = getOffsetBounds(ref, inc);
			// min = refStart - inEnd = 1000 - 1500 = -500
			// max = refEnd - inStart = 2000 - 500 = 1500
			expect(min).toBe(-500);
			expect(max).toBe(1500);
		});

		it('should handle spans at the same position', () => {
			const ref: TimeSpan[] = [{ start: 1000, end: 2000 }];
			const inc: TimeSpan[] = [{ start: 1000, end: 2000 }];
			const [min, max] = getOffsetBounds(ref, inc);
			// min = 1000 - 2000 = -1000
			// max = 2000 - 1000 = 1000
			expect(min).toBe(-1000);
			expect(max).toBe(1000);
		});

		it('should use first/last span of multi-span arrays', () => {
			const ref: TimeSpan[] = [
				{ start: 100, end: 200 },
				{ start: 500, end: 600 }
			];
			const inc: TimeSpan[] = [
				{ start: 300, end: 400 },
				{ start: 700, end: 800 }
			];
			const [min, max] = getOffsetBounds(ref, inc);
			// min = refStart - inEnd = 100 - 800 = -700
			// max = refEnd - inStart = 600 - 300 = 300
			expect(min).toBe(-700);
			expect(max).toBe(300);
		});
	});

	describe('alignConstantDeltaBucketSort', () => {
		it('should find zero offset for identical spans', () => {
			const spans: TimeSpan[] = [
				{ start: 1000, end: 2000 },
				{ start: 3000, end: 4000 }
			];
			const result = alignConstantDeltaBucketSort(spans, spans, standardScoring);
			expect(result.delta).toBe(0);
			expect(result.score).toBeGreaterThan(0);
		});

		it('should find the correct constant offset', () => {
			const ref: TimeSpan[] = [
				{ start: 1000, end: 2000 },
				{ start: 3000, end: 4000 }
			];
			const inc: TimeSpan[] = [
				{ start: 1500, end: 2500 },
				{ start: 3500, end: 4500 }
			];
			const result = alignConstantDeltaBucketSort(ref, inc, standardScoring);
			// Incorrect spans are shifted +500ms, so best offset should be -500
			expect(result.delta).toBe(-500);
			expect(result.score).toBeGreaterThan(0);
		});

		it('should handle a single pair of spans', () => {
			const ref: TimeSpan[] = [{ start: 1000, end: 3000 }];
			const inc: TimeSpan[] = [{ start: 0, end: 2000 }];
			const result = alignConstantDeltaBucketSort(ref, inc, standardScoring);
			expect(result.delta).toBe(1000);
		});
	});

	describe('alignConstantDeltaMergeSort', () => {
		it('should find zero offset for identical spans', () => {
			const spans: TimeSpan[] = [
				{ start: 1000, end: 2000 },
				{ start: 3000, end: 4000 }
			];
			const result = alignConstantDeltaMergeSort(spans, spans, standardScoring);
			expect(result.delta).toBe(0);
			expect(result.score).toBeGreaterThan(0);
		});

		it('should find the correct constant offset', () => {
			const ref: TimeSpan[] = [
				{ start: 1000, end: 2000 },
				{ start: 3000, end: 4000 }
			];
			const inc: TimeSpan[] = [
				{ start: 1500, end: 2500 },
				{ start: 3500, end: 4500 }
			];
			const result = alignConstantDeltaMergeSort(ref, inc, standardScoring);
			expect(result.delta).toBe(-500);
			expect(result.score).toBeGreaterThan(0);
		});
	});

	describe('alignNosplit', () => {
		it('should return zero delta for empty inputs', () => {
			const result = alignNosplit([], [], standardScoring);
			expect(result.delta).toBe(0);
			expect(result.score).toBe(0);
		});

		it('should return zero delta for empty ref', () => {
			const inc: TimeSpan[] = [{ start: 0, end: 1000 }];
			const result = alignNosplit([], inc, standardScoring);
			expect(result.delta).toBe(0);
			expect(result.score).toBe(0);
		});

		it('should return zero delta for empty incorrect', () => {
			const ref: TimeSpan[] = [{ start: 0, end: 1000 }];
			const result = alignNosplit(ref, [], standardScoring);
			expect(result.delta).toBe(0);
			expect(result.score).toBe(0);
		});

		it('should find zero offset for already-aligned spans', () => {
			const ref: TimeSpan[] = [
				{ start: 1000, end: 2000 },
				{ start: 5000, end: 6000 },
				{ start: 10000, end: 11000 }
			];
			const result = alignNosplit(ref, ref, standardScoring);
			expect(result.delta).toBe(0);
			expect(result.score).toBeGreaterThan(0);
		});

		it('should find correct positive offset', () => {
			const ref: TimeSpan[] = [
				{ start: 2000, end: 4000 },
				{ start: 6000, end: 8000 },
				{ start: 10000, end: 12000 }
			];
			// Incorrect spans are 1000ms behind reference
			const inc: TimeSpan[] = [
				{ start: 1000, end: 3000 },
				{ start: 5000, end: 7000 },
				{ start: 9000, end: 11000 }
			];
			const result = alignNosplit(ref, inc, standardScoring);
			expect(result.delta).toBe(1000);
		});

		it('should find correct negative offset', () => {
			const ref: TimeSpan[] = [
				{ start: 1000, end: 3000 },
				{ start: 5000, end: 7000 }
			];
			// Incorrect spans are 2000ms ahead of reference
			const inc: TimeSpan[] = [
				{ start: 3000, end: 5000 },
				{ start: 7000, end: 9000 }
			];
			const result = alignNosplit(ref, inc, standardScoring);
			expect(result.delta).toBe(-2000);
		});

		it('should agree between bucket sort and merge sort', () => {
			const ref: TimeSpan[] = [
				{ start: 1000, end: 2000 },
				{ start: 3000, end: 4500 },
				{ start: 6000, end: 7000 }
			];
			const inc: TimeSpan[] = [
				{ start: 1300, end: 2300 },
				{ start: 3300, end: 4800 },
				{ start: 6300, end: 7300 }
			];
			const bucketResult = alignConstantDeltaBucketSort(ref, inc, standardScoring);
			const mergeResult = alignConstantDeltaMergeSort(ref, inc, standardScoring);
			expect(bucketResult.delta).toBe(mergeResult.delta);
			// Scores may differ slightly due to different integration methods,
			// but the best offset should be the same
		});

		it('should handle spans with different durations', () => {
			const ref: TimeSpan[] = [
				{ start: 0, end: 2000 }, // 2s
				{ start: 5000, end: 6000 } // 1s
			];
			const inc: TimeSpan[] = [
				{ start: 1000, end: 3000 }, // 2s, offset +1000
				{ start: 6000, end: 7000 } // 1s, offset +1000
			];
			const result = alignNosplit(ref, inc, standardScoring);
			expect(result.delta).toBe(-1000);
		});
	});
});
