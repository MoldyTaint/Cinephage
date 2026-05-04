import { apiGet, apiPost, apiPut, apiDelete } from './client.js';

export async function getUsenetServers() {
	return apiGet('/api/usenet/servers');
}

export async function createUsenetServer(payload: Record<string, unknown>) {
	return apiPost('/api/usenet/servers', payload);
}

export async function updateUsenetServer(id: string, payload: Record<string, unknown>) {
	return apiPut(`/api/usenet/servers/${id}`, payload);
}

export async function deleteUsenetServer(id: string) {
	return apiDelete(`/api/usenet/servers/${id}`);
}

export async function testUsenetServer(idOrPayload: string | Record<string, unknown>) {
	const url =
		typeof idOrPayload === 'string'
			? `/api/usenet/servers/${idOrPayload}/test`
			: '/api/usenet/servers/test';
	return apiPost(url, typeof idOrPayload === 'string' ? undefined : idOrPayload);
}

export async function syncUsenetServers() {
	return apiPost('/api/usenet/servers/sync');
}
