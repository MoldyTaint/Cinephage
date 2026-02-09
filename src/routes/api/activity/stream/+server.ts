import type { RequestHandler } from './$types';
import { createSSEStream } from '$lib/server/sse';
import { downloadMonitor } from '$lib/server/downloadClients/monitoring';
import { mediaResolver } from '$lib/server/activity';
import { extractReleaseGroup } from '$lib/server/indexers/parser/patterns/releaseGroup';
import type { UnifiedActivity, ActivityStatus } from '$lib/types/activity';

interface QueueItem {
	id: string;
	downloadClientId?: string | null;
	title: string;
	movieId?: string | null;
	seriesId?: string | null;
	episodeIds?: string[] | null;
	seasonNumber?: number | null;
	status: string;
	progress?: number;
	size?: number | null;
	indexerId?: string | null;
	indexerName?: string | null;
	protocol?: string | null;
	quality?: { resolution?: string; source?: string; codec?: string; hdr?: string } | null;
	releaseGroup?: string | null;
	addedAt: string;
	startedAt?: string | null;
	completedAt?: string | null;
	errorMessage?: string | null;
	isUpgrade?: boolean;
}

function isQueueItem(value: unknown): value is QueueItem {
	if (!value || typeof value !== 'object') return false;
	const maybe = value as Partial<QueueItem>;
	return typeof maybe.id === 'string' && typeof maybe.title === 'string';
}

function getQueueItemFromPayload(payload: unknown): QueueItem | null {
	if (isQueueItem(payload)) return payload;

	if (payload && typeof payload === 'object' && 'queueItem' in payload) {
		const wrapped = (payload as { queueItem?: unknown }).queueItem;
		if (isQueueItem(wrapped)) return wrapped;
	}

	return null;
}

function getQueueErrorFromPayload(payload: unknown): string | undefined {
	if (!payload || typeof payload !== 'object') return undefined;
	const maybeError = (payload as { error?: unknown }).error;
	return typeof maybeError === 'string' ? maybeError : undefined;
}

function mapQueueStatusToActivityStatus(status: string): ActivityStatus {
	switch (status) {
		case 'failed':
			return 'failed';
		case 'imported':
		case 'seeding-imported':
			return 'imported';
		case 'removed':
			return 'removed';
		default:
			return 'downloading';
	}
}

/**
 * Server-Sent Events endpoint for real-time activity updates
 *
 * Events emitted:
 * - activity:new - New activity started (download grabbed)
 * - activity:updated - Activity status/progress changed
 * - activity:completed - Activity completed (imported/failed)
 */
