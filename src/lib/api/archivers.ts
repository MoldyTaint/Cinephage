import { apiDelete, apiGet, apiPost, apiPut } from './client.js';
import type { ArchiverPublic } from '$lib/server/archivers/types.js';
import type { ArchiveJobStatus } from '$lib/server/archivers/ArchiveJobManager.js';
import type { MediaArchiveStatus } from '$lib/server/archivers/ArchiveStatusService.js';
import type { ArchiverCreate, ArchiverTest, ArchiverUpdate } from '$lib/validation/schemas.js';

export const getArchivers = (enabledOnly = false) =>
	apiGet<{ archivers: ArchiverPublic[] }>(
		'/api/archivers',
		enabledOnly ? { enabled: 'true' } : undefined
	);
export const createArchiver = (input: ArchiverCreate) =>
	apiPost<{ archiver: ArchiverPublic }>('/api/archivers', input);
export const updateArchiver = (id: string, input: ArchiverUpdate) =>
	apiPut<{ archiver: ArchiverPublic }>(`/api/archivers/${id}`, input);
export const deleteArchiver = (id: string) => apiDelete(`/api/archivers/${id}`);
export const testArchiver = (id: string) => apiPost(`/api/archivers/${id}/test`);
export const testArchiverConfig = (input: ArchiverTest) => apiPost('/api/archivers/test', input);
export const archiveMovieFiles = (movieId: string, input: ArchiveRequest) =>
	apiPost<{ jobId: string }>(`/api/library/movies/${movieId}/archive`, input);
export const archiveSeriesFiles = (seriesId: string, input: ArchiveRequest) =>
	apiPost<{ jobId: string }>(`/api/library/series/${seriesId}/archive`, input);
export const getArchiveJob = (id: string) =>
	apiGet<{ job: ArchiveJobStatus }>(`/api/archivers/jobs/${id}`);
export const getMovieArchiveStatus = (movieId: string) =>
	apiGet<{ status: MediaArchiveStatus }>(`/api/library/movies/${movieId}/archive-status`);
export const getSeriesArchiveStatus = (seriesId: string) =>
	apiGet<{ status: MediaArchiveStatus }>(`/api/library/series/${seriesId}/archive-status`);

export interface ArchiveRequest {
	archiverId: string;
	fileIds: string[];
	createFolder: boolean;
}
