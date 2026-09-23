import { describe, it, expect, vi, afterEach } from 'vitest';
import { ManualImportQueueService } from './ManualImportQueueService.js';

const { mockExecuteImport } = vi.hoisted(() => ({
	mockExecuteImport: vi.fn()
}));

vi.mock('$lib/server/library/manual-import-service.js', () => ({
	manualImportService: {
		executeImport: mockExecuteImport
	}
}));

function makeImportRequest(overrides: Record<string, unknown> = {}) {
	return {
		sourcePath: '/tmp/video.mkv',
		mediaType: 'movie' as const,
		tmdbId: 12345,
		importTarget: 'new' as const,
		rootFolderId: 'root-1',
		...overrides
	};
}

function makeSuccessfulResult(overrides: Record<string, unknown> = {}) {
	return {
		success: true,
		mediaType: 'movie',
		tmdbId: 12345,
		libraryId: 'lib-1',
		importedPath: '/media/Movie.mkv',
		importedPaths: ['/media/Movie.mkv'],
		importedCount: 1,
		...overrides
	};
}

function createTestService(): ManualImportQueueService {
	// @ts-expect-error resetting singleton for test isolation
	ManualImportQueueService.instance = undefined;
	return ManualImportQueueService.getInstance();
}

afterEach(() => {
	vi.clearAllMocks();
});

function waitForBatchComplete(service: ManualImportQueueService): Promise<unknown> {
	return new Promise((resolve) => {
		service.once('batch:complete', resolve);
	});
}

