import { describe, it, expect } from 'vitest';
import {
	createTimeSpan,
	createTimeSpanSafe,
	spanLength,
	isEmptySpan,
	shiftSpan,
	scaleSpan,
	spanContains,
	spanOverlap,
	spanDistance
} from './types.js';

describe('types', () => {
	describe('createTimeSpan', () => {
		it('should create a valid TimeSpan', () => {
			const span = createTimeSpan(100, 200);
			expect(span.start).toBe(100);
			expect(span.end).toBe(200);
		});

		it('should allow zero-length spans', () => {
			const span = createTimeSpan(100, 100);
			expect(span.start).toBe(100);
			expect(span.end).toBe(100);
		});

		it('should throw if start > end', () => {
			expect(() => createTimeSpan(200, 100)).toThrow();
		});
	});

	describe('createTimeSpanSafe', () => {
		it('should swap start/end if needed', () => {
			const span = createTimeSpanSafe(200, 100);
			expect(span.start).toBe(100);
			expect(span.end).toBe(200);
		});

		it('should handle correct order', () => {
			const span = createTimeSpanSafe(100, 200);
			expect(span.start).toBe(100);
			expect(span.end).toBe(200);
		});
	});

	describe('spanLength', () => {
		it('should return the length', () => {
			expect(spanLength({ start: 100, end: 350 })).toBe(250);
		});

		it('should return 0 for empty span', () => {
			expect(spanLength({ start: 100, end: 100 })).toBe(0);
		});
	});

	describe('isEmptySpan', () => {
		it('should return true for zero-length', () => {
			expect(isEmptySpan({ start: 100, end: 100 })).toBe(true);
		});

		it('should return false for non-zero', () => {
			expect(isEmptySpan({ start: 100, end: 200 })).toBe(false);
		});
	});

	describe('shiftSpan', () => {
		it('should shift forward', () => {
			const span = shiftSpan({ start: 100, end: 200 }, 50);
			expect(span).toEqual({ start: 150, end: 250 });
		});

		it('should shift backward', () => {
			const span = shiftSpan({ start: 100, end: 200 }, -30);
			expect(span).toEqual({ start: 70, end: 170 });
		});
	});

	describe('scaleSpan', () => {
		it('should scale by factor', () => {
			const span = scaleSpan({ start: 100, end: 200 }, 2);
			expect(span).toEqual({ start: 200, end: 400 });
		});

		it('should handle fractional scaling with rounding', () => {
			const span = scaleSpan({ start: 100, end: 200 }, 1.5);
			expect(span).toEqual({ start: 150, end: 300 });
		});
	});

	describe('spanContains', () => {
		it('should return true when outer contains inner', () => {
			expect(spanContains({ start: 0, end: 500 }, { start: 100, end: 200 })).toBe(true);
		});

		it('should return true when spans are equal', () => {
			expect(spanContains({ start: 100, end: 200 }, { start: 100, end: 200 })).toBe(true);
		});

		it('should return false when inner extends beyond outer', () => {
			expect(spanContains({ start: 100, end: 200 }, { start: 100, end: 300 })).toBe(false);
		});
	});

	describe('spanOverlap', () => {
		it('should return overlap length for overlapping spans', () => {
			expect(spanOverlap({ start: 100, end: 200 }, { start: 150, end: 250 })).toBe(50);
		});

		it('should return 0 for non-overlapping spans', () => {
			expect(spanOverlap({ start: 100, end: 200 }, { start: 300, end: 400 })).toBe(0);
		});

		it('should return full length for contained span', () => {
			expect(spanOverlap({ start: 0, end: 500 }, { start: 100, end: 200 })).toBe(100);
		});

		it('should return 0 for adjacent spans', () => {
			expect(spanOverlap({ start: 100, end: 200 }, { start: 200, end: 300 })).toBe(0);
		});
	});

	describe('spanDistance', () => {
		it('should return distance between non-overlapping spans', () => {
			expect(spanDistance({ start: 100, end: 200 }, { start: 300, end: 400 })).toBe(100);
		});

		it('should return 0 for overlapping spans', () => {
			expect(spanDistance({ start: 100, end: 200 }, { start: 150, end: 250 })).toBe(0);
		});

		it('should handle reverse order', () => {
			expect(spanDistance({ start: 300, end: 400 }, { start: 100, end: 200 })).toBe(100);
		});
	});
});
