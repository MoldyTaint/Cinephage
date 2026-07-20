import { EventEmitter } from 'events';
import { createChildLogger } from '$lib/logging';
import type { BackgroundService, ServiceStatus } from '$lib/server/services/background-service.js';
import { LibraryJobService, libraryJobService } from './LibraryJobService.js';
import { diskScanService } from '$lib/server/library/disk-scan.js';
import { librarySchedulerService } from '$lib/server/library/library-scheduler.js';
import { mediaMatcherService } from '$lib/server/library/media-matcher.js';

const logger = createChildLogger({ logDomain: 'scans' as const });

export interface ScanResultLike {
	success: boolean;
	filesScanned?: number;
	filesAdded?: number;
	filesUpdated?: number;
	filesRemoved?: number;
	unmatchedFiles?: number;
	error?: string;
}

export interface WorkerDeps {
	jobService?: LibraryJobService;
	scanRootFolder?: (rootFolderId: string) => Promise<ScanResultLike>;
	scanAll?: () => Promise<ScanResultLike[]>;
}

export class LibraryJobWorker extends EventEmitter implements BackgroundService {
	readonly name = 'LibraryJobWorker';
	private _status: ServiceStatus = 'pending';
	private _error?: Error;
	private running = false;
	private loopTimer: ReturnType<typeof setTimeout> | null = null;
	private jobService: LibraryJobService;
	private scanRootFolder: (rootFolderId: string) => Promise<ScanResultLike>;
	private scanAll: () => Promise<ScanResultLike[]>;

	constructor(deps: WorkerDeps = {}) {
		super();
		this.jobService = deps.jobService ?? libraryJobService;
		this.scanRootFolder =
			deps.scanRootFolder ??
			((rootFolderId: string) => librarySchedulerService.runFolderScan(rootFolderId));
		this.scanAll = deps.scanAll ?? (() => librarySchedulerService.runFullScan());
	}

	get status(): ServiceStatus {
		return this._status;
	}

	get error(): Error | undefined {
		return this._error;
	}

	start(): void {
		this._status = 'starting';
		this.jobService.recoverInterruptedJobs();

		setImmediate(() => {
			this.running = true;
			this._status = 'ready';
			this.processLoop().catch((err) => {
				this._error = err instanceof Error ? err : new Error(String(err));
				this._status = 'error';
				logger.error({ err: this._error }, '[LibraryJobWorker] Loop failed');
			});
		});
	}

	async stop(): Promise<void> {
		this.running = false;
		if (this.loopTimer) {
			clearTimeout(this.loopTimer);
			this.loopTimer = null;
		}
		this._status = 'pending';
	}

	async processOne(): Promise<boolean> {
		const activeJobs = await this.jobService.listActiveJobs();
		const queuedJob = activeJobs.find((j) => j.status === 'queued');
		if (!queuedJob) return false;

		if (queuedJob.cancelRequested) {
			await this.jobService.cancelJob(queuedJob.id);
			return true;
		}

		await this.jobService.markRunning(queuedJob.id);

		const reloaded = await this.jobService.getJob(queuedJob.id);
		if (reloaded?.cancelRequested) {
			await this.jobService.markFailed(queuedJob.id, 'Job cancelled');
			return true;
		}

		diskScanService.setCancelCheck(async () => {
			const job = await this.jobService.getJob(queuedJob.id);
			return job?.cancelRequested === true;
		});

		try {
			if (queuedJob.type === 'scan_root_folder') {
				if (!queuedJob.rootFolderId) throw new Error('scan_root_folder job missing rootFolderId');
				const result = await this.scanRootFolder(queuedJob.rootFolderId);
				await this.jobService.markCompleted(queuedJob.id, {
					filesFound: result.filesScanned,
					filesProcessed: result.filesScanned,
					filesAdded: result.filesAdded,
					filesUpdated: result.filesUpdated,
					filesRemoved: result.filesRemoved,
					unmatchedCount: result.unmatchedFiles,
					phase: 'done'
				});
				await this.jobService.enqueueJob({
					type: 'match_unmatched',
					rootFolderId: queuedJob.rootFolderId,
					dedupeKey: `match_unmatched:${queuedJob.rootFolderId}`,
					metadata: { rootFolderId: queuedJob.rootFolderId }
				});
			} else if (queuedJob.type === 'match_unmatched') {
				if (!queuedJob.rootFolderId) throw new Error('match_unmatched job missing rootFolderId');
				let offset = 0;
				let hasMore = true;
				let _matched = 0;
				let total = 0;
				while (hasMore) {
					const page = await mediaMatcherService.processUnmatchedByRootFolder(
						queuedJob.rootFolderId,
						50,
						offset
					);
					_matched += page.results.filter((r) => r.matched).length;
					total += page.results.length;
					hasMore = page.hasMore;
					offset += 50;

					const reloaded = await this.jobService.getJob(queuedJob.id);
					if (reloaded?.cancelRequested) break;

					// Yield between pages so the event loop stays responsive.
					await new Promise<void>((resolve) => setImmediate(resolve));
				}
				await this.jobService.markCompleted(queuedJob.id, {
					phase: 'done',
					progressCurrent: total,
					progressTotal: total
				});
			} else if (queuedJob.type === 'scan_all_root_folders') {
				const results = await this.scanAll();
				const failed = results.filter((r) => !r.success);
				if (failed.length > 0) {
					const messages = failed.map((f) => f.error || 'Unknown error').join('; ');
					throw new Error(messages);
				}
				const totals = results.reduce(
					(acc, r) => ({
						filesFound: acc.filesFound + (r.filesScanned || 0),
						filesProcessed: acc.filesProcessed + (r.filesScanned || 0),
						filesAdded: acc.filesAdded + (r.filesAdded || 0),
						filesUpdated: acc.filesUpdated + (r.filesUpdated || 0),
						filesRemoved: acc.filesRemoved + (r.filesRemoved || 0),
						unmatchedCount: acc.unmatchedCount + (r.unmatchedFiles || 0)
					}),
					{
						filesFound: 0,
						filesProcessed: 0,
						filesAdded: 0,
						filesUpdated: 0,
						filesRemoved: 0,
						unmatchedCount: 0
					}
				);
				this.jobService.markCompleted(queuedJob.id, { ...totals, phase: 'done' });
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			await this.jobService.markFailed(queuedJob.id, message);
		} finally {
			diskScanService.setCancelCheck(null);
		}

		return true;
	}

	private async processLoop(): Promise<void> {
		while (this.running) {
			const processed = await this.processOne();
			if (!processed) {
				await new Promise<void>((resolve) => {
					this.loopTimer = setTimeout(resolve, 1000);
				});
			} else {
				// Yield before picking up the next job so the event loop can
				// serve HTTP requests and flush logs between jobs.
				await new Promise<void>((resolve) => setImmediate(resolve));
			}
		}
	}
}

export const libraryJobWorker = new LibraryJobWorker();
