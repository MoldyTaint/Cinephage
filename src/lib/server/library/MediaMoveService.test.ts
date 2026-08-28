import { describe, it, expect, afterAll, vi } from 'vitest';

import { createTestDb, destroyTestDb, type TestDatabase } from '../../../test/db-helper.js';

const testDb: TestDatabase = createTestDb();

vi.mock('$lib/server/db', () => ({
	get db() {
		return testDb.db;
	},
	get sqlite() {
		return testDb.sqlite;
	},
	initializeDatabase: vi.fn().mockResolvedValue(undefined)
}));

const { mediaMoveService } = await import('./MediaMoveService.js');
const { libraryOperationLock } = await import('./library-operation-lock.js');

afterAll(() => {
	destroyTestDb(testDb);
});

describe('MediaMoveService lock integration', () => {
	it('executeMoveTask holds the operation lock for the duration of the move', async () => {
		const withLockSpy = vi.spyOn(libraryOperationLock, 'withLock');
		const svc = mediaMoveService;

		// Missing root folders → the task fails gracefully inside, but the lock
		// must still have been acquired around the whole execution.
		// @ts-expect-error accessing private method for testing
		await svc.executeMoveTask('missing-task', 'missing-history', {
			mediaType: 'movie',
			mediaId: 'missing-movie',
			mediaTitle: 'Missing Movie',
			relativePath: 'Missing Movie (2020)',
			sourceRootFolderId: 'root-does-not-exist',
			destinationRootFolderId: 'root-also-does-not-exist'
		});

		expect(withLockSpy).toHaveBeenCalledWith('move', expect.any(Function));
		expect(libraryOperationLock.isLocked).toBe(false);
	});
});
