import type {
	RootFolderCreate,
	RootFolderUpdate,
	LibraryCreate,
	LibraryUpdate,
	NamingConfigUpdate,
	NamingPresetSelection,
	ScoringProfileCreate,
	ScoringProfileUpdate,
	GlobalTmdbFilters,
	DownloadClientCreate,
	DownloadClientUpdate,
	DownloadClientTest,
	MediaBrowserServerCreate,
	MediaBrowserServerUpdate,
	MediaBrowserServerTest,
	NamingPresetCreate,
	NamingPresetUpdate,
	NamingPreview,
	LibraryClassificationUpdate,
	BackupImport
} from '$lib/validation/schemas.js';

import { apiGet, apiPost, apiPut, apiDelete } from './client.js';

export async function getRootFolders() {
	return apiGet('/api/root-folders');
}

export async function createRootFolder(payload: RootFolderCreate) {
	return apiPost('/api/root-folders', payload);
}

export async function updateRootFolder(id: string, payload: RootFolderUpdate) {
	return apiPut(`/api/root-folders/${id}`, payload);
}

export async function deleteRootFolder(id: string) {
	return apiDelete(`/api/root-folders/${id}`);
}

export async function validateRootFolder(path: string, mediaType?: string) {
	return apiPost('/api/root-folders/validate', { path, mediaType });
}

export async function getLibraries(params?: { mediaType?: string; includeSystem?: boolean }) {
	const query: Record<string, string> = {};
	if (params?.mediaType) query.mediaType = params.mediaType;
	if (params?.includeSystem !== undefined) query.includeSystem = String(params.includeSystem);
	return apiGet('/api/libraries', query);
}

export async function createLibrary(payload: LibraryCreate) {
	return apiPost('/api/libraries', payload);
}

export async function updateLibrary(id: string, payload: LibraryUpdate) {
	return apiPut(`/api/libraries/${id}`, payload);
}

export async function deleteLibrary(id: string, body?: Record<string, unknown>) {
	return apiDelete(`/api/libraries/${id}`, body);
}

export async function getNamingConfig() {
	return apiGet('/api/naming');
}

export async function updateNamingConfig(
	config: NamingConfigUpdate,
	presetSelection?: NamingPresetSelection
) {
	return apiPut('/api/naming', { config, presetSelection });
}

export async function resetNamingConfig() {
	return apiDelete('/api/naming');
}

export async function getNamingPresets() {
	return apiGet('/api/naming/presets');
}

export async function getNamingPreset(id: string) {
	return apiGet(`/api/naming/presets/${id}`);
}

export async function createNamingPreset(payload: NamingPresetCreate) {
	return apiPost('/api/naming/presets', payload);
}

export async function updateNamingPreset(id: string, payload: NamingPresetUpdate) {
	return apiPut(`/api/naming/presets/${id}`, payload);
}

export async function deleteNamingPreset(id: string) {
	return apiDelete(`/api/naming/presets/${id}`);
}

export async function previewNaming(payload: NamingPreview) {
	return apiPost('/api/naming/preview', payload);
}

export async function validateNaming(pattern: string) {
	return apiPost('/api/naming/validate', { pattern });
}

export async function validateNamingFormats(formats: Record<string, string>) {
	return apiPost('/api/naming/validate', { formats });
}

export async function getNamingTokens() {
	return apiGet('/api/naming/tokens');
}

export async function getRenamePreview(mediaType?: string) {
	const params: Record<string, string> = {};
	if (mediaType) params.mediaType = mediaType;
	return apiGet('/api/rename/preview', params);
}

export async function getMovieRenamePreview(movieId: string) {
	return apiGet(`/api/rename/preview/movie/${movieId}`);
}

export async function getSeriesRenamePreview(seriesId: string) {
	return apiGet(`/api/rename/preview/series/${seriesId}`);
}

export async function executeRename(fileIds: string[], mediaType?: string) {
	return apiPost('/api/rename/execute', { fileIds, mediaType });
}

export async function getScoringProfiles() {
	return apiGet('/api/scoring-profiles');
}

export async function createScoringProfile(payload: ScoringProfileCreate) {
	return apiPost('/api/scoring-profiles', payload);
}

export async function updateScoringProfile(payload: { id: string } & ScoringProfileUpdate) {
	return apiPut('/api/scoring-profiles', payload);
}

export async function deleteScoringProfile(id: string) {
	return apiDelete('/api/scoring-profiles', { id });
}

export async function getTmdbSettings() {
	return apiGet('/api/settings/tmdb');
}

export async function updateTmdbSettings(apiKey: string) {
	return apiPut('/api/settings/tmdb', { apiKey });
}

export async function getTmdbFilters() {
	return apiGet('/api/settings/filters');
}

export async function updateTmdbFilters(filters: GlobalTmdbFilters) {
	return apiPut('/api/settings/filters', filters);
}

export async function getBlocklist(params?: {
	limit?: number;
	offset?: number;
	reason?: string;
	protocol?: string;
	activeOnly?: boolean;
}) {
	const query: Record<string, string> = {};
	if (params?.limit) query.limit = String(params.limit);
	if (params?.offset) query.offset = String(params.offset);
	if (params?.reason) query.reason = params.reason;
	if (params?.protocol) query.protocol = params.protocol;
	if (params?.activeOnly) query.activeOnly = 'true';
	return apiGet('/api/settings/blocklist', query);
}

