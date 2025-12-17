/**
 * CutoffUnmetSpecification
 *
 * Checks if an existing file's quality is below the profile's upgradeUntilScore cutoff.
 * This identifies content that has room for improvement.
 */

import { scoreRelease } from '$lib/server/scoring/scorer.js';
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
 * Check if a movie's existing file is below the quality cutoff
 */
export class MovieCutoffUnmetSpecification implements IMonitoringSpecification<MovieContext> {
	async isSatisfied(
		context: MovieContext,
		_release?: ReleaseCandidate
	): Promise<SpecificationResult> {
		// Must have existing file to evaluate
		if (!context.existingFile) {
			return reject('no_existing_file');
		}

		// Must have profile
		if (!context.profile) {
			return reject(RejectionReason.NO_PROFILE);
		}

		// Check if upgrades are allowed
		if (!context.profile.upgradesAllowed) {
			return reject(RejectionReason.UPGRADES_NOT_ALLOWED);
		}

		// Get upgradeUntilScore cutoff
		const upgradeUntilScore = context.profile.upgradeUntilScore || -1;
		if (upgradeUntilScore <= 0) {
			// No cutoff defined (upgrade forever)
			return accept();
		}

		// Get the full profile with format scores
		const fullProfile = await qualityFilter.getProfile(context.profile.id);
		if (!fullProfile) {
			return reject(RejectionReason.NO_PROFILE);
		}

		// Score the existing file
		const existingFileName = context.existingFile.sceneName || context.existingFile.relativePath;
		const existingScore = scoreRelease(existingFileName, fullProfile as ScoringProfile);

		// Check if below cutoff
		if (existingScore.totalScore >= upgradeUntilScore) {
			return reject(RejectionReason.ALREADY_AT_CUTOFF);
		}

		return accept();
	}
}

/**
 * Check if an episode's existing file is below the quality cutoff
 */
export class EpisodeCutoffUnmetSpecification implements IMonitoringSpecification<EpisodeContext> {
	async isSatisfied(
		context: EpisodeContext,
		_release?: ReleaseCandidate
	): Promise<SpecificationResult> {
		// Must have existing file to evaluate
		if (!context.existingFile) {
			return reject('no_existing_file');
		}

		// Must have profile
		if (!context.profile) {
			return reject(RejectionReason.NO_PROFILE);
		}

		// Check if upgrades are allowed
		if (!context.profile.upgradesAllowed) {
			return reject(RejectionReason.UPGRADES_NOT_ALLOWED);
		}

		// Get upgradeUntilScore cutoff
		const upgradeUntilScore = context.profile.upgradeUntilScore || -1;
		if (upgradeUntilScore <= 0) {
			// No cutoff defined (upgrade forever)
			return accept();
		}

		// Get the full profile with format scores
		const fullProfile = await qualityFilter.getProfile(context.profile.id);
		if (!fullProfile) {
			return reject(RejectionReason.NO_PROFILE);
		}

		// Score the existing file
		const existingFileName = context.existingFile.sceneName || context.existingFile.relativePath;
		const existingScore = scoreRelease(existingFileName, fullProfile as ScoringProfile);

		// Check if below cutoff
		if (existingScore.totalScore >= upgradeUntilScore) {
			return reject(RejectionReason.ALREADY_AT_CUTOFF);
		}

		return accept();
	}
}

/**
 * Convenience function to check if a movie's cutoff is unmet
 */
export async function isMovieCutoffUnmet(context: MovieContext): Promise<boolean> {
	const spec = new MovieCutoffUnmetSpecification();
	const result = await spec.isSatisfied(context);
	return result.accepted;
}

/**
 * Convenience function to check if an episode's cutoff is unmet
 */
export async function isEpisodeCutoffUnmet(context: EpisodeContext): Promise<boolean> {
	const spec = new EpisodeCutoffUnmetSpecification();
	const result = await spec.isSatisfied(context);
	return result.accepted;
}
