import type {
	LanguageProfileV2Create,
	LanguageProfileV2Update,
	LanguageSettingsUpdateInput,
	LanguageSettingsValues,
	SubtitleProviderCreate,
	SubtitleProviderUpdate,
	SubtitleProviderTest,
	SubtitleBatchAutoSearchRequest
} from '$lib/validation/schemas.js';

import { apiGet, apiPost, apiPut, apiDelete } from './client.js';
import { browser } from '$app/environment';

export async function searchSubtitles(payload: {
	movieId?: string;
	episodeId?: string;
	languages?: string[];
	providerIds?: string[];
	title?: string;
	year?: number;
	imdbId?: string;
	tmdbId?: number;
	seriesTitle?: string;
	season?: number;
	episode?: number;
	includeForced?: boolean;
	includeHearingImpaired?: boolean;
	excludeHearingImpaired?: boolean;
}) {
	return apiPost('/api/subtitles/search', payload);
}

export async function autoSearchSubtitles(payload: {
	movieId?: string;
	episodeId?: string;
	languages?: string[];
}) {
	return apiPost('/api/subtitles/auto-search', payload);
}

export async function downloadSubtitle(payload: {
	providerId: string;
	providerSubtitleId: string;
	language: string;
	movieId?: string;
	episodeId?: string;
	isForced?: boolean;
	isHearingImpaired?: boolean;
}) {
	return apiPost('/api/subtitles/download', payload);
}

export async function getSubtitleSettings() {
	return apiGet('/api/subtitles/settings');
}

/**
 * @deprecated Subtitle settings no longer carry language defaults; use the
 * language-settings endpoint instead. The payload is accepted as a loose
 * record so legacy callers keep compiling until the UI is rewired (Task 6);
 * the server schema strips the removed keys.
 */
export async function updateSubtitleSettings(payload: Record<string, unknown>) {
	return apiPut('/api/subtitles/settings', payload);
}

export async function resetSubtitleSettings() {
	return apiDelete('/api/subtitles/settings');
}

export async function syncSubtitle(
	subtitleId: string,
	options?: {
		referenceType?: string;
		referencePath?: string;
		splitPenalty?: number;
		noSplits?: boolean;
	}
) {
	return apiPost('/api/subtitles/sync', { subtitleId, ...options });
}

export async function getSubtitleSyncStatus() {
	return apiGet('/api/subtitles/sync');
}

export async function getLanguageProfiles() {
	return apiGet('/api/subtitles/language-profiles');
}

export async function createLanguageProfile(payload: LanguageProfileV2Create) {
	return apiPost('/api/subtitles/language-profiles', payload);
}

export async function updateLanguageProfile(id: string, payload: LanguageProfileV2Update) {
	return apiPut(`/api/subtitles/language-profiles/${id}`, payload);
}

export async function deleteLanguageProfile(id: string) {
	return apiDelete(`/api/subtitles/language-profiles/${id}`);
}

/**
 * Read the global language settings singleton (default profile, metadata
 * locale/region, discover filter, unknown-subtitle policy, auto-sync).
 */
export async function getLanguageSettings(): Promise<LanguageSettingsValues> {
	return apiGet<LanguageSettingsValues>('/api/subtitles/language-settings');
}

/** Partially update the global language settings singleton. */
export async function updateLanguageSettings(
	payload: LanguageSettingsUpdateInput
): Promise<LanguageSettingsValues> {
	return apiPut<LanguageSettingsValues>('/api/subtitles/language-settings', payload);
}

/**
 * Where an effective subtitle profile was resolved from. The add-flow
 * endpoint only resolves the instance default for NEW items; existing items
 * can also resolve from the item override or the library.
 */
export type EffectiveSubtitleProfileSource = 'movie' | 'series' | 'library' | 'default';

/** The subtitle profile a new library item will inherit, plus its source. */
export interface EffectiveSubtitleProfile {
	profile: { id: string; name: string };
	source: EffectiveSubtitleProfileSource;
}

/**
 * Resolve the effective subtitle profile for a NEW library item
 * (?mediaType=movie|series). Returns null when no default profile is
 * configured — the add flow surfaces this as a warning.
 */
export async function getEffectiveSubtitleProfile(
	mediaType: 'movie' | 'series'
): Promise<EffectiveSubtitleProfile | null> {
	return apiGet<EffectiveSubtitleProfile | null>(
		`/api/subtitles/language-settings/effective?mediaType=${mediaType}`
	);
}

export async function getSubtitleProviders() {
	return apiGet('/api/subtitles/providers');
}

export async function createSubtitleProvider(payload: SubtitleProviderCreate) {
	return apiPost('/api/subtitles/providers', payload);
}

export async function updateSubtitleProvider(id: string, payload: SubtitleProviderUpdate) {
	return apiPut(`/api/subtitles/providers/${id}`, payload);
}

export async function deleteSubtitleProvider(id: string) {
	return apiDelete(`/api/subtitles/providers/${id}`);
}

export async function testSubtitleProvider(payload: SubtitleProviderTest) {
	return apiPost('/api/subtitles/providers/test', payload);
}

export async function reorderSubtitleProviders(providerIds: string[]) {
	return apiPost('/api/subtitles/providers/reorder', { providerIds });
}

export async function getSubtitleHistory() {
	return apiGet('/api/subtitles/history');
}

export async function scanSubtitles() {
	return apiPost('/api/subtitles/scan');
}

export async function getSubtitleBlacklist() {
	return apiGet('/api/subtitles/blacklist');
}

export async function deleteSubtitleBlacklistEntry(id: string) {
	return apiDelete(`/api/subtitles/blacklist/${id}`);
}

export async function deleteSubtitle(subtitleId: string) {
	return apiDelete(`/api/subtitles/${subtitleId}`);
}

export async function batchAutoSearchSubtitles(
	payload: SubtitleBatchAutoSearchRequest
): Promise<Response> {
	if (!browser) {
		throw new Error('batchAutoSearchSubtitles can only be used in the browser');
	}
	return fetch('/api/subtitles/auto-search/batch', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload)
	});
}
