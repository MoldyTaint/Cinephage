import type { Movie, TVShow, Person, TmdbMediaItem, CastMember, CrewMember } from './tmdb';

/**
 * Type guard to check if an item is a Movie.
 * Movies have a 'title' property and optionally media_type='movie'.
 */
export function isMovie(item: TmdbMediaItem): item is Movie {
	if (item.media_type === 'movie') return true;
	if (item.media_type === 'tv' || item.media_type === 'person') return false;
	return 'title' in item;
}

/**
 * Type guard to check if an item is a TVShow.
 * TV shows have a 'name' property, 'first_air_date', and optionally media_type='tv'.
 */
export function isTVShow(item: TmdbMediaItem): item is TVShow {
	if (item.media_type === 'tv') return true;
	if (item.media_type === 'movie' || item.media_type === 'person') return false;
	return 'first_air_date' in item && 'name' in item;
}

/**
 * Type guard to check if an item is a Person.
 * Persons have 'known_for_department' and optionally media_type='person'.
 */
export function isPerson(item: TmdbMediaItem): item is Person {
	if (item.media_type === 'person') return true;
	if (item.media_type === 'movie' || item.media_type === 'tv') return false;
	return 'known_for_department' in item;
}

/**
 * Type guard to check if a cast/crew member is a CastMember.
 * CastMembers have 'character' property.
 */
export function isCastMember(person: CastMember | CrewMember): person is CastMember {
	return 'character' in person;
}

/**
 * Get the title from a media item (works for Movie, TVShow, or Person).
 */
export function getMediaTitle(item: TmdbMediaItem): string {
	if (isMovie(item)) return item.title;
	return item.name;
}

/**
 * Get the release/air date from a media item.
 */
export function getMediaDate(item: TmdbMediaItem): string {
	if (isMovie(item)) return item.release_date;
	if (isTVShow(item)) return item.first_air_date;
	return '';
}

/**
 * Get the poster/profile image path from a media item.
 */
export function getMediaPoster(item: TmdbMediaItem): string | null {
	if (isPerson(item)) return item.profile_path;
	return item.poster_path;
}

/**
 * Get the appropriate link path for a media item.
 */
export function getMediaLink(item: TmdbMediaItem): string {
	if (isMovie(item)) return `/discover/movie/${item.id}`;
	if (isTVShow(item)) return `/discover/tv/${item.id}`;
	return `/discover/person/${item.id}`;
}

/**
 * Get the media type label for display.
 */
export function getMediaTypeLabel(item: TmdbMediaItem): 'Movie' | 'TV' | 'Person' | null {
	if (isMovie(item)) return 'Movie';
	if (isTVShow(item)) return 'TV';
	if (isPerson(item)) return 'Person';
	return null;
}
