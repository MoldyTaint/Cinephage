/**
 * Language utilities for stream selection.
 */

import { normalizeLanguageCode, type LanguageTag } from '$lib/shared/languages';

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

/**
 * A fully resolved audio preference used for playback source selection and
 * snapshotted onto the playback session. Field order and values are canonical
 * (languages normalized + deduped) so snapshots can be compared reliably.
 */
export interface EffectiveAudioPreference {
	/** Prefer sources whose audio matches the media's original language */
	preferOriginal: boolean;
	/** Ordered fallback audio languages (canonical tags); empty means no preference */
	languages: LanguageTag[];
	/** Canonical original language of the media, when known; null otherwise */
	originalLanguage: string | null;
}

/**
 * The preference used when nothing is known (no library entry, no profile, or
 * a failed lookup). Resolution of "no preference" MUST go through this
 * constant so session-reuse compatibility compares consistently: pre-deploy
 * sessions without a stored snapshot are only reusable while the current
 * request still resolves to exactly this value.
 */
export const DEFAULT_EFFECTIVE_AUDIO_PREFERENCE: EffectiveAudioPreference = {
	preferOriginal: true,
	languages: [],
	originalLanguage: null
};

/**
 * Deep equality for resolved audio preferences (the JSON-compare semantics
 * required for session reuse, written field-by-field so it does not depend on
 * key insertion order). Inputs are expected to be canonical (resolved through
 * the same code path).
 */
export function audioPreferencesEqual(
	a: EffectiveAudioPreference,
	b: EffectiveAudioPreference
): boolean {
	if (a.preferOriginal !== b.preferOriginal) return false;
	if ((a.originalLanguage ?? null) !== (b.originalLanguage ?? null)) return false;
	if (a.languages.length !== b.languages.length) return false;
	return a.languages.every((tag, index) => tag === b.languages[index]);
}

/** Selection buckets for a source against a resolved audio preference. */
export const AUDIO_PREFERENCE_BUCKETS = {
	/** Matches the original language (when preferOriginal is on and it is known) */
	original: 0,
	/** Matches one of the profile's ordered fallback languages */
	preferred: 1,
	/** No language tag at all — treated as neutral */
	untagged: 2,
	/** Tagged, but matches neither the original nor any preferred language */
	other: 3
} as const;

/**
 * Rank a single source for the four-bucket audio ordering:
 * 0 = original-language match, 1 = preferred-language match (tie-broken by
 * preference index), 2 = untagged (neutral), 3 = everything else.
 *
 * Comparisons are normalized with base-tag fallback (see `languageMatches`):
 * an `eng`-tagged source matches an original language of `en`, and a `jpn`
 * source matches `ja`. `getLanguagePriority` returns 0 for an empty
 * preference list, so bucket 1 is skipped entirely when no fallback
 * languages are configured.
 */
function rankSourceByAudioPreference<T extends { language?: string }>(
	source: T,
	preference: EffectiveAudioPreference
): { bucket: number; preferenceIndex: number } {
	if (
		preference.preferOriginal &&
		typeof preference.originalLanguage === 'string' &&
		preference.originalLanguage !== '' &&
		languageMatches(source.language, preference.originalLanguage)
	) {
		return { bucket: AUDIO_PREFERENCE_BUCKETS.original, preferenceIndex: 0 };
	}

	if (preference.languages.length > 0) {
		const preferenceIndex = getLanguagePriority(source.language, preference.languages);
		if (preferenceIndex !== Infinity) {
			return { bucket: AUDIO_PREFERENCE_BUCKETS.preferred, preferenceIndex };
		}
	}

	if (!source.language || source.language.trim() === '') {
		return { bucket: AUDIO_PREFERENCE_BUCKETS.untagged, preferenceIndex: 0 };
	}

	return { bucket: AUDIO_PREFERENCE_BUCKETS.other, preferenceIndex: 0 };
}

/**
 * Which audio bucket a source falls into for the given preference. Exported so
 * callers that already picked a source can record WHY it was picked (e.g. the
 * original language drove the choice of an untagged source).
 */
export function resolveAudioPreferenceBucket<T extends { language?: string }>(
	source: T,
	preference: EffectiveAudioPreference
): number {
	return rankSourceByAudioPreference(source, preference).bucket;
}

/**
 * Order stream sources by audio preference:
 * bucket 0: sources matching `originalLanguage` (only when `preferOriginal`
 *           is on and an original language is known),
 * bucket 1: sources matching `preference.languages`, in preference order
 *           (lower preference index first),
 * bucket 2: sources without a language tag (neutral),
 * bucket 3: tagged sources matching neither (e.g. unknown languages).
 *
 * Relies on `Array.prototype.sort` stability (guaranteed since ES2019): sources
 * within a bucket keep their upstream order, so with the default preference the
 * upstream ordering is preserved unchanged. Returns a new array; the input is
 * not mutated.
 */
export function sortSourcesByAudioPreference<T extends { language?: string }>(
	sources: T[],
	preference: EffectiveAudioPreference
): T[] {
	return [...sources].sort((a, b) => {
		const rankA = rankSourceByAudioPreference(a, preference);
		const rankB = rankSourceByAudioPreference(b, preference);
		return rankA.bucket - rankB.bucket || rankA.preferenceIndex - rankB.preferenceIndex;
	});
}
