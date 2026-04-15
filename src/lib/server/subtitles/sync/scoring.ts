/**
 * Scoring Functions for Subtitle Alignment
 *
 * Port of the scoring functions from alass-core lib.rs.
 *
 * These functions determine how well two subtitle spans "match" at a given
 * offset. They take two span durations (from reference and incorrect subtitles)
 * and return a score indicating quality of match.
 */

import type { ScoreFunction, TimeDelta } from './types.js';

/**
 * Standard scoring function.
 *
 * Returns 1.0 for spans of equal length, lower for unequal lengths.
 * This is the recommended scoring function for general use.
 *
 * score = min(a, b) / max(a, b)
 *
 * Port of alass-core `standard_scoring`.
 */
export const standardScoring: ScoreFunction = (a: TimeDelta, b: TimeDelta): number => {
	const minVal = Math.min(a, b);
	const maxVal = Math.max(a, b);
	if (maxVal === 0) return 0;
	return minVal / maxVal;
};

/**
 * Overlap scoring function.
 *
 * Score based only on the overlapping length of intervals.
 * Better when comparing scaled subtitles; used for FPS correction.
 *
 * score = min(a, b) * 0.00001
 *
 * Port of alass-core `overlap_scoring`.
 */
export const overlapScoring: ScoreFunction = (a: TimeDelta, b: TimeDelta): number => {
	return Math.min(a, b) * 0.00001;
};

/**
 * Compute the rating delta-delta for a single reference/incorrect span pair.
 *
 * This represents how the rating curve's second derivative changes at the
 * changepoints created by this pair of spans. It's the fundamental building
 * block for both nosplit and split alignment.
 *
 * The rating of overlapping two timespans forms a trapezoidal shape as one
 * span slides over the other:
 *
 *          / --------- \
 *         /             \
 * -------                --------------------------
 *
 * The height depends on the scoring function applied to their lengths.
 *
 * This function returns the slope change (delta-delta) at the "rise" point,
 * which can be used to reconstruct the full trapezoidal rating via
 * integration over changepoints.
 *
 * Port of alass-core `RatingDelta::compute_rating_delta`.
 */
export function computeRatingDeltaDelta(
	refLen: TimeDelta,
	inLen: TimeDelta,
	scoreFn: ScoreFunction
): number {
	const score = scoreFn(refLen, inLen);
	const minLen = Math.min(refLen, inLen);
	if (minLen === 0) return 0;
	// The slope of the rising edge = score / minLen
	// This is the delta-delta (second derivative change at a changepoint)
	return score / minLen;
}

/**
 * Compute the split penalty in internal rating units.
 *
 * Port of alass-core `denormalize_split_penalty`.
 *
 * @param refLen - Number of reference spans
 * @param inLen - Number of incorrect spans
 * @param normalizedPenalty - User-facing penalty 0-1000 (default 7)
 */
export function denormalizeSplitPenalty(
	refLen: number,
	inLen: number,
	normalizedPenalty: number
): number {
	return (Math.min(refLen, inLen) * normalizedPenalty) / 1000.0;
}
