import { apiGet } from './client.js';

export async function getDiscover(params: Record<string, string>) {
	return apiGet('/api/discover', params);
}

export async function searchTmdb(params: Record<string, string>) {
	return apiGet('/api/discover/search', params);
}

export async function getTmdb(path: string, params?: Record<string, string>) {
	return apiGet(`/api/tmdb/${path}`, params);
}

export async function getPersonCredits(personId: number, params?: Record<string, string>) {
	return apiGet(`/api/tmdb/person/${personId}/credits`, params);
}
