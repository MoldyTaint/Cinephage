/**
 * Quality Module Types
 *
 * Simplified types for quality filtering using ScoringProfile
 */

/**
 * Score components breakdown for transparency
 * Only includes intrinsic quality factors that persist with the file
 */
export interface ScoreComponents {
	/** Quality score from scoring engine */
	qualityScore: number;
	/** Bonus for PROPER/REPACK (0-20) */
	enhancementBonus: number;
	/** Bonus for season/series packs (0-100) */
	packBonus: number;
	/** Penalty for hardcoded subs (-50 to 0) */
	hardcodedSubsPenalty: number;
	/** Final combined score */
	totalScore: number;
}
