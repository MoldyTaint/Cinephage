import { describe, it, expect, afterAll, beforeAll, vi, beforeEach } from 'vitest';
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

const { LibraryJobWorker } = await import('./LibraryJobWorker.js');
const { libraryJobService } = await import('./LibraryJobService.js');

beforeAll(() => {
	testDb.db
		.insert(rootFolders)
		.values({
			id: 'root-1',
			name: 'Test Root',
			path: '/test/root-1',
			mediaType: 'movie'
		})
		.run();
});

beforeEach(() => {
	testDb.db.delete(libraryJobs).run();
});

afterAll(() => {
	destroyTestDb(testDb);
});

describe('LibraryJobWorker', () => {
	describe('processOne - root folder scan', () => {
		it('marks queued root scan job completed after scan succeeds', async () => {
			const scanFn = vi.fn().mockResolvedValue({
				success: true,
				filesScanned: 42,
				filesAdded: 5,
				filesUpdated: 3,
				filesRemoved: 2,
				unmatchedFiles: 10
			});

			const worker = new LibraryJobWorker({ scanRootFolder: scanFn });
			const job = libraryJobService.enqueueRootFolderScan('root-1');

			const processed = await worker.processOne();
			expect(processed).toBe(true);
			expect(scanFn).toHaveBeenCalledWith('root-1');

			const updated = libraryJobService.getJob(job.id);
			expect(updated).toBeDefined();
			expect(updated!.status).toBe('completed');
			expect(updated!.filesFound).toBe(42);
			expect(updated!.filesAdded).toBe(5);
			expect(updated!.filesUpdated).toBe(3);
			expect(updated!.filesRemoved).toBe(2);
			expect(updated!.unmatchedCount).toBe(10);
		});

		it('marks queued root scan job failed after scan throws', async () => {
			const scanFn = vi.fn().mockRejectedValue(new Error('disk failure'));

			const worker = new LibraryJobWorker({ scanRootFolder: scanFn });
			const job = libraryJobService.enqueueRootFolderScan('root-1');

			const processed = await worker.processOne();
			expect(processed).toBe(true);
			expect(scanFn).toHaveBeenCalledWith('root-1');

			const updated = libraryJobService.getJob(job.id);
			expect(updated).toBeDefined();
			expect(updated!.status).toBe('failed');
			expect(updated!.errorMessage).toBe('disk failure');
		});
	});

	describe('processOne - full scan', () => {
		it('marks queued full scan job completed after all folders succeed', async () => {
			const scanAllFn = vi.fn().mockResolvedValue([
				{
					success: true,
					filesScanned: 10,
					filesAdded: 3,
					filesUpdated: 1,
					filesRemoved: 0,
					unmatchedFiles: 2
				},
				{
					success: true,
					filesScanned: 20,
					filesAdded: 7,
					filesUpdated: 2,
					filesRemoved: 1,
					unmatchedFiles: 5
				}
			]);

			const worker = new LibraryJobWorker({ scanAll: scanAllFn });
			const job = libraryJobService.enqueueFullScan();

			const processed = await worker.processOne();
			expect(processed).toBe(true);
			expect(scanAllFn).toHaveBeenCalled();

			const updated = libraryJobService.getJob(job.id);
			expect(updated).toBeDefined();
			expect(updated!.status).toBe('completed');
			expect(updated!.filesFound).toBe(30);
			expect(updated!.filesAdded).toBe(10);
			expect(updated!.filesUpdated).toBe(3);
			expect(updated!.filesRemoved).toBe(1);
			expect(updated!.unmatchedCount).toBe(7);
		});

		it('marks full scan job failed when any folder scan fails', async () => {
			const scanAllFn = vi.fn().mockResolvedValue([
				{
					success: true,
					filesScanned: 10,
					filesAdded: 1,
					filesUpdated: 0,
					filesRemoved: 0,
					unmatchedFiles: 0
				},
				{ success: false, error: 'mount missing' }
			]);

			const worker = new LibraryJobWorker({ scanAll: scanAllFn });
			const job = libraryJobService.enqueueFullScan();

			await worker.processOne();

			const updated = libraryJobService.getJob(job.id);
			expect(updated).toBeDefined();
			expect(updated!.status).toBe('failed');
			expect(updated!.errorMessage).toContain('mount missing');
		});
	});

	describe('cancelRequested check', () => {
		it('skips job execution when cancelRequested is set before processing', async () => {
			const scanFn = vi.fn().mockResolvedValue({
				success: true,
				filesScanned: 0,
				filesAdded: 0,
				filesUpdated: 0,
				filesRemoved: 0,
				unmatchedFiles: 0
			});

			const worker = new LibraryJobWorker({ scanRootFolder: scanFn });
			const job = libraryJobService.enqueueRootFolderScan('root-1');

			testDb.db
				.update(libraryJobs)
				.set({ cancelRequested: true })
				.where(eq(libraryJobs.id, job.id))
				.run();

			const processed = await worker.processOne();
			expect(processed).toBe(true);
			expect(scanFn).not.toHaveBeenCalled();

			const updated = libraryJobService.getJob(job.id);
			expect(updated).toBeDefined();
			expect(updated!.status).toBe('cancelled');
			expect(updated!.cancelRequested).toBe(true);
		});
	});

	describe('recoverInterruptedJobs on startup', () => {
		it('recovers interrupted running jobs when start is called', async () => {
			const worker = new LibraryJobWorker();
			const job = libraryJobService.enqueueRootFolderScan('root-1');
			libraryJobService.markRunning(job.id);

			worker.start();

			await new Promise((resolve) => setTimeout(resolve, 100));
			worker.stop();

			const updated = libraryJobService.getJob(job.id);
			expect(updated).toBeDefined();
			expect(updated!.status).toBe('failed');
			expect(updated!.errorMessage).toContain('interrupted');
		});
	});
});

describe('match_unmatched cursor paging (issue #513)', () => {
	it('advances by id-cursor so deleted rows cannot skip remaining files', async () => {
		const processFn = vi
			.fn()
			// page 1: processes ids a1,a2 — both match and are deleted
			.mockResolvedValueOnce({
				results: [
					{ fileId: 'a1', filePath: '/x/a1', matched: true, confidence: 1 },
					{ fileId: 'a2', filePath: '/x/a2', matched: true, confidence: 1 }
				],
				hasMore: true,
				nextCursor: 'a2'
			})
			// page 2: cursor a2 -> only a3 remains; old OFFSET logic would skip it
			.mockResolvedValueOnce({
				results: [{ fileId: 'a3', filePath: '/x/a3', matched: true, confidence: 1 }],
				hasMore: false,
				nextCursor: 'a3'
			});

		libraryJobService.enqueueJob({
			type: 'match_unmatched',
			rootFolderId: 'root-1',
			dedupeKey: 'match_unmatched:root-1',
			metadata: { rootFolderId: 'root-1' }
		});

		const worker = new LibraryJobWorker({
			matchUnmatchedByRootFolder: processFn as never
		});
		await worker.processOne();

		expect(processFn).toHaveBeenCalledTimes(2);
		expect(processFn.mock.calls[0][2]).toBeNull();
		expect(processFn.mock.calls[1][2]).toBe('a2');
	});
});