describe('ManualImportQueueService', () => {
	describe('submit', () => {
		it('returns a job ID and creates progress entry', () => {
			const service = createTestService();
			mockExecuteImport.mockResolvedValue(makeSuccessfulResult());

			const jobId = service.submit([{ request: makeImportRequest() }]);

			expect(jobId).toBeTypeOf('string');
			expect(jobId.length).toBeGreaterThan(0);

			const progress = service.getProgress(jobId);
			expect(progress).not.toBeNull();
			expect(progress!.status).toBe('processing');
			expect(progress!.total).toBe(1);
			expect(progress!.completed).toBe(0);
			expect(progress!.failed).toBe(0);
		});
	});

	describe('getProgress', () => {
		it('returns null for unknown job ID', () => {
			const service = createTestService();

			const progress = service.getProgress('nonexistent');

			expect(progress).toBeNull();
		});
	});

	describe('successful import', () => {
		it('emits group:start, group:complete, and batch:complete in order', async () => {
			const service = createTestService();
			mockExecuteImport.mockResolvedValue(makeSuccessfulResult());

			const events: string[] = [];
			service.on('group:start', () => events.push('group:start'));
			service.on('group:complete', () => events.push('group:complete'));
			service.on('batch:complete', () => events.push('batch:complete'));

			service.submit([{ request: makeImportRequest() }]);

			await vi.waitFor(
				() => {
					expect(events).toContain('batch:complete');
				},
				{ timeout: 2000 }
			);

			expect(events).toEqual(['group:start', 'group:complete', 'batch:complete']);
		});

		it('reports completed status with correct counts via batch:complete', async () => {
			const service = createTestService();
			mockExecuteImport.mockResolvedValue(makeSuccessfulResult());

			const progressPromise = waitForBatchComplete(service);

			service.submit([{ request: makeImportRequest() }]);

			const batchProgress = (await progressPromise) as Record<string, unknown>;
			expect(batchProgress.status).toBe('completed');
			expect(batchProgress.completed).toBe(1);
			expect(batchProgress.failed).toBe(0);
		});

		it('emits correct group:complete data', async () => {
			const service = createTestService();
			mockExecuteImport.mockResolvedValue(makeSuccessfulResult());

			let completeData: unknown = null;
			service.on('group:complete', (data: unknown) => {
				completeData = data;
			});

			const batchPromise = waitForBatchComplete(service);

			service.submit([{ request: makeImportRequest() }]);

			await batchPromise;

			expect(completeData).not.toBeNull();
			const data = completeData as Record<string, unknown>;
			expect(data.result).toBeDefined();
			const result = data.result as Record<string, unknown>;
			expect(result.success).toBe(true);
			expect(result.mediaType).toBe('movie');
			expect(result.tmdbId).toBe(12345);
		});
	});

	describe('failed import', () => {
		it('marks batch as failed when all groups fail', async () => {
			const service = createTestService();
			mockExecuteImport.mockRejectedValue(new Error('disk full'));

			const progressPromise = waitForBatchComplete(service);

			service.submit([{ request: makeImportRequest() }]);

			const batchProgress = (await progressPromise) as Record<string, unknown>;
			expect(batchProgress.status).toBe('failed');
			expect(batchProgress.failed).toBe(1);
			const errors = batchProgress.errors as string[];
			expect(errors).toContain('disk full');
		});

		it('emits group:error event on failure', async () => {
			const service = createTestService();
			mockExecuteImport.mockRejectedValue(new Error('permission denied'));

			let errorData: unknown = null;
			service.on('group:error', (data: unknown) => {
				errorData = data;
			});

			const batchPromise = waitForBatchComplete(service);

			service.submit([{ request: makeImportRequest() }]);

			await batchPromise;

			expect(errorData).not.toBeNull();
			const data = errorData as Record<string, unknown>;
			expect(data.error).toBe('permission denied');
		});
	});

	describe('batch progress', () => {
		it('tracks completed and failed across multiple jobs', async () => {
			const service = createTestService();
			mockExecuteImport
				.mockResolvedValueOnce(makeSuccessfulResult())
				.mockRejectedValueOnce(new Error('boom'));

			let batchData: Record<string, unknown> | null = null;
			service.on('batch:complete', (data: unknown) => {
				batchData = data as Record<string, unknown>;
			});

			service.submit([
				{ request: makeImportRequest({ sourcePath: '/tmp/a.mkv' }) },
				{ request: makeImportRequest({ sourcePath: '/tmp/b.mkv' }) }
			]);

			await vi.waitFor(
				() => {
					expect(batchData).not.toBeNull();
				},
				{ timeout: 2000 }
			);

			expect(batchData!.total).toBe(2);
			expect(batchData!.completed).toBe(1);
			expect(batchData!.failed).toBe(1);
			expect(batchData!.status).toBe('completed');
		});

		it('records a per-job result for both the success and the failure', async () => {
			const service = createTestService();
			mockExecuteImport
				.mockResolvedValueOnce(makeSuccessfulResult())
				.mockRejectedValueOnce(new Error('boom'));

			const batchPromise = waitForBatchComplete(service);

			const jobId = service.submit([
				{ request: makeImportRequest({ sourcePath: '/tmp/a.mkv' }), groupName: 'A' },
				{ request: makeImportRequest({ sourcePath: '/tmp/b.mkv' }), groupName: 'B' }
			]);

			await batchPromise;

			const progress = service.getProgress(jobId);
			expect(progress!.results).toHaveLength(2);
			expect(progress!.results[0]).toMatchObject({ success: true, groupName: 'A' });
			expect(progress!.results[1]).toMatchObject({
				success: false,
				groupName: 'B',
				error: 'boom'
			});
		});
	});

	describe('group name', () => {
		it('uses groupName in events when provided', async () => {
			const service = createTestService();
			mockExecuteImport.mockResolvedValue(makeSuccessfulResult());

			let startGroupName: string | null = null;
			service.on('group:start', (data: unknown) => {
				startGroupName = (data as { groupName: string }).groupName;
			});

			const batchPromise = waitForBatchComplete(service);

			service.submit([{ request: makeImportRequest(), groupName: 'Action Movies' }]);

			await batchPromise;

			expect(startGroupName).toBe('Action Movies');
		});
	});

	describe('getProgress after completion', () => {
		it('keeps returning the final progress after the job leaves the active queue', async () => {
			const service = createTestService();
			mockExecuteImport.mockResolvedValue(makeSuccessfulResult());

			const batchPromise = waitForBatchComplete(service);
			const jobId = service.submit([{ request: makeImportRequest() }]);
			await batchPromise;

			// The entry is no longer being processed, but a poll-based client
			// (background bulk import) must still be able to read the final state.
			const progress = service.getProgress(jobId);
			expect(progress).not.toBeNull();
			expect(progress!.status).toBe('completed');
			expect(progress!.completed).toBe(1);
		});
	});

	describe('event emitter cleanup', () => {
		it('does not call removed listener on subsequent batch', async () => {
			const service = createTestService();
			mockExecuteImport.mockResolvedValue(makeSuccessfulResult());

			let completeCount = 0;
			const handler = () => {
				completeCount++;
			};
			service.on('batch:complete', handler);

			const batch1 = waitForBatchComplete(service);
			service.submit([{ request: makeImportRequest() }]);
			await batch1;

			expect(completeCount).toBeGreaterThanOrEqual(1);
			const countAfterFirst = completeCount;

			service.off('batch:complete', handler);

			const batch2 = waitForBatchComplete(service);
			service.submit([{ request: makeImportRequest() }]);
			await batch2;

			expect(completeCount).toBe(countAfterFirst);
		});
	});
});
