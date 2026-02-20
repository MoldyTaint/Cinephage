/**
 * AvailabilitySpecification
 *
 * Checks if a movie has reached its minimum availability status before
 * automated searching/grabbing. This prevents downloading pre-release
 * content that might be fake or low quality.
 *
 * Availability levels (in order of release):
 * - 'announced': Movie has been announced (very early, often no releases)
 * - 'inCinemas': Movie is currently in theaters
 * - 'released': Movie is released on digital/physical media
 *
 * The specification accepts if the movie's current state meets or exceeds
 * the configured minimum availability threshold.
 */

import type {
	IMonitoringSpecification,
	MovieContext,
	SpecificationResult,
	ReleaseCandidate
} from './types.js';
import { reject, accept } from './types.js';
import { tmdb } from '$lib/server/tmdb.js';
import { logger } from '$lib/logging';
import { getMovieAvailabilityLevel } from '$lib/utils/movieAvailability';

/**
 * Availability levels in order of "availability"
 * Higher index = more available
 */
const AVAILABILITY_ORDER = ['announced', 'inCinemas', 'released'] as const;
type AvailabilityLevel = (typeof AVAILABILITY_ORDER)[number];

/**
 * Extended RejectionReason for availability
 */
export const AvailabilityRejectionReason = {
	NOT_YET_AVAILABLE: 'not_yet_available',
	UNKNOWN_AVAILABILITY: 'unknown_availability'
} as const;

/**
 * Check if a movie meets minimum availability requirements
 */
export class MovieAvailabilitySpecification implements IMonitoringSpecification<MovieContext> {
	private releaseInfoCache = new Map<
		number,
		{ status?: string; release_date?: string | null } | null
	>();

	async isSatisfied(
		context: MovieContext,
		_release?: ReleaseCandidate
	): Promise<SpecificationResult> {
		const { movie } = context;

		// Get minimum availability setting (default to 'released' for safety)
		const minimumAvailability = (movie.minimumAvailability as AvailabilityLevel) || 'released';

		// Compare availability levels
		const minimumIndex = AVAILABILITY_ORDER.indexOf(minimumAvailability);

		if (minimumIndex === -1) {
			// Unknown minimum availability setting, allow by default
			return accept();
		}

		// 'announced' is the lowest threshold; every movie satisfies it.
		if (minimumAvailability === 'announced') {
			return accept();
		}

		// Determine current availability status from TMDB status/date (fallback: local heuristics)
		const currentAvailability = await this.getCurrentAvailability(movie);
		const currentIndex = AVAILABILITY_ORDER.indexOf(currentAvailability);

		if (currentIndex === -1) {
			// Can't determine current availability - be cautious and reject
			return reject(AvailabilityRejectionReason.UNKNOWN_AVAILABILITY);
		}

		if (currentIndex < minimumIndex) {
			// Current availability hasn't reached minimum threshold
			return reject(
				`${AvailabilityRejectionReason.NOT_YET_AVAILABLE}: movie is ${currentAvailability}, requires ${minimumAvailability}`
			);
		}

		return accept();
	}

	private async getCurrentAvailability(movie: MovieContext['movie']): Promise<AvailabilityLevel> {
		const releaseInfo = await this.getReleaseInfo(movie.tmdbId);

		return getMovieAvailabilityLevel({
			year: movie.year,
			added: movie.added,
			tmdbStatus: releaseInfo?.status,
			releaseDate: releaseInfo?.release_date
		});
	}

	private async getReleaseInfo(
		tmdbId: number
	): Promise<{ status?: string; release_date?: string | null } | null> {
		if (this.releaseInfoCache.has(tmdbId)) {
			return this.releaseInfoCache.get(tmdbId) ?? null;
		}

		try {
			const releaseInfo = await tmdb.getMovieReleaseInfo(tmdbId);
			this.releaseInfoCache.set(tmdbId, releaseInfo);
			return releaseInfo;
		} catch (error) {
			logger.warn('[MovieAvailabilitySpecification] Failed to fetch TMDB release info', {
				tmdbId,
				error: error instanceof Error ? error.message : String(error)
			});
			this.releaseInfoCache.set(tmdbId, null);
			return null;
		}
	}
}

/**
 * Convenience function to check if a movie is available
 */
export async function isMovieAvailable(
	context: MovieContext,
	minimumAvailability?: AvailabilityLevel
): Promise<boolean> {
	// Override the context's minimum availability if specified
	const contextWithOverride = minimumAvailability
		? {
				...context,
				movie: { ...context.movie, minimumAvailability }
			}
		: context;

	const spec = new MovieAvailabilitySpecification();
	const result = await spec.isSatisfied(contextWithOverride);
	return result.accepted;
}
