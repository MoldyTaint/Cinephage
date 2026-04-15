import { extractReleaseGroup } from '$lib/server/indexers/parser/patterns/releaseGroup';
import type { UnifiedActivity } from '$lib/types/activity';
import type { MonitoringHistoryRecord } from './types';

type QueueMediaInfo = Pick<
	UnifiedActivity,
	| 'mediaType'
	| 'mediaId'
	| 'mediaTitle'
	| 'mediaYear'
	| 'seriesId'
	| 'seriesTitle'
	| 'seasonNumber'
	| 'episodeNumber'
>;

interface QueueActivityProjectionInput {
	id: string;
	downloadClientId?: string | null;
	title: string;
	indexerId?: string | null;
	indexerName?: string | null;
	protocol?: string | null;
	episodeIds?: string[] | null;
	status: string;
	progress?: string | number | null;
	size?: number | null;
	quality?: UnifiedActivity['quality'];
	releaseGroup?: string | null;
	addedAt?: string | null;
	startedAt?: string | null;
	completedAt?: string | null;
	importedAt?: string | null;
	errorMessage?: string | null;
	lastAttemptAt?: string | null;
	isUpgrade?: boolean | null;
}

function mapQueueStatus(status: string): UnifiedActivity['status'] {
	switch (status) {
		case 'seeding':
			return 'seeding';
		case 'paused':
			return 'paused';
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

function buildQueueTimeline(
	download: Pick<
		QueueActivityProjectionInput,
		| 'id'
		| 'addedAt'
		| 'startedAt'
		| 'completedAt'
		| 'importedAt'
		| 'lastAttemptAt'
		| 'status'
		| 'errorMessage'
	>,
	linkedMonitoring: Pick<
		MonitoringHistoryRecord,
		'status' | 'executedAt' | 'releaseGrabbed' | 'releasesFound'
	>[] = []
): UnifiedActivity['timeline'] {
	const timeline: UnifiedActivity['timeline'] = [];

	for (const monitoring of linkedMonitoring) {
		if (monitoring.status === 'grabbed' && monitoring.executedAt) {
			timeline.push({
				type: 'grabbed',
				timestamp: monitoring.executedAt,
				details: monitoring.releaseGrabbed || undefined
			});
		}
		if (monitoring.releasesFound && monitoring.releasesFound > 0 && monitoring.executedAt) {
			timeline.push({
				type: 'found',
				timestamp: monitoring.executedAt,
				details: `${monitoring.releasesFound} releases found`
			});
		}
	}

	if (download.addedAt) {
		timeline.push({ type: 'grabbed', timestamp: download.addedAt });
	}
	if (download.startedAt) {
		timeline.push({ type: 'downloading', timestamp: download.startedAt });
	}
	if (download.completedAt) {
		timeline.push({ type: 'completed', timestamp: download.completedAt });
	}
	if (
		(download.status === 'imported' || download.status === 'seeding-imported') &&
		download.importedAt
	) {
		timeline.push({ type: 'imported', timestamp: download.importedAt });
	}
	if (download.status === 'failed' && download.lastAttemptAt) {
		timeline.push({
			type: 'failed',
			timestamp: download.lastAttemptAt,
			details: download.errorMessage ?? undefined
		});
	}

	timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
	return timeline;
}

export function projectQueueActivity(
	download: QueueActivityProjectionInput,
	mediaInfo: QueueMediaInfo,
	linkedMonitoring: Pick<
		MonitoringHistoryRecord,
		'status' | 'executedAt' | 'releaseGrabbed' | 'releasesFound'
	>[] = []
): UnifiedActivity {
	const timeline = buildQueueTimeline(download, linkedMonitoring);
	const status = mapQueueStatus(download.status);
	const startedAt = download.startedAt ?? download.addedAt ?? new Date().toISOString();

	return {
		id: `queue-${download.id}`,
		activitySource: 'queue' as const,
		mediaType: mediaInfo.mediaType,
		mediaId: mediaInfo.mediaId,
		mediaTitle: mediaInfo.mediaTitle,
		mediaYear: mediaInfo.mediaYear,
		seriesId: mediaInfo.seriesId,
		seriesTitle: mediaInfo.seriesTitle,
		seasonNumber: mediaInfo.seasonNumber,
		episodeNumber: mediaInfo.episodeNumber,
		episodeIds: download.episodeIds ?? undefined,
		releaseTitle: download.title,
		quality: download.quality ?? null,
		releaseGroup: download.releaseGroup ?? extractReleaseGroup(download.title)?.group ?? null,
		size: download.size ?? null,
		indexerId: download.indexerId ?? null,
		indexerName: download.indexerName ?? null,
		protocol: (download.protocol as 'torrent' | 'usenet' | 'streaming') ?? null,
		downloadClientId: download.downloadClientId ?? null,
		status,
		statusReason: download.errorMessage ?? undefined,
		downloadProgress: Math.round((Number(download.progress) || 0) * 100),
		isUpgrade: download.isUpgrade ?? false,
		timeline,
		startedAt,
		completedAt: download.importedAt ?? download.completedAt ?? null,
		lastAttemptAt: download.lastAttemptAt ?? null,
		queueItemId: download.id
	};
}

export { mapQueueStatus };
