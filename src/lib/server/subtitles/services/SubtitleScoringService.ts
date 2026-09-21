/**
 * Subtitle Scoring Service
 *
 * Calculates match scores for subtitle search results.
 * Scoring is based on how well the subtitle matches the media.
 */

import type {
	SubtitleSearchResult,
	SubtitleSearchCriteria,
	SubtitleScoreBreakdown
} from '../types';

/**
 * Score weights, normalized to a single 0-100 scale shared by movies and
 * episodes (see `score()`), so a profile's `minimumScore` (0-100) means the
 * same thing for both. A hash match is 100; the non-hash weights sum to at most
 * 100 and never include an unconditional "it was returned" floor.
 *
 * The old episode scale added series+season+episode unconditionally (~210), so
 * every episode result cleared every threshold. Here the always-on episode
 * contribution is series(30)+season(10)+episode(10) = 50, which must still earn
 * year/release/source/bonus credit to reach a typical 70 threshold.
 */
const MOVIE_SCORE_WEIGHTS = {
	hashMatch: 100, // Hash match is the gold standard (clamped to the 0-100 scale)
	titleMatch: 40, // Title matches
	yearMatch: 15, // Year matches
	releaseGroupMatch: 12, // Known release group
	sourceMatch: 10, // Source matches (BluRay, Web, etc.)
	codecMatch: 5, // Codec matches
	hiPenalty: -10, // Penalty for HI when not wanted
	forcedBonus: 10, // Bonus for forced when wanted
	popularityBonus: 10, // Max bonus from downloads
	ratingBonus: 5 // Max bonus from ratings
};

/** Score weights for episodes on the same 0-100 scale (non-hash sum = 100). */
const EPISODE_SCORE_WEIGHTS = {
	hashMatch: 100, // Hash match is the gold standard (clamped to the 0-100 scale)
	seriesMatch: 30, // Series name matches
	seasonMatch: 10, // Season matches
	episodeMatch: 10, // Episode matches
	yearMatch: 10, // Year matches
	releaseGroupMatch: 12, // Known release group
	sourceMatch: 10, // Source matches
	codecMatch: 5, // Codec matches
	hiPenalty: -10, // Penalty for HI when not wanted
	forcedBonus: 10, // Bonus for forced when wanted
	popularityBonus: 8, // Max bonus from downloads
	ratingBonus: 5 // Max bonus from ratings
};

/** Upper bound of the normalized score scale. */
const MAX_SCORE = 100;

/**
 * Service for scoring subtitle search results
 */
export class SubtitleScoringService {
	private static instance: SubtitleScoringService | null = null;

	private constructor() {}

	static getInstance(): SubtitleScoringService {
		if (!SubtitleScoringService.instance) {
			SubtitleScoringService.instance = new SubtitleScoringService();
		}
		return SubtitleScoringService.instance;
	}

	/**
	 * Score a single search result on the normalized 0-100 scale.
	 *
	 * A hash match is definitive and always scores 100 (clamped). Non-hash
	 * results start at 0 and earn credit only for signals actually matched.
	 */
	score(result: SubtitleSearchResult, criteria: SubtitleSearchCriteria): number {
		const isEpisode = criteria.season !== undefined || criteria.episode !== undefined;
		const weights = isEpisode ? EPISODE_SCORE_WEIGHTS : MOVIE_SCORE_WEIGHTS;
		let score = 0;

		// Hash match - highest confidence. A hash match is exactly 100.
		if (result.isHashMatch) {
			score += weights.hashMatch;
			score += this.getPopularityBonus(result, weights.popularityBonus);
			score += this.getRatingBonus(result, weights.ratingBonus);
			return Math.min(MAX_SCORE, Math.round(score));
		}

		// Title/series match (base assumption since it was returned)
		if (isEpisode) {
			score += (weights as typeof EPISODE_SCORE_WEIGHTS).seriesMatch;
			// Season/episode match
			if (criteria.season !== undefined) {
				score += (weights as typeof EPISODE_SCORE_WEIGHTS).seasonMatch;
			}
			if (criteria.episode !== undefined) {
				score += (weights as typeof EPISODE_SCORE_WEIGHTS).episodeMatch;
			}
		} else {
			score += (weights as typeof MOVIE_SCORE_WEIGHTS).titleMatch;
		}

		// Year match
		if (criteria.year && result.title.includes(criteria.year.toString())) {
			score += weights.yearMatch;
		}

		// Release group/name match
		if (result.releaseName && criteria.title) {
			score += weights.releaseGroupMatch;
		}

		// Source match (rough check based on release name)
		if (result.releaseName) {
			const releaseLower = result.releaseName.toLowerCase();
			if (
				releaseLower.includes('bluray') ||
				releaseLower.includes('web') ||
				releaseLower.includes('hdtv')
			) {
				score += weights.sourceMatch;
			}
		}

		// HI penalty when not wanted
		if (result.isHearingImpaired && criteria.excludeHearingImpaired) {
			score += weights.hiPenalty;
		}

		// Forced bonus when wanted
		if (result.isForced && criteria.includeForced) {
			score += weights.forcedBonus;
		}

		// Popularity bonus
		score += this.getPopularityBonus(result, weights.popularityBonus);

		// Rating bonus
		score += this.getRatingBonus(result, weights.ratingBonus);

		return Math.min(MAX_SCORE, Math.max(0, Math.round(score)));
	}

