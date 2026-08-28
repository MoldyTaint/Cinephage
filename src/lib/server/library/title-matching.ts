/**
 * Shared title-matching primitives for TMDB matching.
 *
 * Both MediaMatcherService and ManualImportService score TMDB search results;
 * they previously carried private duplicates of this logic that drifted (the
 * manual importer never gained fixes made to the auto-matcher). Keep the
 * canonical implementation here.
 */

const TRAILING_ARTICLE = /\s*,\s*(the|an?)\s*$/i;

/**
 * Move a trailing comma-form article to the front: "Lion King, The" →
 * "The Lion King". Titles already in leading-article form pass through
 * unchanged.
 */
export function canonicalizeArticleTitle(title: string): string {
	const match = title.match(TRAILING_ARTICLE);
	if (!match) return title.trim();
	const withoutArticle = title.replace(TRAILING_ARTICLE, '').trim();
	if (!withoutArticle) return title.trim();
	const article = match[1].toLowerCase();
	const capitalized = article.charAt(0).toUpperCase() + article.slice(1);
	return `${capitalized} ${withoutArticle}`;
}

/**
 * Normalize a title for equality comparison. Inverted-article forms and
 * leading-article forms canonicalize to the same string: both
 * "Lion King, The" and "The Lion King" become "lionking".
 */
export function normalizeTitleForMatch(title: string): string {
	return canonicalizeArticleTitle(title)
		.toLowerCase()
		.replace(/^(the|an?)\s+/i, '') // Remove leading articles before stripping spaces
		.replace(/[^a-z0-9]/g, '');
}

/**
 * Calculate string similarity using Levenshtein distance.
 */
export function calculateTitleSimilarity(str1: string, str2: string): number {
	const s1 = str1.toLowerCase().trim();
	const s2 = str2.toLowerCase().trim();

	if (s1 === s2) return 1;
	if (s1.length === 0 || s2.length === 0) return 0;

	const matrix: number[][] = [];
	for (let i = 0; i <= s1.length; i++) {
		matrix[i] = [i];
	}
	for (let j = 0; j <= s2.length; j++) {
		matrix[0][j] = j;
	}

	for (let i = 1; i <= s1.length; i++) {
		for (let j = 1; j <= s2.length; j++) {
			const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
			matrix[i][j] = Math.min(
				matrix[i - 1][j] + 1, // deletion
				matrix[i][j - 1] + 1, // insertion
				matrix[i - 1][j - 1] + cost // substitution
			);
		}
	}

	const distance = matrix[s1.length][s2.length];
	const maxLength = Math.max(s1.length, s2.length);
	return 1 - distance / maxLength;
}

/**
 * Calculate match confidence between parsed info and a TMDB result.
 *
 * The local title may be TMDB's localized `title`/`name` OR its
 * `original_title`/`original_name` (e.g. a file named after the German
 * original of an English release), so the best of both similarities wins.
 */
export function calculateMatchConfidence(
	parsedTitle: string,
	parsedYear: number | undefined,
	tmdbTitle: string,
	tmdbYear: number | undefined,
	tmdbOriginalTitle?: string
): number {
	let titleScore = calculateTitleSimilarity(parsedTitle, tmdbTitle);
	if (tmdbOriginalTitle) {
		titleScore = Math.max(titleScore, calculateTitleSimilarity(parsedTitle, tmdbOriginalTitle));
	}

	if (parsedYear && tmdbYear && parsedYear === tmdbYear) {
		titleScore = Math.min(1, titleScore + 0.2);
	} else if (parsedYear && tmdbYear && parsedYear !== tmdbYear) {
		if (Math.abs(parsedYear - tmdbYear) > 1) {
			titleScore = titleScore * 0.7;
		}
	}

	if (
		normalizeTitleForMatch(parsedTitle) === normalizeTitleForMatch(tmdbTitle) ||
		(!!tmdbOriginalTitle &&
			normalizeTitleForMatch(parsedTitle) === normalizeTitleForMatch(tmdbOriginalTitle))
	) {
		titleScore = Math.max(titleScore, 0.95);
	}

	return Math.round(titleScore * 100) / 100;
}
