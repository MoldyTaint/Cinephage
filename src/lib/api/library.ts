import { apiGet, apiPost, apiPatch, apiDelete } from './client.js';

export async function detectMedia(sourcePath: string, mediaType?: string) {
	return apiPost('/api/library/import/detect', { sourcePath, mediaType });
}

export async function executeImport(payload: Record<string, unknown>) {
	return apiPost('/api/library/import/execute', payload);
}

export async function getLibraryStatus(params?: {
	tmdbIds?: number[];
	tmdbId?: number;
	mediaType?: string;
}) {
	if (params?.tmdbIds) {
		return apiPost('/api/library/status', { tmdbIds: params.tmdbIds, mediaType: params.mediaType });
	}
	if (params?.tmdbId) {
		return apiGet('/api/library/status', {
			tmdbId: String(params.tmdbId),
			...(params.mediaType ? { mediaType: params.mediaType } : {})
		});
	}
	return apiGet('/api/library/status');
}

export async function batchMovies(
	movieIds: string[],
	updates: { monitored?: boolean; scoringProfileId?: string | null }
) {
	return apiPatch('/api/library/movies/batch', { movieIds, updates });
}

export async function batchDeleteMovieFiles(
	movieIds: string[],
	deleteFiles?: boolean,
	removeFromLibrary?: boolean
) {
	return apiDelete('/api/library/movies/batch', { movieIds, deleteFiles, removeFromLibrary });
}

export async function batchSeries(
	seriesIds: string[],
	updates: { monitored?: boolean; scoringProfileId?: string | null }
) {
	return apiPatch('/api/library/series/batch', { seriesIds, updates });
}

export async function batchDeleteSeriesFiles(
	seriesIds: string[],
	deleteFiles?: boolean,
	removeFromLibrary?: boolean
) {
	return apiDelete('/api/library/series/batch', { seriesIds, deleteFiles, removeFromLibrary });
}

export async function scanLibrary() {
	return apiPost('/api/library/scan');
}

export async function getScanStatus() {
	return apiGet('/api/library/scan/status');
}

export async function getUnmatchedItems() {
	return apiGet('/api/library/unmatched');
}

export async function matchUnmatched(id: string, payload: Record<string, unknown>) {
	return apiPost('/api/library/unmatched/match', { id, ...payload });
}

export async function autoSearchMovie(movieId: string) {
	return apiPost(`/api/library/movies/${movieId}/auto-search`);
}

export async function autoSearchSeries(seriesId: string) {
	return apiPost(`/api/library/series/${seriesId}/auto-search`);
}

export async function refreshMovie(movieId: string) {
	return apiPost(`/api/library/movies/${movieId}/refresh`);
}

export async function refreshSeries(seriesId: string) {
	return apiPost(`/api/library/series/${seriesId}/refresh`);
}
