import type { DownloadQueueRecord, DownloadHistoryRecord } from './types.js';

export function normalizeReleaseKey(value: string | null | undefined): string {
	if (!value) return '';
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '')
		.trim();
}

export function toEpisodeIdList(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
	}

	if (typeof value === 'string') {
		try {
			const parsed = JSON.parse(value) as unknown;
			if (Array.isArray(parsed)) {
				return parsed.filter(
					(entry): entry is string => typeof entry === 'string' && entry.length > 0
				);
			}
		} catch {
			// Ignore malformed JSON episode arrays and fall through.
		}
	}

	return [];
}

export function hasEpisodeOverlap(left: unknown, right: unknown): boolean {
	const leftIds = toEpisodeIdList(left);
	const rightIds = toEpisodeIdList(right);
	if (leftIds.length === 0 || rightIds.length === 0) return false;
	const rightSet = new Set(rightIds);
	return leftIds.some((episodeId) => rightSet.has(episodeId));
}

export function isSameMediaTarget(
	history: Pick<DownloadHistoryRecord, 'movieId' | 'seriesId' | 'episodeIds' | 'seasonNumber'>,
	queueItem: Pick<DownloadQueueRecord, 'movieId' | 'seriesId' | 'episodeIds' | 'seasonNumber'>
): boolean {
	if (history.movieId && queueItem.movieId) {
		return history.movieId === queueItem.movieId;
	}

	if (history.seriesId && queueItem.seriesId && history.seriesId === queueItem.seriesId) {
		if (hasEpisodeOverlap(history.episodeIds, queueItem.episodeIds)) {
			return true;
		}

		if (history.seasonNumber && queueItem.seasonNumber) {
			return history.seasonNumber === queueItem.seasonNumber;
		}

		const historyEpisodeIds = toEpisodeIdList(history.episodeIds);
		const queueEpisodeIds = toEpisodeIdList(queueItem.episodeIds);
		if (historyEpisodeIds.length === 0 && queueEpisodeIds.length === 0) {
			return true;
		}
	}

	return false;
}
