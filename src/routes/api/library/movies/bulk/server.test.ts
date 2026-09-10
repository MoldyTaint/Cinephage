import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createTestDb,
	destroyTestDb,
	clearTestDb,
	type TestDatabase
} from '../../../../../test/db-helper';
import { api } from '../../../../../test/api-helper';
import { movies, rootFolders } from '$lib/server/db/schema.js';

const testDb: TestDatabase = createTestDb();

vi.mock('$lib/server/db/index.js', () => ({
	get db() {
		return testDb.db;
	},
	get sqlite() {
		return testDb.sqlite;
	},
	initializeDatabase: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/logging', () => ({
	logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), child: vi.fn() },
	createChildLogger: vi.fn(() => ({
		info: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		debug: vi.fn(),
		child: vi.fn()
	}))
}));

const { POST } = await import('./+server');

describe('Bulk movie additions', () => {
	beforeEach(() => clearTestDb(testDb));

	afterAll(() => destroyTestDb(testDb));

	it('rejects a read-only destination before inserting movies', async () => {
		const rootFolderId = 'read-only-movie-root';
		await testDb.db.insert(rootFolders).values({
			id: rootFolderId,
			name: 'Remote movies',
			path: '/tmp/read-only-movies',
			mediaType: 'movie',
			readOnly: true
		});

		const { status, data } = await api.post(POST, {
			tmdbIds: [9001],
			rootFolderId
		});

		expect(status).toBe(500);
		expect(data).toEqual(
			expect.objectContaining({ success: false, error: 'Root folder is read-only' })
		);
		expect(testDb.db.select().from(movies).all()).toHaveLength(0);
	});
});
