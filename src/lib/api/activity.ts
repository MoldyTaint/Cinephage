import { apiGet, apiPost, apiPut, apiDelete } from './client.js';

export async function getActivity(filters: Record<string, string>) {
	return apiGet('/api/activity', filters);
}

export async function deleteActivity(activityIds: string[]) {
	return apiDelete('/api/activity', { activityIds });
}

export async function getActivitySettings() {
	return apiGet('/api/activity/settings');
}

export async function setRetentionDays(retentionDays: number) {
	return apiPut('/api/activity/settings', { retentionDays });
}

export async function purgeHistory(action: 'older_than_retention' | 'all') {
	return apiPost('/api/activity/settings', { action });
}
