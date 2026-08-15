/**
 * Bulk Import API regression tests.
 *
 * Bug #496: importing a large number of files fails with a 400 "Invalid JSON body"
 * red box. Two compounding root causes:
 *   1. The backend rejected any batch > 500 jobs (zod .max(500)) while the UI sends
 *      one unbounded batch.
 *   2. adapter-node's default 512K BODY_SIZE_LIMIT aborts larger bodies before the
 *      handler runs, surfacing as "Invalid JSON body" (verified over live HTTP;
 *      the limit itself is raised in server.js / Dockerfile).
 *
 * This suite pins the batch-size cap (the part testable at handler level).
 */

import { describe, it, expect, afterAll, beforeEach, vi } from 'vitest';
import { createTestDb, destroyTestDb, type TestDatabase } from '../../../../../test/db-helper';
import { api } from '../../../../../test/api-helper';

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

const mockLogger = vi.hoisted(() => ({
	info: vi.fn(),
	error: vi.fn(),
	warn: vi.fn(),
	debug: vi.fn(),
	child: vi.fn().mockReturnThis()
}));

vi.mock('$lib/logging', () => ({
	logger: mockLogger,
	createChildLogger: vi.fn(() => mockLogger)
}));

// Prevent the in-memory queue from processing test jobs in the background.
const submitMock = vi.hoisted(() => vi.fn(() => 'test-job-id'));
vi.mock('$lib/server/library/ManualImportQueueService.js', () => ({
	manualImportQueueService: {
		submit: submitMock
	}
}));

const { POST } = await import('./+server');

function buildJob(i: number) {
	return {
		request: {
			sourcePath: `/tmp/nonexistent-source-${i}.mkv`,
			mediaType: 'movie' as const,
			tmdbId: 1000 + i,
			importTarget: 'new' as const,
			importMode: 'symlink' as const,
			rootFolderId: '00000000-0000-4000-8000-000000000000'
		},
		groupName: `group_${i}`
	};
}

describe('Bulk Import API', () => {
	beforeEach(() => {
		submitMock.mockClear();
	});

	afterAll(() => {
		destroyTestDb(testDb);
	});

	it('accepts a batch of 500 jobs', async () => {
		const { status, data } = await api.post(POST, {
			jobs: Array.from({ length: 500 }, (_, i) => buildJob(i))
		});

		expect(status).toBe(200);
		expect(data).toEqual(
			expect.objectContaining({
				success: true,
				data: expect.objectContaining({ jobId: 'test-job-id', totalGroups: 500 })
			})
		);
		expect(submitMock).toHaveBeenCalledOnce();
	});

	it('accepts a batch of 501 jobs without a batch-size rejection (bug #496)', async () => {
		const { status, data } = await api.post(POST, {
			jobs: Array.from({ length: 501 }, (_, i) => buildJob(i))
		});

		expect(status).toBe(200);
		expect(JSON.stringify(data)).not.toContain('<=500 items');
		expect(data).not.toEqual(
			expect.objectContaining({
				error: 'Validation failed'
			})
		);
		expect(submitMock).toHaveBeenCalledOnce();
	});

	it('accepts a batch of 2600 jobs without a batch-size rejection (the reported scenario, bug #496)', async () => {
		const { status, data } = await api.post(POST, {
			jobs: Array.from({ length: 2600 }, (_, i) => buildJob(i))
		});

		expect(status).toBe(200);
		expect(JSON.stringify(data)).not.toContain('<=500 items');
		expect(data).not.toEqual(
			expect.objectContaining({
				error: 'Validation failed'
			})
		);
		expect(submitMock).toHaveBeenCalledOnce();
		expect(submitMock).toHaveBeenCalledWith(expect.arrayContaining([expect.anything()]));
	});

	it('rejects batches above the 5000-job hard cap', async () => {
		const { status, data } = await api.post(POST, {
			jobs: Array.from({ length: 5001 }, (_, i) => buildJob(i))
		});

		expect(status).toBe(400);
		expect(data).toEqual(
			expect.objectContaining({
				success: false,
				error: 'Validation failed'
			})
		);
		expect(submitMock).not.toHaveBeenCalled();
	});
});
