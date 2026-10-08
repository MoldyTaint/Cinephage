/**
 * MonitoredSpecification
 *
 * Checks if content is monitored for automated searching.
 * For TV shows, implements cascading monitoring logic:
 * - Episode is monitored if series.monitored AND season.monitored AND episode.monitored
 */

import { db } from '#lib/server/db/index.js';
import { seasons } from '#lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import type {
	IMonitoringSpecification,
	MovieContext,
	EpisodeContext,
	SpecificationResult,
	ReleaseCandidate
} from './types.js';
import { reject, accept, RejectionReason } from './types.js';

/**
 * Check if a movie is monitored
 */
export class MovieMonitoredSpecification implements IMonitoringSpecification<MovieContext> {
	async isSatisfied(
		context: MovieContext,
		_release?: ReleaseCandidate
	): Promise<SpecificationResult> {
		if (!context.movie.monitored) {
			return reject(RejectionReason.NOT_MONITORED);
		}

		return accept();
	}
}

/**
 * Check if an episode is monitored (with cascading logic)
 */
export class EpisodeMonitoredSpecification implements IMonitoringSpecification<EpisodeContext> {
	async isSatisfied(
		context: EpisodeContext,
		_release?: ReleaseCandidate
	): Promise<SpecificationResult> {
		// Check series-level monitoring
		if (!context.series.monitored) {
			return reject(RejectionReason.SERIES_NOT_MONITORED);
		}

		// Check episode-level monitoring
		if (!context.episode.monitored) {
			return reject(RejectionReason.NOT_MONITORED);
		}

		// Check season-level monitoring (need to fetch from DB)
		// If seasonId is missing, default to monitored
		if (!context.episode.seasonId) {
			return accept();
		}

		const season = await db.query.seasons.findFirst({
			where: eq(seasons.id, context.episode.seasonId)
		});

		if (!season) {
			// If no season record, default to monitored
			return accept();
		}

		if (!season.monitored) {
			return reject(RejectionReason.SEASON_NOT_MONITORED);
		}

		return accept();
	}
}

/**
 * Convenience function to check if a movie is monitored
 */
export async function isMovieMonitored(context: MovieContext): Promise<boolean> {
	const spec = new MovieMonitoredSpecification();
	const result = await spec.isSatisfied(context);
	return result.accepted;
}

/**
 * Convenience function to check if an episode is monitored
 */
export async function isEpisodeMonitored(context: EpisodeContext): Promise<boolean> {
	const spec = new EpisodeMonitoredSpecification();
	const result = await spec.isSatisfied(context);
	return result.accepted;
}
