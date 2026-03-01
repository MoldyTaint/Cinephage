import { describe, expect, it } from 'vitest';
import type { ActivityFilters, UnifiedActivity } from '$lib/types/activity';
import { ActivityService } from './ActivityService';
import type { DownloadHistoryRecord } from './types';

function createActivity(id: string, overrides: Partial<UnifiedActivity> = {}): UnifiedActivity {
	return {
		id,
		mediaType: 'movie',
		mediaId: 'movie-1',
		mediaTitle: 'Example Movie',
		mediaYear: 2025,
		releaseTitle: 'Example.Movie.2025.1080p.WEB-DL-GRP',
		quality: { resolution: '1080p', source: 'webdl', codec: 'h264' },
		releaseGroup: 'GRP',
		size: 1_000_000_000,
		indexerId: 'indexer-1',
		indexerName: 'Indexer One',
		protocol: 'usenet',
		status: 'imported',
		isUpgrade: false,
		timeline: [],
		startedAt: '2026-02-09T00:00:00.000Z',
		completedAt: null,
		...overrides
	};
}

function createHistoryRecord(
	id: string,
	overrides: Partial<DownloadHistoryRecord> = {}
): DownloadHistoryRecord {
	return {
		id,
		downloadClientId: null,
		downloadClientName: null,
		downloadId: null,
		title: 'Example.Movie.2025.1080p.WEB-DL-GRP',
		indexerId: null,
		indexerName: null,
		protocol: 'usenet',
		movieId: null,
		seriesId: null,
		episodeIds: null,
		seasonNumber: null,
		status: 'imported',
		statusReason: null,
		size: null,
		downloadTimeSeconds: null,
		finalRatio: null,
		quality: null,
		releaseGroup: null,
		importedPath: null,
		movieFileId: null,
		episodeFileIds: null,
		grabbedAt: '2026-02-09T00:00:00.000Z',
		completedAt: null,
		importedAt: null,
		createdAt: '2026-02-09T00:00:00.000Z',
		...overrides
	};
}

describe('ActivityService download client filtering', () => {
	it('filters activities by downloadClientId across queue/history entries', () => {
		const service = ActivityService.getInstance() as unknown as {
			applyFilters: (activities: UnifiedActivity[], filters: ActivityFilters) => UnifiedActivity[];
		};

		const activities: UnifiedActivity[] = [
			createActivity('queue-a', {
				status: 'downloading',
				downloadClientId: 'client-a'
			}),
			createActivity('history-a', {
				downloadClientId: 'client-a',
				downloadClientName: 'Client A'
			}),
			createActivity('queue-b', {
				status: 'failed',
				downloadClientId: 'client-b'
			}),
			createActivity('monitoring-no-client', {
				status: 'no_results',
				downloadClientId: null
			})
		];

		const filtered = service.applyFilters(activities, {
			status: 'all',
			mediaType: 'all',
			protocol: 'all',
			downloadClientId: 'client-a'
		});

		expect(filtered.map((activity) => activity.id)).toEqual(['queue-a', 'history-a']);
	});
});

describe('ActivityService sorting priority', () => {
	it('always keeps active downloads at the top of the list', () => {
		const service = ActivityService.getInstance() as unknown as {
			sortActivities: (
				activities: UnifiedActivity[],
				sort: { field: 'time' | 'media' | 'size' | 'status'; direction: 'asc' | 'desc' }
			) => void;
		};

		const activities: UnifiedActivity[] = [
			createActivity('imported-newer', {
				status: 'imported',
				startedAt: '2026-02-10T00:00:00.000Z'
			}),
			createActivity('downloading-older', {
				status: 'downloading',
				startedAt: '2026-02-08T00:00:00.000Z'
			}),
			createActivity('failed-middle', {
				status: 'failed',
				startedAt: '2026-02-09T00:00:00.000Z'
			})
		];

		service.sortActivities(activities, { field: 'time', direction: 'desc' });

		expect(activities.map((activity) => activity.id)).toEqual([
			'downloading-older',
			'imported-newer',
			'failed-middle'
		]);
	});
});

describe('ActivityService fallback media resolution', () => {
	it('uses parsed release title when a deleted movie no longer resolves by id', () => {
		const service = ActivityService.getInstance();
		const history = createHistoryRecord('history-movie-fallback', {
			title: 'Anaconda.2025.1080p.WEB-DL.x265-GRP',
			movieId: 'deleted-movie-id'
		});

		const activity = service.transformHistoryItem(
			history,
			{ movies: new Map(), series: new Map(), episodes: new Map() },
			[]
		);

		expect(activity).not.toBeNull();
		expect(activity?.mediaType).toBe('movie');
		expect(activity?.mediaTitle).toBe('Anaconda');
		expect(activity?.mediaId).toBe('');
	});

	it('uses parsed series title for missing series links instead of Unknown', () => {
		const service = ActivityService.getInstance();
		const history = createHistoryRecord('history-series-fallback', {
			title: 'Running.Man.S01E211.1080p.WEB-DL-GRP',
			seriesId: 'deleted-series-id',
			episodeIds: ['deleted-episode-id'],
			seasonNumber: 1
		});

		const activity = service.transformHistoryItem(
			history,
			{ movies: new Map(), series: new Map(), episodes: new Map() },
			[]
		);

		expect(activity).not.toBeNull();
		expect(activity?.mediaType).toBe('episode');
		expect(activity?.mediaTitle).toBe('Running Man S01E211');
		expect(activity?.mediaId).toBe('');
	});
});

describe('ActivityService failed activity retry linking', () => {
	it('attaches queueItemId to failed history activity when a matching failed queue item exists', () => {
		const service = ActivityService.getInstance();
		const history = createHistoryRecord('history-failed-retry-link', {
			status: 'failed',
			downloadId: 'download-123',
			statusReason: 'No video files found in download'
		});

		const activity = service.transformHistoryItem(
			history,
			{ movies: new Map(), series: new Map(), episodes: new Map() },
			[],
			new Map([['download:download-123', 'queue-abc']])
		);

		expect(activity).not.toBeNull();
		expect(activity?.queueItemId).toBe('queue-abc');
	});
});
