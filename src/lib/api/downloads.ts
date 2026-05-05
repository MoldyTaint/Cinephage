import type { GrabRequest } from '$lib/validation/schemas.js';

import { apiGet, apiPost, apiPatch, apiDelete } from './client.js';

export async function grabRelease(payload: GrabRequest) {
	return apiPost('/api/download/grab', payload);
}

export async function getQueue(params?: Record<string, string>) {
	return apiGet('/api/queue', params);
}

export async function getQueueItem(id: string) {
	return apiGet(`/api/queue/${id}`);
}

export async function pauseQueueItem(id: string) {
	return apiPatch(`/api/queue/${id}`, { action: 'pause' });
}

export async function resumeQueueItem(id: string) {
	return apiPatch(`/api/queue/${id}`, { action: 'resume' });
}

export async function removeQueueItem(
	id: string,
	opts?: { removeFromClient?: boolean; deleteFiles?: boolean; blocklist?: boolean }
) {
	const params: Record<string, string> = {};
	if (opts?.removeFromClient === false) params.removeFromClient = 'false';
	if (opts?.deleteFiles) params.deleteFiles = 'true';
	if (opts?.blocklist) params.blocklist = 'true';
	return apiDelete(`/api/queue/${id}${buildQuery(params)}`);
}

function buildQuery(params: Record<string, string>): string {
	const entries = Object.entries(params);
	return entries.length ? '?' + new URLSearchParams(params).toString() : '';
}
