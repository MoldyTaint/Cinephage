import { describe, it, expect } from 'vitest';
import {
	standardScoring,
	overlapScoring,
	computeRatingDeltaDelta,
	denormalizeSplitPenalty
} from './scoring.js';

describe('scoring', () => {
	describe('standardScoring', () => {
		it('should return 1.0 for equal durations', () => {
			expect(standardScoring(1000, 1000)).toBe(1);
		});

		it('should return ratio of min/max for unequal durations', () => {
			expect(standardScoring(500, 1000)).toBe(0.5);
			expect(standardScoring(1000, 500)).toBe(0.5);
		});

		it('should return 0 when either duration is 0', () => {
			expect(standardScoring(0, 1000)).toBe(0);
			expect(standardScoring(1000, 0)).toBe(0);
		});

		it('should return 0 when both durations are 0', () => {
			expect(standardScoring(0, 0)).toBe(0);
		});

		it('should be symmetric', () => {
			expect(standardScoring(300, 700)).toBe(standardScoring(700, 300));
		});

		it('should handle small values', () => {
			expect(standardScoring(1, 2)).toBe(0.5);
			expect(standardScoring(1, 1)).toBe(1);
		});
	});

	describe('overlapScoring', () => {
		it('should return min * 0.00001', () => {
			expect(overlapScoring(1000, 2000)).toBe(0.01);
			expect(overlapScoring(2000, 1000)).toBe(0.01);
		});

		it('should return 0 when either is 0', () => {
			expect(overlapScoring(0, 1000)).toBe(0);
		});

		it('should be symmetric', () => {
			expect(overlapScoring(300, 700)).toBe(overlapScoring(700, 300));
		});
	});

	describe('computeRatingDeltaDelta', () => {
		it('should return score / minLen for standard scoring', () => {
			// Equal lengths: score = 1.0, minLen = 1000
			const dd = computeRatingDeltaDelta(1000, 1000, standardScoring);
			expect(dd).toBeCloseTo(0.001); // 1.0 / 1000
		});

		it('should return 0 when min length is 0', () => {
			expect(computeRatingDeltaDelta(0, 1000, standardScoring)).toBe(0);
			expect(computeRatingDeltaDelta(1000, 0, standardScoring)).toBe(0);
		});

		it('should handle unequal durations', () => {
			// 500 vs 1000: score = 0.5, minLen = 500
			const dd = computeRatingDeltaDelta(500, 1000, standardScoring);
			expect(dd).toBeCloseTo(0.001); // 0.5 / 500
		});

		it('should work with overlap scoring', () => {
			// min(1000, 2000) = 1000, score = 1000 * 0.00001 = 0.01
			// minLen = 1000
			const dd = computeRatingDeltaDelta(1000, 2000, overlapScoring);
			expect(dd).toBeCloseTo(0.00001); // 0.01 / 1000
		});

		it('should be symmetric', () => {
			const dd1 = computeRatingDeltaDelta(500, 1000, standardScoring);
			const dd2 = computeRatingDeltaDelta(1000, 500, standardScoring);
			expect(dd1).toBeCloseTo(dd2);
		});
	});

	describe('denormalizeSplitPenalty', () => {
		it('should compute penalty based on min(refLen, inLen)', () => {
			// min(100, 200) * 7 / 1000 = 0.7
			expect(denormalizeSplitPenalty(100, 200, 7)).toBeCloseTo(0.7);
		});

		it('should return 0 for penalty = 0', () => {
			expect(denormalizeSplitPenalty(100, 200, 0)).toBe(0);
		});

		it('should use min of ref and in lengths', () => {
			expect(denormalizeSplitPenalty(50, 200, 10)).toBeCloseTo(0.5);
			expect(denormalizeSplitPenalty(200, 50, 10)).toBeCloseTo(0.5);
		});

		it('should scale linearly with penalty', () => {
			const p1 = denormalizeSplitPenalty(100, 100, 5);
			const p2 = denormalizeSplitPenalty(100, 100, 10);
			expect(p2).toBeCloseTo(p1 * 2);
		});
	});
});
