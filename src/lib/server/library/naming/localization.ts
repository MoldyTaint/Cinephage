import { tmdb } from '$lib/server/tmdb';

export function extractLanguageCodes(format: string): string[] {
	const pattern = /\{(?:Title|CleanTitle):([A-Za-z]{2,3})\}/gi;
	const codes = [...format.matchAll(pattern)].map((m) => m[1].toLowerCase());
	return [...new Set(codes)];
}

export async function resolveLocalizedTitles(
	tmdbId: number,
	languages: string[]
): Promise<Record<string, string>> {
	if (languages.length === 0) return {};

	const result: Record<string, string> = {};

	for (const lang of languages) {
		try {
			const locale = lang.includes('-') ? lang : `${lang}-${lang.toUpperCase()}`;
			const movie = (await tmdb.fetch(`/movie/${tmdbId}?language=${locale}`, {}, true)) as Record<
				string,
				unknown
			>;
			if (typeof movie.title === 'string') {
				result[lang] = movie.title;
			}
		} catch {
			// Non-fatal: fallback to default title
		}
	}

	return result;
}
