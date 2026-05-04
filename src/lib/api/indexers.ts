import { apiGet, apiPost, apiPut, apiDelete } from './client.js';

export async function getIndexers() {
	return apiGet('/api/indexers');
}

export async function getIndexer(id: string) {
	return apiGet(`/api/indexers/${id}`);
}

export async function createIndexer(payload: Record<string, unknown>) {
	return apiPost('/api/indexers', payload);
}

export async function updateIndexer(id: string, payload: Record<string, unknown>) {
	return apiPut(`/api/indexers/${id}`, payload);
}

export async function deleteIndexer(id: string) {
	return apiDelete(`/api/indexers/${id}`);
}

export async function testIndexer(payload: Record<string, unknown>) {
	return apiPost('/api/indexers/test', payload);
}

export async function getIndexerDefinitions() {
	return apiGet('/api/indexers/definitions');
}

export async function searchReleases(params: Record<string, string>) {
	return apiGet('/api/search', params);
}

export async function getCustomFormats() {
	return apiGet('/api/custom-formats');
}

export async function createCustomFormat(payload: Record<string, unknown>) {
	return apiPost('/api/custom-formats', payload);
}

export async function updateCustomFormat(id: string, payload: Record<string, unknown>) {
	return apiPut(`/api/custom-formats/${id}`, payload);
}

export async function deleteCustomFormat(id: string) {
	return apiDelete(`/api/custom-formats/${id}`);
}

export async function testCustomFormat(payload: Record<string, unknown>) {
	return apiPost('/api/custom-formats/test', payload);
}
