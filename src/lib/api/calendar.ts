import { apiGet } from './client.js';

export async function getCalendar(month?: string, type?: 'all' | 'movies' | 'episodes') {
	const params: Record<string, string> = {};
	if (month) params.month = month;
	if (type) params.type = type;
	return apiGet('/api/calendar', params);
}

export async function getUpcoming() {
	return apiGet('/api/calendar/upcoming');
}
