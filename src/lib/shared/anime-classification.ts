export interface AnimeClassificationInput {
	genres?: Array<{ id?: number; name?: string }> | null;
	originalLanguage?: string | null;
	originCountries?: string[] | null;
	productionCountries?: Array<{ iso_3166_1?: string }> | null;
	title?: string | null;
	originalTitle?: string | null;
	explicitAnimeType?: boolean;
}

const ANIMATION_GENRE_ID = 16;

function hasAnimationGenre(genres: AnimeClassificationInput['genres']): boolean {
	if (!genres || genres.length === 0) return false;

	return genres.some((genre) => {
		if (genre.id === ANIMATION_GENRE_ID) return true;
		return /animation/i.test(genre.name ?? '');
	});
}

function hasJapaneseOrigin(input: AnimeClassificationInput): boolean {
	if ((input.originalLanguage ?? '').toLowerCase() === 'ja') {
		return true;
	}

	if ((input.originCountries ?? []).some((country) => country.toUpperCase() === 'JP')) {
		return true;
	}

	return (input.productionCountries ?? []).some(
		(country) => (country.iso_3166_1 ?? '').toUpperCase() === 'JP'
	);
}

/**
 * Best-effort anime detection for TMDB media.
 * We intentionally keep this strict to avoid false positives when subtype enforcement is enabled.
 */
export function isLikelyAnimeMedia(input: AnimeClassificationInput): boolean {
	if (input.explicitAnimeType) {
		return true;
	}

	const japaneseOrigin = hasJapaneseOrigin(input);
	const animationGenre = hasAnimationGenre(input.genres);

	if (japaneseOrigin && animationGenre) {
		return true;
	}

	const titleBlob = `${input.title ?? ''} ${input.originalTitle ?? ''}`.trim();
	if (japaneseOrigin && /\banime\b/i.test(titleBlob)) {
		return true;
	}

	return false;
}
