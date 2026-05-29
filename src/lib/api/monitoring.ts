import type {
	MonitoringSettingsUpdate,
	CaptchaSolverSettingsUpdate,
	CaptchaSolverTestRequest
} from '$lib/validation/schemas.js';

import { apiGet, apiPut, apiDelete, apiPost } from './client.js';

export async function getMonitoringStatus() {
	return apiGet('/api/monitoring/status');
}

export async function getMonitoringSettings() {
	return apiGet('/api/monitoring/settings');
}

export async function updateMonitoringSettings(payload: MonitoringSettingsUpdate) {
	return apiPut('/api/monitoring/settings', payload);
}

export async function getCaptchaSolverSettings() {
	return apiGet('/api/captcha-solver');
}

export async function updateCaptchaSolverSettings(payload: CaptchaSolverSettingsUpdate) {
	return apiPut('/api/captcha-solver', payload);
}

export async function resetCaptchaSolverSettings() {
	return apiDelete('/api/captcha-solver');
}

export async function testCaptchaSolver(payload?: CaptchaSolverTestRequest) {
	return apiPost('/api/captcha-solver/test', payload);
}

export async function getCaptchaSolverHealth() {
	return apiGet('/api/captcha-solver/health');
}

export async function getMissingSearch() {
	return apiGet('/api/monitoring/search/missing');
}

export async function getUpgradeSearch() {
	return apiGet('/api/monitoring/search/upgrade');
}

export async function getNewEpisodesSearch() {
	return apiGet('/api/monitoring/search/new-episodes');
}

export async function getCutoffUnmetSearch() {
	return apiGet('/api/monitoring/search/cutoff-unmet');
}

export async function getPendingReleases() {
	return apiGet('/api/monitoring/search/pending-releases');
}

export async function getMissingSubtitles() {
	return apiGet('/api/monitoring/search/missing-subtitles');
}

export async function getSubtitleUpgrade() {
	return apiGet('/api/monitoring/search/subtitle-upgrade');
}

export async function clearCaptchaSolverCache() {
	return apiDelete('/api/captcha-solver/health');
}
