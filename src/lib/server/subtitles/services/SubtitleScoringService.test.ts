import { describe, it, expect, beforeEach } from 'vitest';
import { SubtitleScoringService } from './SubtitleScoringService';
import type { SubtitleSearchResult, SubtitleSearchCriteria } from '../types';

describe('SubtitleScoringService', () => {
	let scoringService: SubtitleScoringService;

	beforeEach(() => {
		scoringService = SubtitleScoringService.getInstance();
	});

	// Helper to create a mock search result
	function createResult(overrides: Partial<SubtitleSearchResult> = {}): SubtitleSearchResult {
		return {
			providerId: 'test-provider',
			providerName: 'Test Provider',
			providerSubtitleId: '12345',
			language: 'en',
			title: 'Test Movie 2023',
			releaseName: 'Test.Movie.2023.1080p.BluRay.x264-GROUP',
			fileName: 'test.srt',
			isForced: false,
			isHearingImpaired: false,
			format: 'srt',
			isHashMatch: false,
			matchScore: 0,
			scoreBreakdown: {
				hashMatch: 0,
				titleMatch: 0,
				yearMatch: 0,
				releaseGroupMatch: 0,
				sourceMatch: 0,
				codecMatch: 0,
				hiPenalty: 0,
				forcedBonus: 0
			},
			downloadCount: 1000,
			rating: 4.5,
			...overrides
		};
	}

	describe('score() - Movie scoring', () => {
		const movieCriteria: SubtitleSearchCriteria = {
			title: 'Test Movie',
			year: 2023,
			languages: ['en']
		};

		it('should give highest score for hash match', () => {
			const hashResult = createResult({ isHashMatch: true });
			const textResult = createResult({ isHashMatch: false });

			const hashScore = scoringService.score(hashResult, movieCriteria);
			const textScore = scoringService.score(textResult, movieCriteria);

			expect(hashScore).toBeGreaterThan(textScore);
			// Hash match is exactly the top of the normalized 0-100 scale.
			expect(hashScore).toBe(100);
		});

		it('should give base score for title match', () => {
			const result = createResult();
			const hashResult = createResult({ isHashMatch: true });
			const score = scoringService.score(result, movieCriteria);
			const hashScore = scoringService.score(hashResult, movieCriteria);

			expect(score).toBeGreaterThan(0);
			// Non-hash match score should be less than hash match score
			expect(score).toBeLessThan(hashScore);
		});

		it('should add year match bonus', () => {
			const resultWithYear = createResult({ title: 'Test Movie 2023' });
			const resultNoYear = createResult({ title: 'Test Movie' });

			const scoreWithYear = scoringService.score(resultWithYear, movieCriteria);
			const scoreNoYear = scoringService.score(resultNoYear, movieCriteria);

			expect(scoreWithYear).toBeGreaterThanOrEqual(scoreNoYear);
		});

		it('should apply HI penalty when excludeHearingImpaired is set', () => {
			const hiCriteria: SubtitleSearchCriteria = {
				...movieCriteria,
				excludeHearingImpaired: true
			};

			const hiResult = createResult({ isHearingImpaired: true });
			const normalResult = createResult({ isHearingImpaired: false });

			const hiScore = scoringService.score(hiResult, hiCriteria);
			const normalScore = scoringService.score(normalResult, hiCriteria);

			expect(hiScore).toBeLessThan(normalScore);
		});

		it('should add forced bonus when includeForced is set', () => {
			const forcedCriteria: SubtitleSearchCriteria = {
				...movieCriteria,
				includeForced: true
			};

			const forcedResult = createResult({ isForced: true });
			const normalResult = createResult({ isForced: false });

			const forcedScore = scoringService.score(forcedResult, forcedCriteria);
			const normalScore = scoringService.score(normalResult, forcedCriteria);

			expect(forcedScore).toBeGreaterThan(normalScore);
		});

		it('should add popularity bonus based on download count', () => {
			const popularResult = createResult({ downloadCount: 100000 });
			const unpopularResult = createResult({ downloadCount: 10 });

			const popularScore = scoringService.score(popularResult, movieCriteria);
			const unpopularScore = scoringService.score(unpopularResult, movieCriteria);

			expect(popularScore).toBeGreaterThanOrEqual(unpopularScore);
		});

		it('should add rating bonus based on rating', () => {
			const highRatedResult = createResult({ rating: 5.0 });
			const lowRatedResult = createResult({ rating: 1.0 });

			const highRatedScore = scoringService.score(highRatedResult, movieCriteria);
			const lowRatedScore = scoringService.score(lowRatedResult, movieCriteria);

			expect(highRatedScore).toBeGreaterThanOrEqual(lowRatedScore);
		});
	});

	describe('score() - Episode scoring', () => {
		const episodeCriteria: SubtitleSearchCriteria = {
			title: 'Test Episode',
			seriesTitle: 'Test Series',
			season: 1,
			episode: 5,
			year: 2023,
			languages: ['en']
		};

		it('should use episode weights when season/episode are provided', () => {
			const result = createResult();
			const score = scoringService.score(result, episodeCriteria);

			// Episode scoring has higher base values
			expect(score).toBeGreaterThan(0);
		});

		it('should give highest score for hash match on episodes', () => {
			const hashResult = createResult({ isHashMatch: true });
			const hashScore = scoringService.score(hashResult, episodeCriteria);

			// Episode hash match is the top of the shared 0-100 scale
			expect(hashScore).toBe(100);
		});

		it('should add season and episode match bonuses', () => {
			const score = scoringService.score(createResult(), episodeCriteria);

			// Should include series match + season match + episode match
			expect(score).toBeGreaterThan(30); // At least series match
		});

		it('regression: a mediocre episode result fails a 70 threshold', () => {
			// Series/season/episode match (the unconditional "it was returned"
			// signals) but nothing else: year absent, no release name, no
			// downloads/rating. This used to score 210+ and clear every threshold.
			const mediocre = createResult({
				title: 'Test Series',
				releaseName: undefined,
				fileName: undefined,
				downloadCount: 0,
				rating: 0
			});
			const noYearCriteria: SubtitleSearchCriteria = {
				title: 'Test Episode',
				seriesTitle: 'Test Series',
				season: 1,
				episode: 5,
				languages: ['en']
			};

			const score = scoringService.score(mediocre, noYearCriteria);

			expect(score).toBeLessThan(70);
			expect(
				scoringService.meetsThreshold({ ...mediocre, matchScore: score }, 70)
			).toBe(false);
		});
	});

	describe('rank()', () => {
		const criteria: SubtitleSearchCriteria = {
			title: 'Test Movie',
			year: 2023,
			languages: ['en']
		};

		it('should sort results by score descending', () => {
			// Create results and pre-score them (as would happen in real usage)
			const results = [
				createResult({ isHashMatch: false, downloadCount: 100 }),
				createResult({ isHashMatch: true, downloadCount: 1000 }),
				createResult({ isHashMatch: false, downloadCount: 50000 })
			];

			// Score each result first (rank() uses pre-existing matchScore)
			const scoredResults = results.map((r) => ({
				...r,
				matchScore: scoringService.score(r, criteria)
			}));

			const ranked = scoringService.rank(scoredResults);

			// Hash match should be first (highest score)
			expect(ranked[0].isHashMatch).toBe(true);
			// Scores should be in descending order
			for (let i = 1; i < ranked.length; i++) {
				expect(ranked[i - 1].matchScore).toBeGreaterThanOrEqual(ranked[i].matchScore);
			}
		});
	});

	describe('meetsThreshold()', () => {
		const criteria: SubtitleSearchCriteria = {
			title: 'Test Movie',
			year: 2023,
			languages: ['en']
		};

		it('should return true for hash match with any threshold', () => {
			const hashResult = createResult({ isHashMatch: true });
			const scoredResult = {
				...hashResult,
				matchScore: scoringService.score(hashResult, criteria)
			};

			expect(scoringService.meetsThreshold(scoredResult, 80)).toBe(true);
			expect(scoringService.meetsThreshold(scoredResult, 100)).toBe(true);
		});

		it('should check against threshold value', () => {
			const result = createResult({ isHashMatch: false });
			const scoredResult = {
				...result,
				matchScore: scoringService.score(result, criteria)
			};

			// Should pass low threshold but potentially fail high threshold
			expect(scoringService.meetsThreshold(scoredResult, 0)).toBe(true);
		});
	});

	describe('getBestByLanguage()', () => {
		const criteria: SubtitleSearchCriteria = {
			title: 'Test Movie',
			year: 2023,
			languages: ['en', 'es']
		};

		it('should return best result per language', () => {
			const results = [
				createResult({ language: 'en', isHashMatch: false, downloadCount: 100 }),
				createResult({ language: 'en', isHashMatch: true, downloadCount: 1000 }),
				createResult({ language: 'es', isHashMatch: false, downloadCount: 500 }),
				createResult({ language: 'es', isHashMatch: false, downloadCount: 5000 })
			];

			// Score each result first (getBestByLanguage() uses pre-existing matchScore)
			const scoredResults = results.map((r) => ({
				...r,
				matchScore: scoringService.score(r, criteria)
			}));

			const best = scoringService.getBestByLanguage(scoredResults);

			expect(best.size).toBe(2);
			expect(best.has('en')).toBe(true);
			expect(best.has('es')).toBe(true);
			// English best should be hash match (highest score)
			expect(best.get('en')?.isHashMatch).toBe(true);
		});
	});
});