export const GET: RequestHandler = async () => {
	return createSSEStream((send) => {
		// Helper to convert queue item to activity using shared resolver
		const queueItemToActivity = async (item: QueueItem): Promise<UnifiedActivity> => {
			const mediaInfo = await mediaResolver.resolveDownloadMediaInfo({
				movieId: item.movieId,
				seriesId: item.seriesId,
				episodeIds: item.episodeIds,
				seasonNumber: item.seasonNumber
			});

			const releaseGroup = extractReleaseGroup(item.title);
			const startedAt = item.startedAt ?? item.addedAt;
			const timeline: UnifiedActivity['timeline'] = [{ type: 'grabbed', timestamp: item.addedAt }];
			if (item.startedAt) {
				timeline.push({ type: 'downloading', timestamp: item.startedAt });
			}
			if (item.completedAt) {
				timeline.push({ type: 'completed', timestamp: item.completedAt });
			}
			timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

			return {
				id: `queue-${item.id}`,
				mediaType: mediaInfo.mediaType,
				mediaId: mediaInfo.mediaId,
				mediaTitle: mediaInfo.mediaTitle,
				mediaYear: mediaInfo.mediaYear,
				seriesId: mediaInfo.seriesId,
				seriesTitle: mediaInfo.seriesTitle,
				seasonNumber: mediaInfo.seasonNumber,
				episodeNumber: mediaInfo.episodeNumber,
				episodeIds: item.episodeIds ?? undefined,
				releaseTitle: item.title,
				quality: item.quality ?? null,
				releaseGroup: item.releaseGroup ?? releaseGroup?.group ?? null,
				size: item.size ?? null,
				indexerId: item.indexerId ?? null,
				indexerName: item.indexerName ?? null,
				protocol: (item.protocol as 'torrent' | 'usenet' | 'streaming') ?? null,
				downloadClientId: item.downloadClientId ?? null,
				status: mapQueueStatusToActivityStatus(item.status),
				statusReason: item.errorMessage ?? undefined,
				downloadProgress: Math.round((item.progress ?? 0) * 100),
				isUpgrade: item.isUpgrade ?? false,
				timeline,
				startedAt,
				completedAt: item.completedAt ?? null,
				queueItemId: item.id
			};
		};

		// Event handlers
		const onQueueAdded = async (item: unknown) => {
			try {
				const queueItem = getQueueItemFromPayload(item);
				if (!queueItem) return;
				const activity = await queueItemToActivity(queueItem);
				send('activity:new', activity);
			} catch {
				// Error converting item
			}
		};

		const onQueueUpdated = async (item: unknown) => {
			try {
				const queueItem = getQueueItemFromPayload(item);
				if (!queueItem) return;
				const activity = await queueItemToActivity(queueItem);
				send('activity:updated', activity);
				// For progress updates, send minimal data
				send('activity:progress', {
					id: `queue-${queueItem.id}`,
					progress: Math.round((queueItem.progress ?? 0) * 100),
					status: activity.status
				});
			} catch {
				// Error
			}
		};

		const onQueueCompleted = async (item: unknown) => {
			try {
				const queueItem = getQueueItemFromPayload(item);
				if (!queueItem) return;
				const activity = await queueItemToActivity(queueItem);
				send('activity:updated', activity);
			} catch {
				// Error
			}
		};

		const onQueueImported = async (data: unknown) => {
			try {
				const queueItem = getQueueItemFromPayload(data);
				if (!queueItem) return;
				const activity = await queueItemToActivity(queueItem);
				send('activity:updated', activity);
			} catch {
				// Error
			}
		};

		const onQueueFailed = async (data: unknown) => {
			try {
				const queueItem = getQueueItemFromPayload(data);
				if (!queueItem) return;
				const activity = await queueItemToActivity(queueItem);
				send('activity:updated', {
					...activity,
					status: 'failed',
					statusReason: getQueueErrorFromPayload(data) ?? activity.statusReason
				});
			} catch {
				// Error
			}
		};

		// Seed active in-progress downloads so activity rows are visible even if queue:added happened before subscribe.
		const sendInitialQueueItems = async () => {
			try {
				const queueItems = await downloadMonitor.getQueue();
				for (const queueItem of queueItems) {
					const activity = await queueItemToActivity(queueItem as QueueItem);
					if (activity.status !== 'downloading') continue;
					send('activity:new', activity);
				}
			} catch {
				// Error loading initial queue state
			}
		};

		void sendInitialQueueItems();

		// Register handlers
		downloadMonitor.on('queue:added', onQueueAdded);
		downloadMonitor.on('queue:updated', onQueueUpdated);
		downloadMonitor.on('queue:completed', onQueueCompleted);
		downloadMonitor.on('queue:imported', onQueueImported);
		downloadMonitor.on('queue:failed', onQueueFailed);

		// Return cleanup function
		return () => {
			downloadMonitor.off('queue:added', onQueueAdded);
			downloadMonitor.off('queue:updated', onQueueUpdated);
			downloadMonitor.off('queue:completed', onQueueCompleted);
			downloadMonitor.off('queue:imported', onQueueImported);
			downloadMonitor.off('queue:failed', onQueueFailed);
		};
	});
};
