import { apiGet, apiPost, apiPut, apiDelete } from './client.js';

export async function getChannels(params?: Record<string, string>) {
	return apiGet('/api/livetv/channels', params);
}

export async function syncChannels() {
	return apiPost('/api/livetv/channels/sync');
}

export async function getChannelSyncStatus() {
	return apiGet('/api/livetv/channels/sync/status');
}

export async function getChannelsWithEpg() {
	return apiGet('/api/livetv/channels/with-epg');
}

export async function getEpgGuide(params?: Record<string, string>) {
	return apiGet('/api/livetv/epg/guide', params);
}

export async function getEpgNow() {
	return apiGet('/api/livetv/epg/now');
}

export async function syncEpg() {
	return apiPost('/api/livetv/epg/sync');
}

export async function getEpgStatus() {
	return apiGet('/api/livetv/epg/status');
}

export async function getEpgChannel(id: string) {
	return apiGet(`/api/livetv/epg/channel/${id}`);
}

export async function getLineup() {
	return apiGet('/api/livetv/lineup');
}

export async function addToLineup(channels: Array<{ accountId: string; channelId: string }>) {
	return apiPost('/api/livetv/lineup', { channels });
}

export async function removeFromLineup(ids: string[]) {
	return apiPost('/api/livetv/lineup/remove', { ids });
}

export async function reorderLineup(items: Array<{ id: string; order: number }>) {
	return apiPost('/api/livetv/lineup/reorder', { items });
}

export async function getLineupBackups(lineupId: string) {
	return apiGet(`/api/livetv/lineup/${lineupId}/backups`);
}

export async function restoreLineupBackup(lineupId: string, backupId: string) {
	return apiPost(`/api/livetv/lineup/${lineupId}/backups/${backupId}`);
}

export async function getAccounts() {
	return apiGet('/api/livetv/accounts');
}

export async function createAccount(payload: Record<string, unknown>) {
	return apiPost('/api/livetv/accounts', payload);
}

export async function updateAccount(id: string, payload: Record<string, unknown>) {
	return apiPut(`/api/livetv/accounts/${id}`, payload);
}

export async function deleteAccount(id: string) {
	return apiDelete(`/api/livetv/accounts/${id}`);
}

export async function testAccount(id: string) {
	return apiPost(`/api/livetv/accounts/${id}/test`);
}

export async function getCategories() {
	return apiGet('/api/livetv/categories');
}

export async function getChannelCategories(params?: Record<string, string>) {
	return apiGet('/api/livetv/channel-categories', params);
}

export async function createChannelCategory(payload: Record<string, unknown>) {
	return apiPost('/api/livetv/channel-categories', payload);
}

export async function updateChannelCategory(id: string, payload: Record<string, unknown>) {
	return apiPut(`/api/livetv/channel-categories/${id}`, payload);
}

export async function deleteChannelCategory(id: string) {
	return apiDelete(`/api/livetv/channel-categories/${id}`);
}

export async function reorderChannelCategories(ids: string[]) {
	return apiPost('/api/livetv/channel-categories/reorder', { ids });
}

export async function getCinephageIptvCountries() {
	return apiGet('/api/livetv/cinephage-iptv/countries');
}

export async function getPortals() {
	return apiGet('/api/livetv/portals');
}

export async function createPortal(payload: Record<string, unknown>) {
	return apiPost('/api/livetv/portals', payload);
}

export async function updatePortal(id: string, payload: Record<string, unknown>) {
	return apiPut(`/api/livetv/portals/${id}`, payload);
}

export async function deletePortal(id: string) {
	return apiDelete(`/api/livetv/portals/${id}`);
}

export async function scanPortal(id: string) {
	return apiPost(`/api/livetv/portals/${id}/scan`);
}

export async function getPortalScanHistory(id: string) {
	return apiGet(`/api/livetv/portals/${id}/scan/history`);
}

export async function getPortalScanResults(id: string) {
	return apiGet(`/api/livetv/portals/${id}/scan/results`);
}

export async function approvePortalScanResult(portalId: string, resultId: string) {
	return apiPost(`/api/livetv/portals/${portalId}/scan/results/approve`, { resultId });
}

export async function ignorePortalScanResult(portalId: string, resultId: string) {
	return apiPost(`/api/livetv/portals/${portalId}/scan/results/ignore`, { resultId });
}

export async function detectPortal(url: string) {
	return apiPost('/api/livetv/portals/detect', { url });
}

export async function bulkAssignCategory(lineupIds: string[], categoryId: string) {
	return apiPost('/api/livetv/lineup/bulk-category', { lineupIds, categoryId });
}

export async function bulkCleanChannelNames(lineupIds: string[]) {
	return apiPost('/api/livetv/lineup/bulk-clean-names', { ids: lineupIds });
}
