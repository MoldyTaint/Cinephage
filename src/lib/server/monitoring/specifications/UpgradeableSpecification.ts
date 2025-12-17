/**
 * UpgradeableSpecification
 *
 * Determines if a new release qualifies as an upgrade over an existing file.
 * Uses the existing scoring engine to compare releases.
 *
 * Checks:
 * 1. Profile allows upgrades
 * 2. Score improvement meets minimum increment
 * 3. New score doesn't exceed upgradeUntilScore cutoff
 */

import { isUpgrade } from '$lib/server/scoring/scorer.js';
import { qualityFilter } from '$lib/server/quality';
import type {
	IMonitoringSpecification,
	MovieContext,
	EpisodeContext,
	SpecificationResult,
	ReleaseCandidate
} from './types.js';
import { reject, accept, RejectionReason } from './types.js';
import type { ScoringProfile } from '$lib/server/scoring/types.js';

/**
 * Check if a release is an upgrade for a movie
 */
export class MovieUpgradeableSpecification implements IMonitoringSpecification<MovieContext> {
	async isSatisfied(
		context: MovieContext,
		release?: ReleaseCandidate
	): Promise<SpecificationResult> {
		// Must have existing file to upgrade
		if (!context.existingFile) {
			return reject('no_existing_file');
		}

		// Must have release candidate
		if (!release) {
			return reject('no_release_candidate');
		}

		// Must have profile
		if (!context.profile) {
			return reject(RejectionReason.NO_PROFILE);
		}

		// Check if upgrades are allowed
		if (!context.profile.upgradesAllowed) {
			return reject(RejectionReason.UPGRADES_NOT_ALLOWED);
		}

		// Get the full profile with format scores
		const fullProfile = await qualityFilter.getProfile(context.profile.id);
		if (!fullProfile) {
			return reject(RejectionReason.NO_PROFILE);
		}

		// Extract existing file name for scoring
		const existingFileName = context.existingFile.sceneName || context.existingFile.relativePath;

		// Compare using scorer
		const comparison = isUpgrade(existingFileName, release.title, fullProfile as ScoringProfile, {
			minimumImprovement: context.profile.minScoreIncrement || 0,
			allowSidegrade: false,
			candidateSizeBytes: release.size
		});

		if (!comparison.isUpgrade) {
			// Determine specific reason
			if (comparison.improvement <= 0) {
				return reject(RejectionReason.QUALITY_NOT_BETTER);
			} else if (comparison.improvement < (context.profile.minScoreIncrement || 0)) {
				return reject(RejectionReason.IMPROVEMENT_TOO_SMALL);
			}
			return reject(RejectionReason.QUALITY_NOT_BETTER);
		}

		// Note: upgradeUntilScore cutoff is only used by CutoffUnmetSpecification to decide
		// whether to SEARCH for upgrades, not to reject candidates that are found.
		// Once we're evaluating releases, we want the best one available.

		return accept();
	}
}

/**
 * Check if a release is an upgrade for an episode
 */
export class EpisodeUpgradeableSpecification implements IMonitoringSpecification<EpisodeContext> {
	async isSatisfied(
		context: EpisodeContext,
		release?: ReleaseCandidate
	): Promise<SpecificationResult> {
		// Must have existing file to upgrade
		if (!context.existingFile) {
			return reject('no_existing_file');
		}

		// Must have release candidate
		if (!release) {
			return reject('no_release_candidate');
		}

		// Must have profile
		if (!context.profile) {
			return reject(RejectionReason.NO_PROFILE);
		}

		// Check if upgrades are allowed
		if (!context.profile.upgradesAllowed) {
			return reject(RejectionReason.UPGRADES_NOT_ALLOWED);
		}

		// Get the full profile with format scores
		const fullProfile = await qualityFilter.getProfile(context.profile.id);
		if (!fullProfile) {
			return reject(RejectionReason.NO_PROFILE);
		}

		// Extract existing file name for scoring
		const existingFileName = context.existingFile.sceneName || context.existingFile.relativePath;

		// Compare using scorer
		const comparison = isUpgrade(existingFileName, release.title, fullProfile as ScoringProfile, {
			minimumImprovement: context.profile.minScoreIncrement || 0,
			allowSidegrade: false,
			candidateSizeBytes: release.size
		});

		if (!comparison.isUpgrade) {
			// Determine specific reason
			if (comparison.improvement <= 0) {
				return reject(RejectionReason.QUALITY_NOT_BETTER);
			} else if (comparison.improvement < (context.profile.minScoreIncrement || 0)) {
				return reject(RejectionReason.IMPROVEMENT_TOO_SMALL);
			}
			return reject(RejectionReason.QUALITY_NOT_BETTER);
		}

		// Note: upgradeUntilScore cutoff is only used by CutoffUnmetSpecification to decide
		// whether to SEARCH for upgrades, not to reject candidates that are found.
		// Once we're evaluating releases, we want the best one available.

		return accept();
	}
}

/**
 * Convenience function to check if a release is an upgrade for a movie
 */
export async function isMovieUpgrade(
	context: MovieContext,
	release: ReleaseCandidate
): Promise<boolean> {
	const spec = new MovieUpgradeableSpecification();
	const result = await spec.isSatisfied(context, release);
	return result.accepted;
}

/**
 * Convenience function to check if a release is an upgrade for an episode
 */
export async function isEpisodeUpgrade(
	context: EpisodeContext,
	release: ReleaseCandidate
): Promise<boolean> {
	const spec = new EpisodeUpgradeableSpecification();
	const result = await spec.isSatisfied(context, release);
	return result.accepted;
}
