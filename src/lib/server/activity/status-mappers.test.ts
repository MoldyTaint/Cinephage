import { describe, expect, it } from 'vitest';
import { mapMoveStatusesForScopeAndFilter, mapMoveTaskStatus } from './status-mappers.js';

describe('activity task status mapping', () => {
	it('includes completed task activities in imported history filters', () => {
		expect(mapMoveStatusesForScopeAndFilter('history', 'imported')).toEqual(['completed']);
	});

	it('maps completed task history to the successful activity status', () => {
		expect(mapMoveTaskStatus('completed')).toBe('imported');
	});

	it('does not expose running tasks in history', () => {
		expect(mapMoveStatusesForScopeAndFilter('history', 'downloading')).toEqual([]);
	});
});
