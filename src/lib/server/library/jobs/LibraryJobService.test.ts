import { describe, it, expect, afterAll, vi, beforeAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, destroyTestDb, type TestDatabase } from '../../../../test/db-helper.js';
import { libraryJobs, rootFolders } from '$lib/server/db/schema.js';

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

const { libraryJobService } = await import('./LibraryJobService.js');

const rootIds = {
	'root-1': true,
	'root-2': true,
	'root-c1': true,
	'root-c2': true,
	'root-r1': true,
	'root-l1': true,
	'root-l2': true,
	'root-la1': true,
	'root-la2': true,
	'root-m1': true,
	'root-rt1': true,
	'root-rt2': true,
	'root-mf1': true,
	'root-mr1': true
};

beforeAll(() => {
	for (const id of Object.keys(rootIds)) {
		testDb.db
			.insert(rootFolders)
			.values({
				id,
				name: `Test Root ${id}`,
				path: `/test/${id}`,
				mediaType: 'movie'
			})
			.run();
	}
});

beforeEach(() => {
	testDb.db.delete(libraryJobs).run();
});

afterAll(() => {
	destroyTestDb(testDb);
});

describe('LibraryJobService', () => {
	describe('enqueueRootFolderScan', () => {
		it('creates queued job with correct dedupe key', async () => {
			const job = libraryJobService.enqueueRootFolderScan('root-1');
			expect(job.type).toBe('scan_root_folder');
			expect(job.status).toBe('queued');
			expect(job.dedupeKey).toBe('scan_root_folder:root-1');
			expect(job.rootFolderId).toBe('root-1');
		});
	});

	describe('enqueueJob deduplication', () => {
		it('returns existing active job when dedupe key matches', async () => {
			const first = libraryJobService.enqueueRootFolderScan('root-2');
			const second = libraryJobService.enqueueRootFolderScan('root-2');
			expect(second.id).toBe(first.id);
			expect(second.status).toBe('queued');
		});
	});

	describe('cancelJob', () => {
		it('sets status to cancelled for a queued job', async () => {
			const job = libraryJobService.enqueueRootFolderScan('root-c1');
			const cancelled = libraryJobService.cancelJob(job.id);
			expect(cancelled.status).toBe('cancelled');
		});

		it('sets cancelRequested=true but stays running for a running job', async () => {
			const job = libraryJobService.enqueueRootFolderScan('root-c2');
			libraryJobService.markRunning(job.id);

			const result = libraryJobService.cancelJob(job.id);
			expect(result.status).toBe('running');
			expect(result.cancelRequested).toBe(true);
		});
	});

	describe('recoverInterruptedJobs', () => {
		it('marks running jobs as failed with interrupt message', async () => {
			const job = libraryJobService.enqueueRootFolderScan('root-r1');
			libraryJobService.markRunning(job.id);

			const count = libraryJobService.recoverInterruptedJobs();
			expect(count).toBe(1);

			const recovered = libraryJobService.getJob(job.id);
			expect(recovered?.status).toBe('failed');
			expect(recovered?.errorMessage).toContain('interrupted');
		});
	});

	describe('listRecentJobs', () => {
		it('returns jobs ordered by createdAt desc', async () => {
			const j1 = libraryJobService.enqueueRootFolderScan('root-l1');
			const j2 = libraryJobService.enqueueRootFolderScan('root-l2');

			const recent = libraryJobService.listRecentJobs(10);
			expect(recent.length).toBeGreaterThanOrEqual(2);

			const ids = recent.map((j) => j.id);
			expect(ids).toContain(j1.id);
			expect(ids).toContain(j2.id);

			for (let i = 1; i < recent.length; i++) {
				expect(recent[i - 1].createdAt! >= recent[i].createdAt!).toBe(true);
			}
		});
	});

	describe('listActiveJobs', () => {
		it('returns only queued and running jobs', async () => {
			const active = libraryJobService.enqueueRootFolderScan('root-la1');
			const cancelled = libraryJobService.enqueueRootFolderScan('root-la2');
			libraryJobService.cancelJob(cancelled.id);

			const list = libraryJobService.listActiveJobs();
			expect(list.some((j) => j.id === active.id)).toBe(true);
			expect(list.some((j) => j.id === cancelled.id)).toBe(false);
		});
	});

	describe('markCompleted', () => {
		it('sets status, phase, fields and completedAt', async () => {
			const job = libraryJobService.enqueueRootFolderScan('root-m1');
			libraryJobService.markRunning(job.id);

			const completed = libraryJobService.markCompleted(job.id, {
				phase: 'done',
				filesFound: 42,
				filesProcessed: 42,
				filesAdded: 5
			});

			expect(completed.status).toBe('completed');
			expect(completed.phase).toBe('done');
			expect(completed.filesFound).toBe(42);
			expect(completed.filesProcessed).toBe(42);
			expect(completed.filesAdded).toBe(5);
			expect(completed.completedAt).toBeTruthy();
		});
	});

	describe('retryJob', () => {
		it('creates a new queued job for a failed job', async () => {
			const job = libraryJobService.enqueueRootFolderScan('root-rt1');
			testDb.db
				.update(libraryJobs)
				.set({ status: 'failed', errorMessage: 'test error' })
				.where(eq(libraryJobs.id, job.id))
				.run();

			const retried = libraryJobService.retryJob(job.id);
			expect(retried.id).not.toBe(job.id);
			expect(retried.status).toBe('queued');
			expect(retried.dedupeKey).toBe(job.dedupeKey);
		});

		it('throws for non-failed and non-cancelled jobs', async () => {
			const job = libraryJobService.enqueueRootFolderScan('root-rt2');

			expect(() => libraryJobService.retryJob(job.id)).toThrow();
		});
	});

	describe('markFailed', () => {
		it('sets status to failed with error message', async () => {
			const job = libraryJobService.enqueueRootFolderScan('root-mf1');
			libraryJobService.markRunning(job.id);

			const failed = libraryJobService.markFailed(job.id, 'something went wrong');
			expect(failed.status).toBe('failed');
			expect(failed.errorMessage).toBe('something went wrong');
		});
	});

	describe('markRunning', () => {
		it('sets status to running and sets startedAt', async () => {
			const job = libraryJobService.enqueueRootFolderScan('root-mr1');
			const running = libraryJobService.markRunning(job.id);
			expect(running.status).toBe('running');
			expect(running.startedAt).toBeTruthy();
		});
	});

	describe('getJob', () => {
		it('returns undefined for nonexistent id', async () => {
			const result = libraryJobService.getJob('nonexistent');
			expect(result).toBeUndefined();
		});
	});

	describe('enqueueFullScan', () => {
		it('creates queued job with correct dedupe key', async () => {
			const job = libraryJobService.enqueueFullScan();
			expect(job.type).toBe('scan_all_root_folders');
			expect(job.status).toBe('queued');
			expect(job.dedupeKey).toBe('scan_all_root_folders');
		});
	});
});

describe('stale queued-job aging (issue #513)', () => {
	it('resets a stuck queued job older than 1h instead of blocking its dedupeKey forever', async () => {
		const old = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
		testDb.db
			.insert(libraryJobs)
			.values({
				type: 'scan_all_root_folders',
				status: 'queued',
				dedupeKey: 'scan_all_root_folders',
				createdAt: old,
				updatedAt: old
			})
			.run();

		const job = libraryJobService.enqueueFullScan();

		expect(job.status).toBe('queued');
		const stale = testDb.db
			.select()
			.from(libraryJobs)
			.where(eq(libraryJobs.dedupeKey, 'scan_all_root_folders'))
			.all();
		const failed = stale.filter((j) => j.status === 'failed');
		expect(failed).toHaveLength(1);
		expect(failed[0].errorMessage).toContain('timed out');
	});

	it('does not age a fresh queued job', async () => {
		const fresh = libraryJobService.enqueueFullScan();
		const again = libraryJobService.enqueueFullScan();
		expect(again.id).toBe(fresh.id);
	});
});
