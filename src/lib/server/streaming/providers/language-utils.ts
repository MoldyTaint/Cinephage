/**
 * Language Utilities for Stream Selection
 *
 * Provides functions to match and sort streams by language preference.
 * Uses the shared language normalization from $lib/shared/languages.
 */

import { normalizeLanguageCode } from '$lib/shared/languages';

/**
 * Check if a stream language matches a preference code.
 * Handles regional variants (e.g., 'pt-BR' matches 'pt', 'es-419' matches 'es').
 */
export function languageMatches(streamLang: string | undefined, prefCode: string): boolean {
	if (!streamLang) return false;

	const normalizedStream = normalizeLanguageCode(streamLang);
	const normalizedPref = normalizeLanguageCode(prefCode);

	// Exact match
	if (normalizedStream === normalizedPref) return true;

	// Base language match (e.g., 'pt-br' matches 'pt', 'es-419' matches 'es')
	const streamBase = normalizedStream.split('-')[0];
	const prefBase = normalizedPref.split('-')[0];

	return streamBase === prefBase;
}

/**
 * Get priority index for a stream based on language preferences.
 * Lower index = higher priority. Returns Infinity if no match.
 */
export function getLanguagePriority(
	streamLang: string | undefined,
	preferredLanguages: string[]
): number {
	if (!preferredLanguages.length) return 0; // No preference = equal priority

	for (let i = 0; i < preferredLanguages.length; i++) {
		if (languageMatches(streamLang, preferredLanguages[i])) {
			return i;
		}
	}

	return Infinity; // No match
}

/**
 * Sort streams by language preference.
 * Streams matching earlier preferences come first.
 * Streams with no language or no match are placed at the end.
 * Works with any object that has an optional language field.
 */
export function sortStreamsByLanguage<T extends { language?: string }>(
	streams: T[],
	preferredLanguages: string[]
): T[] {
	if (!preferredLanguages.length) return streams;

	return [...streams].sort((a, b) => {
		const priorityA = getLanguagePriority(a.language, preferredLanguages);
		const priorityB = getLanguagePriority(b.language, preferredLanguages);
		return priorityA - priorityB;
	});
}

/**
 * Filter servers to prioritize those matching preferred languages.
 * Returns servers sorted by language preference, with matching servers first.
 */
export function prioritizeServersByLanguage<T extends { language: string }>(
	servers: T[],
	preferredLanguages: string[]
): T[] {
	if (!preferredLanguages.length) return servers;

	return [...servers].sort((a, b) => {
		const priorityA = getLanguagePriority(a.language, preferredLanguages);
		const priorityB = getLanguagePriority(b.language, preferredLanguages);
		return priorityA - priorityB;
	});
}

/**
 * Separate streams into matching (preferred language) and fallback (other languages).
 * Matching streams should be tried first; fallback only if all matching fail.
 * Streams without language metadata are treated as fallback.
 */
export function filterStreamsByLanguage<T extends { language?: string }>(
	streams: T[],
	preferredLanguages: string[]
): { matching: T[]; fallback: T[] } {
	if (!preferredLanguages.length) {
		// No preference = all streams treated equally (put in matching)
		return { matching: streams, fallback: [] };
	}

	const matching: T[] = [];
	const fallback: T[] = [];

	for (const stream of streams) {
		// Check if stream language matches any preferred language
		const hasMatch =
			stream.language && preferredLanguages.some((pref) => languageMatches(stream.language, pref));

		if (hasMatch) {
			matching.push(stream);
		} else {
			fallback.push(stream);
		}
	}

	return { matching, fallback };
}
