import type { DownloadQueueRecord, DownloadHistoryRecord } from './types.js';
import type { ActivityEvent } from '$lib/types/activity';

export function buildFailedQueueIndex(
	queueItems: Pick<DownloadQueueRecord, 'id' | 'downloadId' | 'title' | 'addedAt'>[]
): Map<string, string> {
	const index = new Map<string, string>();

	for (const item of queueItems) {
		if (item.downloadId) {
			index.set(`download:${item.downloadId}`, item.id);
		}
		if (item.title && item.addedAt) {
			index.set(`title:${item.title.toLowerCase()}|grabbed:${item.addedAt}`, item.id);
		}
	}

	return index;
}

export function findFailedQueueItemId(
	history: DownloadHistoryRecord,
	failedQueueIndex?: Map<string, string>
): string | undefined {
	if (!failedQueueIndex) return undefined;

	if (history.downloadId) {
		const byDownloadId = failedQueueIndex.get(`download:${history.downloadId}`);
		if (byDownloadId) return byDownloadId;
	}

	if (history.title && history.grabbedAt) {
		return failedQueueIndex.get(
			`title:${history.title.toLowerCase()}|grabbed:${history.grabbedAt}`
		);
	}

	return undefined;
}

export function buildHistoryTimeline(history: DownloadHistoryRecord): ActivityEvent[] {
	const timeline: ActivityEvent[] = [];

	if (history.grabbedAt) {
		timeline.push({ type: 'grabbed', timestamp: history.grabbedAt });
	}
	if (history.completedAt) {
		timeline.push({ type: 'completed', timestamp: history.completedAt });
	}
	if (history.importedAt && history.status === 'imported') {
		timeline.push({ type: 'imported', timestamp: history.importedAt });
	}
	if (history.status === 'failed' && history.createdAt) {
		timeline.push({
			type: 'failed',
			timestamp: history.createdAt,
			details: history.statusReason ?? undefined
		});
	}
	if (history.status === 'rejected' && history.createdAt) {
		timeline.push({
			type: 'rejected',
			timestamp: history.createdAt,
			details: history.statusReason ?? undefined
		});
	}

	timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

	return timeline;
}
