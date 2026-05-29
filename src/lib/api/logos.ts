import { apiGet } from './client.js';

export async function getLogos(params?: Record<string, string>) {
	return apiGet('/api/logos', params);
}
