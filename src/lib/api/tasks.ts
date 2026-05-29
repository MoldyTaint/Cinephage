import { apiGet, apiPut } from './client.js';

export async function getTasks() {
	return apiGet('/api/tasks');
}

export async function setTaskEnabled(taskId: string, enabled: boolean) {
	return apiPut(`/api/tasks/${taskId}/enabled`, { enabled });
}

export async function setTaskInterval(taskId: string, intervalHours: number) {
	return apiPut(`/api/tasks/${taskId}/interval`, { intervalHours });
}

export async function runTask(taskId: string) {
	return apiPut(`/api/tasks/${taskId}/run`);
}

export async function getTaskHistory(taskId: string, limit?: number, offset?: number) {
	const params: Record<string, string> = {};
	if (limit !== undefined) params.limit = String(limit);
	if (offset !== undefined) params.offset = String(offset);
	return apiGet(`/api/tasks/${taskId}/history`, params);
}

export async function cancelTask(taskId: string) {
	return apiPut(`/api/tasks/${taskId}/cancel`);
}
