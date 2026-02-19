export type MovieAvailabilityLevel = 'announced' | 'inCinemas' | 'released';

interface MovieAvailabilityInput {
	year: number | null | undefined;
	added: string | null | undefined;
}

/**
 * Match server-side availability heuristics used for movie searching.
 */
export function getMovieAvailabilityLevel(
	movie: MovieAvailabilityInput,
	now: Date = new Date()
): MovieAvailabilityLevel {
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
