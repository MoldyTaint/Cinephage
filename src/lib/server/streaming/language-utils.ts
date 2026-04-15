/**
 * Language utilities for stream selection.
 */

import { normalizeLanguageCode } from '$lib/shared/languages';

export function languageMatches(streamLang: string | undefined, prefCode: string): boolean {
	if (!streamLang) return false;

	const normalizedStream = normalizeLanguageCode(streamLang);
	const normalizedPref = normalizeLanguageCode(prefCode);

	if (normalizedStream === normalizedPref) return true;

	const streamBase = normalizedStream.split('-')[0];
	const prefBase = normalizedPref.split('-')[0];

	return streamBase === prefBase;
}

export function getLanguagePriority(
	streamLang: string | undefined,
	preferredLanguages: string[]
): number {
	if (!preferredLanguages.length) return 0;

	for (let i = 0; i < preferredLanguages.length; i++) {
		if (languageMatches(streamLang, preferredLanguages[i])) {
			return i;
		}
	}

	return Infinity;
}

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

export function filterStreamsByLanguage<T extends { language?: string }>(
	streams: T[],
	preferredLanguages: string[]
): { matching: T[]; fallback: T[] } {
	if (!preferredLanguages.length) {
		return { matching: streams, fallback: [] };
	}

	const matching: T[] = [];
	const fallback: T[] = [];

	for (const stream of streams) {
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
