export type MovieAvailabilityLevel = 'announced' | 'inCinemas' | 'released';

interface MovieAvailabilityInput {
	year: number | null | undefined;
	added: string | null | undefined;
	tmdbStatus?: string | null | undefined;
	releaseDate?: string | null | undefined;
}

/**
 * Determine movie availability using TMDB status/date when available.
 * Falls back to year/added heuristics when TMDB metadata is unavailable.
 */
export function getMovieAvailabilityLevel(
	movie: MovieAvailabilityInput,
	now: Date = new Date()
): MovieAvailabilityLevel {
	const status = movie.tmdbStatus?.trim().toLowerCase();
	const releaseTimestamp = movie.releaseDate ? new Date(movie.releaseDate).getTime() : Number.NaN;
	const hasValidReleaseDate = !Number.isNaN(releaseTimestamp);

	if (status === 'released') return 'released';
	if (status === 'post production') {
		if (hasValidReleaseDate && releaseTimestamp <= now.getTime()) return 'released';
		return 'inCinemas';
	}
	if (status === 'in production' || status === 'planned' || status === 'rumored') {
		return 'announced';
	}
	if (status === 'canceled') {
		return 'announced';
	}

	// Use explicit TMDB release date when status is unavailable/unknown.
	if (hasValidReleaseDate) {
		return releaseTimestamp <= now.getTime() ? 'released' : 'announced';
	}

	const currentYear = now.getFullYear();
	const movieYear = movie.year;

	if (!movieYear) return 'announced';
	if (movieYear > currentYear) return 'announced';
	if (movieYear < currentYear) return 'released';

	// Current-year movies are unreleased by default and only considered released
	// after they have been in-library for a sustained period.
	const addedTimestamp = movie.added ? new Date(movie.added).getTime() : Number.NaN;
	if (Number.isNaN(addedTimestamp)) return 'inCinemas';

	const daysSinceAdded = (now.getTime() - addedTimestamp) / (1000 * 60 * 60 * 24);
	if (daysSinceAdded > 120) return 'released';
	return 'inCinemas';
}

export function isMovieReleased(movie: MovieAvailabilityInput, now: Date = new Date()): boolean {
	return getMovieAvailabilityLevel(movie, now) === 'released';
}
