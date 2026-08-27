import { describe, expect, it } from 'vitest';
import { buildArchiveTaskId, parseArchiveTaskId } from './archiveActivity.js';

describe('archive activity task IDs', () => {
	it('round-trips movie task IDs', () => {
		const taskId = buildArchiveTaskId('movie', 'movie-id', 'job-id');
		expect(parseArchiveTaskId(taskId)).toEqual({
			mediaType: 'movie',
			mediaId: 'movie-id',
			jobId: 'job-id'
		});
	});

	it('round-trips series task IDs', () => {
		const taskId = buildArchiveTaskId('series', 'series-id', 'job-id');
		expect(parseArchiveTaskId(taskId)?.mediaType).toBe('series');
	});

	it('rejects unrelated and malformed task IDs', () => {
		expect(parseArchiveTaskId('media-move:movie:id')).toBeNull();
		expect(parseArchiveTaskId('archive:movie:id')).toBeNull();
		expect(parseArchiveTaskId('archive:unknown:id:job')).toBeNull();
	});
});
