import type {
	SmartListCreateRequest,
	SmartListPreviewRequest,
	SmartListExternalPreviewRequest,
	SmartListItemsAction
} from '$lib/validation/schemas.js';

import { apiGet, apiPost, apiPut, apiDelete } from './client.js';

export async function getSmartLists() {
	return apiGet('/api/smartlists');
}

export async function getSmartList(id: string) {
	return apiGet(`/api/smartlists/${id}`);
}

export async function createSmartList(payload: SmartListCreateRequest) {
	return apiPost('/api/smartlists', payload);
}

export async function updateSmartList(id: string, payload: Partial<SmartListCreateRequest>) {
	return apiPut(`/api/smartlists/${id}`, payload);
}

export async function deleteSmartList(id: string) {
	return apiDelete(`/api/smartlists/${id}`);
}

export async function refreshSmartList(id: string) {
	return apiPost(`/api/smartlists/${id}/refresh`);
}

export async function refreshAllSmartLists() {
	return apiPost('/api/smartlists/refresh-all');
}

export async function getSmartListPresets() {
	return apiGet('/api/smartlists/presets');
}

export async function getSmartListPreview(payload: SmartListPreviewRequest) {
	return apiPost('/api/smartlists/preview', payload);
}

export async function getExternalListPreview(payload: SmartListExternalPreviewRequest) {
	return apiPost('/api/smartlists/external/preview', payload);
}

export async function testExternalList(payload: Record<string, unknown>) {
	return apiPost('/api/smartlists/external/test', payload);
}

export async function getSmartListHelpers(params?: Record<string, string>) {
	return apiGet('/api/smartlists/helpers', params);
}

export async function addSmartListItems(listId: string, payload: SmartListItemsAction) {
	return apiPost(`/api/smartlists/${listId}/items`, payload);
}
