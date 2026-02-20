import { logger } from '$lib/logging';
import { tmdb } from '$lib/server/tmdb';
import {
	getMovieAvailabilityLevel,
	type MovieAvailabilityLevel
} from '$lib/utils/movieAvailability';

interface MovieAvailabilityRow {
	tmdbId: number;
	year: number | null;
	added: string | null;
	monitored: boolean | null;
}

type MovieReleaseInfo = {
	status?: string;
	release_date?: string | null;
};

export interface MissingMovieAvailabilityCounts {
	monitoredReleasedMissing: number;
	monitoredUnreleased: number;
	unmonitoredMissing: number;
}

async function getReleaseInfoMap(tmdbIds: number[]): Promise<Map<number, MovieReleaseInfo | null>> {
	const uniqueTmdbIds = [...new Set(tmdbIds)];
	if (uniqueTmdbIds.length === 0) return new Map();

	const releaseInfoEntries = await Promise.all(
		uniqueTmdbIds.map(async (tmdbId) => {
			try {
				const info = await tmdb.getMovieReleaseInfo(tmdbId);
				return [tmdbId, info] as const;
			} catch (error) {
				logger.warn('[Dashboard] Failed to fetch TMDB movie release info', {
					tmdbId,
					error: error instanceof Error ? error.message : String(error)
				});
				return [tmdbId, null] as const;
			}
		})
	);

	return new Map(releaseInfoEntries);
}

export async function computeMissingMovieAvailabilityCounts(
	movies: MovieAvailabilityRow[]
): Promise<MissingMovieAvailabilityCounts> {
	let monitoredReleasedMissing = 0;
	let monitoredUnreleased = 0;
	let unmonitoredMissing = 0;

	const now = new Date();
	const currentYear = now.getFullYear();

	// Only current-year/unknown-year monitored movies are ambiguous enough to require TMDB status/date.
	const tmdbLookupIds = movies
		.filter(
			(movie) => Boolean(movie.monitored) && (movie.year === currentYear || movie.year === null)
		)
		.map((movie) => movie.tmdbId);
	const releaseInfoByTmdbId = await getReleaseInfoMap(tmdbLookupIds);

	for (const movie of movies) {
		if (!movie.monitored) {
			unmonitoredMissing++;
			continue;
		}

		// Fast-path for non-ambiguous years.
		if (movie.year !== null && movie.year < currentYear) {
			monitoredReleasedMissing++;
			continue;
		}
		if (movie.year !== null && movie.year > currentYear) {
			monitoredUnreleased++;
			continue;
		}

		const releaseInfo = releaseInfoByTmdbId.get(movie.tmdbId);
		const availability = getMovieAvailabilityLevel(
			{
				year: movie.year,
				added: movie.added,
				tmdbStatus: releaseInfo?.status,
				releaseDate: releaseInfo?.release_date
			},
			now
		);

		if (availability === 'released') monitoredReleasedMissing++;
		else monitoredUnreleased++;
	}

	return {
		monitoredReleasedMissing,
		monitoredUnreleased,
		unmonitoredMissing
	};
}

export async function enrichMoviesWithAvailability<T extends MovieAvailabilityRow>(
	movies: T[]
): Promise<Array<T & { availability: MovieAvailabilityLevel; isReleased: boolean }>> {
	const now = new Date();
	const releaseInfoByTmdbId = await getReleaseInfoMap(movies.map((movie) => movie.tmdbId));

	return movies.map((movie) => {
		const releaseInfo = releaseInfoByTmdbId.get(movie.tmdbId);
		const availability = getMovieAvailabilityLevel(
			{
				year: movie.year,
				added: movie.added,
				tmdbStatus: releaseInfo?.status,
				releaseDate: releaseInfo?.release_date
			},
			now
		);

		return {
			...movie,
			availability,
			isReleased: availability === 'released'
		};
	});
}
