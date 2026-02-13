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

	const addedDate = movie.added ? new Date(movie.added) : now;
	const daysSinceAdded = (now.getTime() - addedDate.getTime()) / (1000 * 60 * 60 * 24);

	if (daysSinceAdded > 120) return 'released';
	if (daysSinceAdded > 30) return 'inCinemas';

	return 'inCinemas';
}

export function isMovieReleased(movie: MovieAvailabilityInput, now: Date = new Date()): boolean {
	return getMovieAvailabilityLevel(movie, now) === 'released';
}
