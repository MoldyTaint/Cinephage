import { apiGet, apiPut } from './client.js';

export interface HistoryRetentionSettings {
	fileHistoryDays: number;
	libraryHistoryDays: number;
	scanHistoryDays: number;
}

export interface StorageForecast {
	currentEstimatedBytes: number;
	averageDailyBytes: number;
	projectedBytes30d: number;
	projectedBytes90d: number;
}

export async function getHistoryRetention(): Promise<HistoryRetentionSettings> {
	return apiGet<HistoryRetentionSettings>('/api/settings/library/history-retention');
}

export async function saveHistoryRetention(
	input: HistoryRetentionSettings
): Promise<{ success: boolean }> {
	return apiPut<{ success: boolean }>('/api/settings/library/history-retention', input);
}

export async function getStorageForecast(): Promise<StorageForecast> {
	return apiGet<StorageForecast>('/api/settings/library/history-retention/forecast');
}