export async function deleteBlocklistEntries(ids?: string[]) {
	return apiDelete('/api/settings/blocklist', ids ? { ids } : undefined);
}

export async function purgeBlocklistExpired() {
	return apiDelete('/api/settings/blocklist', { action: 'purgeExpired' });
}

export async function exportConfig(passphrase: string, includeIndexerCookies?: boolean) {
	return apiPost('/api/settings/system/backup', { passphrase, includeIndexerCookies });
}

export async function importConfig(
	passphrase: string,
	backup: BackupImport['backup'],
	opts?: { sections?: BackupImport['sections']; mode?: BackupImport['mode'] }
) {
	return apiPut('/api/settings/system/backup', { passphrase, backup, ...opts });
}

export async function getLogSettings() {
	return apiGet('/api/settings/logs/settings');
}

export async function updateLogSettings(retentionDays: number) {
	return apiPut('/api/settings/logs/settings', { retentionDays });
}

export async function downloadLogs(params?: Record<string, string>) {
	return apiGet('/api/settings/logs/download', params);
}

export async function getLogHistory(params?: Record<string, string>) {
	return apiGet('/api/settings/logs/history', params);
}

export async function reportClientLog(entries: unknown[]) {
	return apiPost('/api/settings/logs/client-report', { entries });
}

export async function getApiKeys() {
	return apiGet('/api/settings/system/api-keys');
}

export async function createApiKeys() {
	return apiPost('/api/settings/system/api-keys');
}

export async function regenerateApiKey(keyId: string) {
	return apiPost(`/api/settings/system/api-keys/${keyId}/regenerate`);
}

export async function cleanupStreamingCache() {
	return apiPost('/api/settings/streaming/cache/cleanup');
}

export async function getExternalUrl() {
	return apiGet('/api/settings/external-url');
}

export async function updateExternalUrl(url: string) {
	return apiPut('/api/settings/external-url', { url });
}

export async function getSystemStatus() {
	return apiGet('/api/system/status');
}

export async function getGithubRelease() {
	return apiGet('/api/system/github-release');
}

export async function getLibraryClassificationSettings() {
	return apiGet('/api/settings/library/classification');
}

export async function updateLibraryClassificationSettings(payload: LibraryClassificationUpdate) {
	return apiPut('/api/settings/library/classification', payload);
}

export async function getWorkers(type?: string, activeOnly?: boolean) {
	const params: Record<string, string> = {};
	if (type) params.type = type;
	if (activeOnly) params.active = 'true';
	return apiGet('/api/workers', params);
}

export async function clearCompletedWorkers() {
	return apiDelete('/api/workers');
}

export async function getMediaServerStats() {
	return apiGet('/api/media-server-stats');
}

export async function syncMediaServerStats() {
	return apiPost('/api/media-server-stats/sync');
}

export async function getDownloadClients() {
	return apiGet('/api/download-clients');
}

export async function createDownloadClient(payload: DownloadClientCreate) {
	return apiPost('/api/download-clients', payload);
}

export async function updateDownloadClient(id: string, payload: DownloadClientUpdate) {
	return apiPut(`/api/download-clients/${id}`, payload);
}

export async function deleteDownloadClient(id: string) {
	return apiDelete(`/api/download-clients/${id}`);
}

export async function testDownloadClient(id: string) {
	return apiPost(`/api/download-clients/${id}/test`);
}

export async function testNewDownloadClient(payload: DownloadClientTest) {
	return apiPost('/api/download-clients/test', payload);
}

export async function getMediaBrowserNotifications() {
	return apiGet('/api/notifications/mediabrowser');
}

export async function getMediaBrowserNotification(id: string) {
	return apiGet(`/api/notifications/mediabrowser/${id}`);
}

export async function createMediaBrowserNotification(payload: MediaBrowserServerCreate) {
	return apiPost('/api/notifications/mediabrowser', payload);
}

export async function updateMediaBrowserNotification(id: string, payload: MediaBrowserServerUpdate) {
	return apiPut(`/api/notifications/mediabrowser/${id}`, payload);
}

export async function deleteMediaBrowserNotification(id: string) {
	return apiDelete(`/api/notifications/mediabrowser/${id}`);
}

export async function testMediaBrowserNotification(id: string, payload?: Record<string, unknown>) {
	return apiPost(`/api/notifications/mediabrowser/${id}/test`, payload);
}

export async function testNewMediaBrowserNotification(payload: MediaBrowserServerTest) {
	return apiPost('/api/notifications/mediabrowser/test', payload);
}

export async function updateLogoSettings(payload: Record<string, unknown>) {
	return apiPut('/api/logos', payload);
}

export async function getLogoStatus() {
	return apiGet('/api/logos/status');
}

export async function getLogoCountries() {
	return apiGet('/api/logos/countries');
}

export async function downloadLogos(payload: Record<string, unknown>) {
	return apiPost('/api/logos/download', payload);
}

export async function updateUserLanguage(language: string) {
	return apiPut('/api/user/language', { language });
}
