import type { LibraryScanRequest, MovieUpdate, UnmatchedMatch, AddMovieRequest, AddSeriesRequest, BulkAddMoviesRequest, UnmatchedSingleMatch } from '$lib/validation/schemas.js';

import { apiGet, apiPost, apiPatch, apiPut, apiDelete } from './client.js';

export async function detectMedia(sourcePath: string, mediaType?: string, requireFile?: boolean) {
	return apiPost('/api/library/import/detect', {
		sourcePath,
		mediaType,
		...(requireFile ? { requireFile } : {})
	});
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

export async function scanLibrary(payload?: LibraryScanRequest) {
	return apiPost('/api/library/scan', payload);
}

export async function getScanStatus() {
	return apiGet('/api/library/scan/status');
}

export async function getUnmatchedItems() {
	return apiGet('/api/library/unmatched');
}

export async function matchUnmatched(id: string, payload: UnmatchedSingleMatch) {
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

export async function getMovie(movieId: string) {
	return apiGet(`/api/library/movies/${movieId}`);
}

export async function updateMovie(movieId: string, data: MovieUpdate) {
	return apiPut(`/api/library/movies/${movieId}`, data);
}

export async function deleteMovie(
	movieId: string,
	deleteFiles?: boolean,
	removeFromLibrary?: boolean
) {
	const params = new URLSearchParams();
	if (deleteFiles) params.set('deleteFiles', 'true');
	if (removeFromLibrary) params.set('removeFromLibrary', 'true');
	const query = params.toString();
	return apiDelete(`/api/library/movies/${movieId}${query ? '?' + query : ''}`);
}

export async function deleteMovieFile(movieId: string, fileId: string) {
	return apiDelete(`/api/library/movies/${movieId}/files/${fileId}`);
}

export async function getMovieScore(movieId: string) {
	return apiGet(`/api/library/movies/${movieId}/score`);
}

export async function getSeries(seriesId: string) {
	return apiGet(`/api/library/series/${seriesId}`);
}

export async function updateSeries(seriesId: string, data: Record<string, unknown>) {
	return apiPut(`/api/library/series/${seriesId}`, data);
}

export async function deleteSeries(
	seriesId: string,
	deleteFiles?: boolean,
	removeFromLibrary?: boolean
) {
	const params = new URLSearchParams();
	if (deleteFiles) params.set('deleteFiles', 'true');
	if (removeFromLibrary) params.set('removeFromLibrary', 'true');
	const query = params.toString();
	return apiDelete(`/api/library/series/${seriesId}${query ? '?' + query : ''}`);
}

export async function refreshSeries(seriesId: string) {
	return apiPost(`/api/library/series/${seriesId}/refresh`);
}

export async function createMovie(payload: AddMovieRequest) {
	return apiPost('/api/library/movies', payload);
}

export async function createSeries(payload: AddSeriesRequest) {
	return apiPost('/api/library/series', payload);
}

export async function bulkAddMovies(payload: BulkAddMoviesRequest) {
	return apiPost('/api/library/movies/bulk', payload);
}

export async function getUnmatchedIssues() {
	return apiGet('/api/library/unmatched/issues');
}

export async function batchUnmatchedMatch(payload: UnmatchedMatch) {
	return apiPost('/api/library/unmatched/match', payload);
}