	/**
	 * Rank results by score (highest first)
	 */
	rank(results: SubtitleSearchResult[]): SubtitleSearchResult[] {
		return [...results].sort((a, b) => b.matchScore - a.matchScore);
	}

	/**
	 * Check if a result meets the minimum score threshold
	 */
	meetsThreshold(result: SubtitleSearchResult, minScore: number): boolean {
		return result.matchScore >= minScore;
	}

	/**
	 * Get the best result for each language
	 */
	getBestByLanguage(results: SubtitleSearchResult[]): Map<string, SubtitleSearchResult> {
		const bestByLang = new Map<string, SubtitleSearchResult>();

		for (const result of results) {
			const existing = bestByLang.get(result.language);
			if (!existing || result.matchScore > existing.matchScore) {
				bestByLang.set(result.language, result);
			}
		}

		return bestByLang;
	}

	/**
	 * Calculate score breakdown for display
	 */
	getScoreBreakdown(
		result: SubtitleSearchResult,
		criteria: SubtitleSearchCriteria
	): SubtitleScoreBreakdown {
		const isEpisode = criteria.season !== undefined || criteria.episode !== undefined;
		const weights = isEpisode ? EPISODE_SCORE_WEIGHTS : MOVIE_SCORE_WEIGHTS;

		return {
			hashMatch: result.isHashMatch ? weights.hashMatch : 0,
			titleMatch: isEpisode
				? (weights as typeof EPISODE_SCORE_WEIGHTS).seriesMatch
				: (weights as typeof MOVIE_SCORE_WEIGHTS).titleMatch,
			yearMatch:
				criteria.year && result.title.includes(criteria.year.toString()) ? weights.yearMatch : 0,
			releaseGroupMatch: result.releaseName ? weights.releaseGroupMatch : 0,
			sourceMatch: result.releaseName ? weights.sourceMatch : 0,
			codecMatch: 0,
			hiPenalty:
				result.isHearingImpaired && criteria.excludeHearingImpaired ? weights.hiPenalty : 0,
			forcedBonus: result.isForced && criteria.includeForced ? weights.forcedBonus : 0
		};
	}

	/**
	 * Maximum possible score for a media type on the normalized 0-100 scale.
	 */
	getMaxScore(_isEpisode: boolean): number {
		return MAX_SCORE;
	}

	/**
	 * Calculate popularity bonus from download count
	 */
	private getPopularityBonus(result: SubtitleSearchResult, maxBonus: number): number {
		if (!result.downloadCount) return 0;
		// Logarithmic scale - diminishing returns
		const bonus = Math.log10(result.downloadCount + 1) * 2;
		return Math.min(bonus, maxBonus);
	}

	/**
	 * Calculate rating bonus
	 */
	private getRatingBonus(result: SubtitleSearchResult, maxBonus: number): number {
		if (!result.rating || result.rating <= 0) return 0;
		// Scale rating (typically 0-10) to bonus
		return Math.min(result.rating / 2, maxBonus);
	}
}

/**
 * Get the singleton SubtitleScoringService
 */
export function getSubtitleScoringService(): SubtitleScoringService {
	return SubtitleScoringService.getInstance();
}
