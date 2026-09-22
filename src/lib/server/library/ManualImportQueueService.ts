import { EventEmitter } from 'events';
import { randomUUID } from 'node:crypto';
import { createChildLogger } from '$lib/logging';
import { manualImportService } from '$lib/server/library/manual-import-service.js';
import { libraryMediaEvents } from '$lib/server/library/LibraryMediaEvents.js';
import type { ManualImportRequest } from '$lib/validation/schemas.js';

const logger = createChildLogger({ logDomain: 'imports' as const });

export interface ManualImportJob {
	request: ManualImportRequest;
	groupName?: string;
}

export interface ManualImportJobResult {
	success: boolean;
	jobId: string;
	groupName?: string;
	mediaType?: 'movie' | 'tv';
	tmdbId?: number;
	libraryId?: string;
	importedPaths?: string[];
	importedCount?: number;
	error?: string;
}

export interface QueueProgress {
	jobId: string;
	status: 'processing' | 'completed' | 'failed';
	total: number;
	completed: number;
	failed: number;
	currentGroup?: string;
	lastResult?: ManualImportJobResult;
	errors: string[];
}

interface QueueEntry {
	jobId: string;
	jobs: ManualImportJob[];
	progress: QueueProgress;
}

export class ManualImportQueueService extends EventEmitter {
	private static instance: ManualImportQueueService;
	private processing = false;
	private queue: QueueEntry[] = [];

	private constructor() {
		super();
		this.setMaxListeners(100);
	}

	static getInstance(): ManualImportQueueService {
		if (!ManualImportQueueService.instance) {
			ManualImportQueueService.instance = new ManualImportQueueService();
		}
		return ManualImportQueueService.instance;
	}

	submit(jobs: ManualImportJob[]): string {
		const jobId = randomUUID();
		const entry: QueueEntry = {
			jobId,
			jobs,
			progress: {
				jobId,
				status: 'processing',
				total: jobs.length,
				completed: 0,
				failed: 0,
				errors: []
			}
		};
		this.queue.push(entry);
		logger.info({ jobId, count: jobs.length }, '[ManualImportQueue] Jobs submitted');
		this.startProcessing();
		return jobId;
	}

	getProgress(jobId: string): QueueProgress | null {
		const entry = this.queue.find((e) => e.jobId === jobId);
		if (!entry) return null;
		return { ...entry.progress };
	}

	private startProcessing(): void {
		if (this.processing) return;
		this.processing = true;
		setImmediate(() => this.processNext());
	}

	private async processNext(): Promise<void> {
		if (this.queue.length === 0) {
			this.processing = false;
			return;
		}

		const entry = this.queue[0];
		try {
			for (let i = 0; i < entry.jobs.length; i++) {
				const job = entry.jobs[i];
				const progress = entry.progress;
				progress.currentGroup = job.groupName ?? `Item ${i + 1}`;

				this.emit('group:start', {
					jobId: entry.jobId,
					groupName: progress.currentGroup,
					index: i,
					total: entry.jobs.length
				});

				try {
					const result = await manualImportService.executeImport(job.request);
					progress.completed++;
					const jobResult: ManualImportJobResult = {
						success: true,
						jobId: entry.jobId,
						groupName: progress.currentGroup,
						mediaType: result.mediaType,
						tmdbId: result.tmdbId,
						libraryId: result.libraryId,
						importedPaths: result.importedPaths,
						importedCount: result.importedCount
					};
					progress.lastResult = jobResult;

					this.emit('group:complete', {
						jobId: entry.jobId,
						groupName: progress.currentGroup,
						index: i,
						total: entry.jobs.length,
						result: jobResult,
						progress: {
							completed: progress.completed,
							failed: progress.failed,
							total: progress.total
						}
					});
				} catch (error) {
					progress.failed++;
					const errorMsg = error instanceof Error ? error.message : String(error);
					progress.errors.push(errorMsg);

					logger.error(
						{ jobId: entry.jobId, groupName: progress.currentGroup, error },
						'[ManualImportQueue] Group import failed'
					);

					this.emit('group:error', {
						jobId: entry.jobId,
						groupName: progress.currentGroup,
						index: i,
						total: entry.jobs.length,
						error: errorMsg,
						progress: {
							completed: progress.completed,
							failed: progress.failed,
							total: progress.total
						}
					});
				}

				// Imported files change rename plans; the queue import path must feed
				// the same invalidation event the single-import endpoint emits.
				libraryMediaEvents.emitLibraryDataChanged({
					source: job.request.mediaType === 'movie' ? 'movie' : 'series',
					reason: 'manual-import'
				});
			}

			entry.progress.status =
				entry.progress.failed > 0 && entry.progress.completed === 0 ? 'failed' : 'completed';
			this.emit('batch:complete', entry.progress);
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			logger.error(
				{ jobId: entry.jobId, error: errorMsg },
				'[ManualImportQueue] Batch processing failed'
			);
			entry.progress.status = 'failed';
			entry.progress.errors.push(errorMsg);
			this.emit('batch:complete', entry.progress);
		}

		this.queue.shift();
		setImmediate(() => this.processNext());
	}
}

export const manualImportQueueService = ManualImportQueueService.getInstance();
