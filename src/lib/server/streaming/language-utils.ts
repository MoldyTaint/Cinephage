/**
 * Language utilities for stream selection.
 *
 * The audio-preference policy core (four-bucket ranking, effective-preference
 * equality) lives in `$lib/server/languages/audio-preference.ts` so the
 * acquisition paths can consume the same ranking; this module re-exports it
 * for the existing streaming consumers and keeps the stream-shaped helpers.
 */

import { getLanguagePriority, languageMatches } from '$lib/server/languages/audio-preference';

export {
	languageMatches,
	getLanguagePriority,
	DEFAULT_EFFECTIVE_AUDIO_PREFERENCE,
	audioPreferencesEqual,
	AUDIO_PREFERENCE_BUCKETS,
	resolveAudioPreferenceBucket,
	sortSourcesByAudioPreference
} from '$lib/server/languages/audio-preference';
export type { EffectiveAudioPreference } from '$lib/server/languages/audio-preference';

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
