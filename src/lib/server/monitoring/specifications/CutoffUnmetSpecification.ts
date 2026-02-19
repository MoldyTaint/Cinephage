/**
 * CutoffUnmetSpecification
 *
 * Previously checked if an existing file's quality was below the profile's upgradeUntilScore cutoff.
 *
 * UPDATED: Hard cutoffs have been removed. As long as upgrades are allowed by the profile,
 * this specification will always return accepted. The minScoreIncrement check in
 * ReleaseDecisionService will prevent frivolous upgrades by requiring meaningful improvement.
 *
 * This allows the system to always search for and grab better quality releases,
 * rather than stopping at an arbitrary score threshold.
 */

import type {
	IMonitoringSpecification,
	MovieContext,
	EpisodeContext,
	SpecificationResult,
	ReleaseCandidate
} from './types.js';
import { reject, accept, RejectionReason } from './types.js';

/**
 * Check if a movie's existing file is eligible for upgrade searching
 *
 * Now simply checks if upgrades are allowed - no hard cutoff enforcement.
 * Better releases will always be considered; the score comparison logic
 * ensures only genuine improvements are grabbed.
 */
export class MovieCutoffUnmetSpecification implements IMonitoringSpecification<MovieContext> {
	async isSatisfied(
		context: MovieContext,
		_release?: ReleaseCandidate
	): Promise<SpecificationResult> {
		// Must have existing file to evaluate (otherwise it's missing, not upgrade)
		if (!context.existingFile) {
			return reject('no_existing_file');
		}

		// Must have profile
		if (!context.profile) {
			return reject(RejectionReason.NO_PROFILE);
		}

		// Check if upgrades are allowed by the profile
		if (!context.profile.upgradesAllowed) {
			return reject(RejectionReason.UPGRADES_NOT_ALLOWED);
		}

		// Always allow searching for upgrades - the minScoreIncrement check
		// in ReleaseDecisionService will ensure only meaningful improvements are grabbed
		return accept();
	}
}

/**
 * Check if an episode's existing file is eligible for upgrade searching
 *
 * Now simply checks if upgrades are allowed - no hard cutoff enforcement.
 * Better releases will always be considered; the score comparison logic
 * ensures only genuine improvements are grabbed.
 */
export class EpisodeCutoffUnmetSpecification implements IMonitoringSpecification<EpisodeContext> {
	async isSatisfied(
		context: EpisodeContext,
		_release?: ReleaseCandidate
	): Promise<SpecificationResult> {
		// Must have existing file to evaluate (otherwise it's missing, not upgrade)
		if (!context.existingFile) {
			return reject('no_existing_file');
		}

		// Must have profile
		if (!context.profile) {
			return reject(RejectionReason.NO_PROFILE);
		}

		// Check if upgrades are allowed by the profile
		if (!context.profile.upgradesAllowed) {
			return reject(RejectionReason.UPGRADES_NOT_ALLOWED);
		}

		// Always allow searching for upgrades - the minScoreIncrement check
		// in ReleaseDecisionService will ensure only meaningful improvements are grabbed
		return accept();
	}
}

/**
 * Convenience function to check if a movie is eligible for upgrade searching
 */
export async function isMovieCutoffUnmet(context: MovieContext): Promise<boolean> {
	const spec = new MovieCutoffUnmetSpecification();
	const result = await spec.isSatisfied(context);
	return result.accepted;
}

/**
 * Convenience function to check if an episode is eligible for upgrade searching
 */
export async function isEpisodeCutoffUnmet(context: EpisodeContext): Promise<boolean> {
	const spec = new EpisodeCutoffUnmetSpecification();
	const result = await spec.isSatisfied(context);
	return result.accepted;
}
