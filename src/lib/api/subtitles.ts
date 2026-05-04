import { apiGet, apiPost, apiPut, apiDelete } from './client.js';

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

export async function createLanguageProfile(payload: Record<string, unknown>) {
	return apiPost('/api/subtitles/language-profiles', payload);
}

export async function updateLanguageProfile(id: string, payload: Record<string, unknown>) {
	return apiPut(`/api/subtitles/language-profiles/${id}`, payload);
}

export async function deleteLanguageProfile(id: string) {
	return apiDelete(`/api/subtitles/language-profiles/${id}`);
}

export async function getSubtitleProviders() {
	return apiGet('/api/subtitles/providers');
}

export async function createSubtitleProvider(payload: Record<string, unknown>) {
	return apiPost('/api/subtitles/providers', payload);
}

export async function updateSubtitleProvider(id: string, payload: Record<string, unknown>) {
	return apiPut(`/api/subtitles/providers/${id}`, payload);
}

export async function deleteSubtitleProvider(id: string) {
	return apiDelete(`/api/subtitles/providers/${id}`);
}

export async function testSubtitleProvider(payload: Record<string, unknown>) {
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
