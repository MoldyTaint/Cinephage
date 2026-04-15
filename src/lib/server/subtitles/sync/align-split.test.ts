import { describe, it, expect } from 'vitest';
import { alignWithSplits } from './align-split.js';
import { standardScoring } from './scoring.js';
import { alignNosplit } from './align-nosplit.js';
import type { TimeSpan } from './types.js';

describe('align-split', () => {
	describe('alignWithSplits', () => {
		it('should return empty for empty inputs', () => {
			const result = alignWithSplits([], [], 7, standardScoring);
			expect(result.deltas).toEqual([]);
			expect(result.score).toBe(0);
		});

		it('should return empty for empty ref', () => {
			const inc: TimeSpan[] = [{ start: 0, end: 1000 }];
			const result = alignWithSplits([], inc, 7, standardScoring);
			expect(result.deltas).toEqual([]);
			expect(result.score).toBe(0);
		});

		it('should return empty for empty incorrect', () => {
			const ref: TimeSpan[] = [{ start: 0, end: 1000 }];
			const result = alignWithSplits(ref, [], 7, standardScoring);
			expect(result.deltas).toEqual([]);
			expect(result.score).toBe(0);
		});

		it('should find constant offset for uniformly shifted spans', () => {
			const ref: TimeSpan[] = [
				{ start: 1000, end: 2000 },
				{ start: 3000, end: 4000 },
				{ start: 5000, end: 6000 }
			];
			// All shifted +500ms
			const inc: TimeSpan[] = [
				{ start: 1500, end: 2500 },
				{ start: 3500, end: 4500 },
				{ start: 5500, end: 6500 }
			];
			const result = alignWithSplits(ref, inc, 7, standardScoring);
			expect(result.deltas).toHaveLength(3);
			// With high split penalty, all deltas should be the same: -500
			for (const delta of result.deltas) {
				expect(delta).toBe(-500);
			}
			expect(result.score).toBeGreaterThan(0);
		});

		it('should return one delta per input span', () => {
			const ref: TimeSpan[] = [
				{ start: 1000, end: 2000 },
				{ start: 5000, end: 6000 }
			];
			const inc: TimeSpan[] = [
				{ start: 1500, end: 2500 },
				{ start: 5500, end: 6500 }
			];
			const result = alignWithSplits(ref, inc, 7, standardScoring);
			expect(result.deltas).toHaveLength(2);
		});

		it('should handle a single span', () => {
			const ref: TimeSpan[] = [{ start: 1000, end: 3000 }];
			const inc: TimeSpan[] = [{ start: 0, end: 2000 }];
			const result = alignWithSplits(ref, inc, 7, standardScoring);
			expect(result.deltas).toHaveLength(1);
			expect(result.deltas[0]).toBe(1000);
		});

		it('should agree with nosplit for uniform offset with high split penalty', () => {
			const ref: TimeSpan[] = [
				{ start: 2000, end: 4000 },
				{ start: 6000, end: 8000 },
				{ start: 10000, end: 12000 }
			];
			const inc: TimeSpan[] = [
				{ start: 3000, end: 5000 },
				{ start: 7000, end: 9000 },
				{ start: 11000, end: 13000 }
			];
			const nosplitResult = alignNosplit(ref, inc, standardScoring);
			// With very high split penalty, split mode should find the same offset
			const splitResult = alignWithSplits(ref, inc, 1000, standardScoring);
			// All deltas should equal the nosplit delta
			for (const delta of splitResult.deltas) {
				expect(delta).toBe(nosplitResult.delta);
			}
		});

		it('should allow different offsets with low split penalty', () => {
			// Construct a scenario where first half has one offset and second half another
			const ref: TimeSpan[] = [
				{ start: 1000, end: 2000 },
				{ start: 3000, end: 4000 },
				{ start: 10000, end: 11000 },
				{ start: 13000, end: 14000 }
			];
			// First two spans shifted +500, last two shifted +2000
			const inc: TimeSpan[] = [
				{ start: 1500, end: 2500 },
				{ start: 3500, end: 4500 },
				{ start: 12000, end: 13000 },
				{ start: 15000, end: 16000 }
			];
			const result = alignWithSplits(ref, inc, 0.001, standardScoring);
			expect(result.deltas).toHaveLength(4);
			// First two should be close to -500, last two close to -2000
			expect(result.deltas[0]).toBe(-500);
			expect(result.deltas[1]).toBe(-500);
			expect(result.deltas[2]).toBe(-2000);
			expect(result.deltas[3]).toBe(-2000);
		});

		it('should call progress handler', () => {
			const ref: TimeSpan[] = [
				{ start: 1000, end: 2000 },
				{ start: 3000, end: 4000 }
			];
			const inc: TimeSpan[] = [
				{ start: 1500, end: 2500 },
				{ start: 3500, end: 4500 }
			];

			let initSteps = 0;
			let incCount = 0;
			let finished = false;

			const progress = {
				init: (steps: number) => {
					initSteps = steps;
				},
				inc: () => {
					incCount++;
				},
				finish: () => {
					finished = true;
				}
			};

			alignWithSplits(ref, inc, 7, standardScoring, progress);
			expect(initSteps).toBe(2); // number of input spans
			expect(incCount).toBe(2); // one per span
			expect(finished).toBe(true);
		});
	});
});
