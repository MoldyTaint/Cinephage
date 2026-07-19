/**
 * DB-coupled multi-quality resolver for movies.
 *
 * Loads the scoring profile's resolution bounds lazily and delegates the pure
 * bucket math to {@link ./buckets.js}. The fast path avoids any DB query when a
 * movie clearly cannot be in multi-quality mode (null/<2 desired qualities).
 */
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { scoringProfiles } from '$lib/server/db/schema';
import type { Resolution } from '$lib/server/indexers/parser/types.js';
import { effectiveBuckets, isMultiQualityMode } from './buckets.js';

export interface MovieMultiQualityContext {
	effective: Resolution[];
	multiQuality: boolean;
}

const EMPTY: MovieMultiQualityContext = { effective: [], multiQuality: false };

export async function resolveMovieMultiQuality(
	desiredQualities: Resolution[] | null | undefined,
	scoringProfileId: string | null | undefined
): Promise<MovieMultiQualityContext> {
	if (!desiredQualities || desiredQualities.length < 2) return EMPTY;

	let minResolution: string | null = null;
	let maxResolution: string | null = null;
	if (scoringProfileId) {
		const [profile] = await db
			.select({
				minResolution: scoringProfiles.minResolution,
				maxResolution: scoringProfiles.maxResolution
			})
			.from(scoringProfiles)
			.where(eq(scoringProfiles.id, scoringProfileId))
			.limit(1);
		minResolution = profile?.minResolution ?? null;
		maxResolution = profile?.maxResolution ?? null;
	}

	const effective = effectiveBuckets(desiredQualities, minResolution, maxResolution);
	return { effective, multiQuality: isMultiQualityMode(effective) };
}
