import { describe, expect, it } from 'vitest';
import { selectBestCandidate, selectCandidates, type SearchResultLike } from './acquisition';

function result(overrides: Partial<SearchResultLike> = {}): SearchResultLike {
	return {
		language: 'en',
		isForced: false,
		isHearingImpaired: false,
		matchScore: 90,
		...overrides
	};
}

const regularEn = { tag: 'en', variant: 'regular', accessibility: 'any' } as const;
const forcedEn = { tag: 'en', variant: 'forced', accessibility: 'any' } as const;
const anyEn = { tag: 'en', variant: 'both', accessibility: 'any' } as const;

describe('selectCandidates', () => {
	it('keeps only tuple-valid results and sorts by score descending', () => {
		const results = [
			result({ matchScore: 80 }),
			result({ matchScore: 95, isForced: true }), // wrong variant
			result({ matchScore: 90 }),
			result({ matchScore: 99, language: 'fr' }) // wrong language
		];

		expect(selectCandidates(results, regularEn, 70).map((r) => r.matchScore)).toEqual([90, 80]);
	});

	it('applies the threshold after the tuple', () => {
		const results = [result({ matchScore: 69 }), result({ matchScore: 70 })];
		expect(selectCandidates(results, regularEn, 70)).toHaveLength(1);
	});
});

describe('selectBestCandidate', () => {
	it('returns the highest-scoring acceptable candidate', () => {
		const selection = selectBestCandidate(
			[result({ matchScore: 75 }), result({ matchScore: 95 }), result({ matchScore: 85 })],
			regularEn,
			70
		);

		expect(selection.best?.matchScore).toBe(95);
		expect(selection.bestRejected).toBeUndefined();
	});

	it('does not let a forced candidate fill a regular requirement', () => {
		const selection = selectBestCandidate(
			[result({ matchScore: 99, isForced: true })],
			regularEn,
			70
		);

		expect(selection.best).toBeUndefined();
		expect(selection.bestRejected?.reason).toBe('requirement');
		expect(selection.bestRejected?.result.matchScore).toBe(99);
	});

	it('does not let a regular candidate fill a forced requirement', () => {
		const selection = selectBestCandidate(
			[result({ matchScore: 99, isForced: false })],
			forcedEn,
			70
		);

		expect(selection.best).toBeUndefined();
		expect(selection.bestRejected?.reason).toBe('requirement');
	});

	it('accepts either variant for a both requirement', () => {
		expect(
			selectBestCandidate([result({ isForced: true, matchScore: 90 })], anyEn, 70).best
		).toBeDefined();
		expect(
			selectBestCandidate([result({ isForced: false, matchScore: 90 })], anyEn, 70).best
		).toBeDefined();
	});

	it('reports threshold rejection with the best rejected score', () => {
		const selection = selectBestCandidate(
			[result({ matchScore: 40 }), result({ matchScore: 55 })],
			regularEn,
			70
		);

		expect(selection.best).toBeUndefined();
		expect(selection.bestRejected?.reason).toBe('threshold');
		expect(selection.bestRejected?.result.matchScore).toBe(55);
	});

	it('prefers the highest-scoring rejected result regardless of reason', () => {
		const selection = selectBestCandidate(
			[
				result({ matchScore: 30, language: 'fr' }), // tuple failure
				result({ matchScore: 65 }) // below threshold
			],
			regularEn,
			70
		);

		expect(selection.bestRejected?.reason).toBe('threshold');
		expect(selection.bestRejected?.result.matchScore).toBe(65);
	});

	it('returns an empty selection when there are no results', () => {
		expect(selectBestCandidate([], regularEn, 70)).toEqual({});
	});

	it('honours the HI requirement tuple', () => {
		const requireHi = { tag: 'en', variant: 'regular', accessibility: 'require-hi' } as const;
		expect(
			selectBestCandidate([result({ isHearingImpaired: false })], requireHi, 70).best
		).toBeUndefined();
		expect(
			selectBestCandidate([result({ isHearingImpaired: true })], requireHi, 70).best
		).toBeDefined();
	});
});
