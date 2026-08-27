export type ArchiveMediaType = 'movie' | 'series';

export interface ParsedArchiveTaskId {
	mediaType: ArchiveMediaType;
	mediaId: string;
	jobId: string;
}

export function buildArchiveTaskId(
	mediaType: ArchiveMediaType,
	mediaId: string,
	jobId: string
): string {
	return `archive:${mediaType}:${mediaId}:${jobId}`;
}

export function parseArchiveTaskId(taskId: string): ParsedArchiveTaskId | null {
	const parts = taskId.split(':');
	if (parts.length !== 4 || parts[0] !== 'archive') return null;
	const mediaType = parts[1];
	const mediaId = parts[2];
	const jobId = parts[3];
	if ((mediaType !== 'movie' && mediaType !== 'series') || !mediaId || !jobId) return null;
	return { mediaType, mediaId, jobId };
}
