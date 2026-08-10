import { db } from '$lib/server/db/index.js';
import { libraryJobs } from '$lib/server/db/schema.js';
import { eq, and, desc, inArray, lt } from 'drizzle-orm';
import { NotFoundError, ValidationError } from '$lib/errors/index.js';
import type { EnqueueLibraryJobInput, LibraryJobType } from './types.js';

interface LibraryJobUpdate {
	phase?: string;
	progressCurrent?: number;
	progressTotal?: number;
	filesFound?: number;
	filesProcessed?: number;
	filesAdded?: number;
	filesUpdated?: number;
	filesRemoved?: number;
	unmatchedCount?: number;
}

export class LibraryJobService {
	private static instance: LibraryJobService;

	private constructor() {}

	static getInstance(): LibraryJobService {
		if (!LibraryJobService.instance) {
			LibraryJobService.instance = new LibraryJobService();
		}
		return LibraryJobService.instance;
	}

	enqueueRootFolderScan(rootFolderId: string) {
		return this.enqueueJob({
			type: 'scan_root_folder',
			rootFolderId,
			dedupeKey: `scan_root_folder:${rootFolderId}`
		});
	}

	enqueueFullScan() {
		return this.enqueueJob({
			type: 'scan_all_root_folders',
			dedupeKey: 'scan_all_root_folders'
		});
	}

	enqueueJob(input: EnqueueLibraryJobInput) {
		if (input.dedupeKey) {
			// A job that has been 'running' for over an hour was almost certainly
			// abandoned by a crash or kill signal. Reset it so it no longer blocks
			// new jobs with the same dedupeKey.
			const staleThreshold = new Date(Date.now() - 60 * 60 * 1000).toISOString();
			const now = new Date().toISOString();
			db.update(libraryJobs)
				.set({
					status: 'failed',
					errorMessage: 'Job timed out (exceeded 1 hour without completion)',
					completedAt: now,
					updatedAt: now
				})
				.where(
					and(
						eq(libraryJobs.dedupeKey, input.dedupeKey),
						eq(libraryJobs.status, 'running'),
						lt(libraryJobs.startedAt, staleThreshold)
					)
				)
				.run();

			const existing = db
				.select()
				.from(libraryJobs)
				.where(
					and(
						eq(libraryJobs.dedupeKey, input.dedupeKey),
						inArray(libraryJobs.status, ['queued', 'running'])
					)
				)
				.get();

			if (existing) return existing;
		}

		const now = new Date().toISOString();
		const job = {
			type: input.type,
			status: 'queued' as const,
			rootFolderId: input.rootFolderId ?? null,
			parentJobId: input.parentJobId ?? null,
			dedupeKey: input.dedupeKey ?? null,
			phase: 'queued',
			progressCurrent: 0,
			progressTotal: null as number | null,
			filesFound: 0,
			filesProcessed: 0,
			filesAdded: 0,
			filesUpdated: 0,
			filesRemoved: 0,
			unmatchedCount: 0,
			errorMessage: null as string | null,
			cancelRequested: false,
			metadata: input.metadata ?? null,
			startedAt: null as string | null,
			completedAt: null as string | null,
			createdAt: now,
			updatedAt: now
		};

		const result = db.insert(libraryJobs).values(job).returning().get();
		if (!result) throw new NotFoundError('LibraryJob', 'insert failed');
		return result;
	}

	getJob(id: string) {
		return db.select().from(libraryJobs).where(eq(libraryJobs.id, id)).get();
	}

	listRecentJobs(limit = 20) {
		return db.select().from(libraryJobs).orderBy(desc(libraryJobs.createdAt)).limit(limit).all();
	}

	listActiveJobs() {
		return db
			.select()
			.from(libraryJobs)
			.where(inArray(libraryJobs.status, ['queued', 'running']))
			.all();
	}

	markRunning(id: string) {
		const job = this.getJob(id);
		if (!job) throw new NotFoundError('LibraryJob', id);

		const now = new Date().toISOString();
		const result = db
			.update(libraryJobs)
			.set({
				status: 'running',
				phase: 'running',
				startedAt: now,
				updatedAt: now
			})
			.where(eq(libraryJobs.id, id))
			.returning()
			.get();
		if (!result) throw new NotFoundError('LibraryJob', id);
		return result;
	}

	markCompleted(id: string, updates?: LibraryJobUpdate) {
		const job = this.getJob(id);
		if (!job) throw new NotFoundError('LibraryJob', id);

		const now = new Date().toISOString();
		const setValues: Record<string, unknown> = {
			status: 'completed',
			completedAt: now,
			updatedAt: now
		};

		if (updates) {
			for (const [key, value] of Object.entries(updates)) {
				if (value !== undefined) {
					setValues[key] = value;
				}
			}
		}

		const result = db
			.update(libraryJobs)
			.set(setValues)
			.where(eq(libraryJobs.id, id))
			.returning()
			.get();
		if (!result) throw new NotFoundError('LibraryJob', id);
		return result;
	}

	markFailed(id: string, errorMessage: string) {
		const job = this.getJob(id);
		if (!job) throw new NotFoundError('LibraryJob', id);

		const now = new Date().toISOString();
		const result = db
			.update(libraryJobs)
			.set({
				status: 'failed',
				errorMessage,
				completedAt: now,
				updatedAt: now
			})
			.where(eq(libraryJobs.id, id))
			.returning()
			.get();
		if (!result) throw new NotFoundError('LibraryJob', id);
		return result;
	}

	cancelJob(id: string) {
		const job = this.getJob(id);
		if (!job) throw new NotFoundError('LibraryJob', id);

		if (job.status === 'queued') {
			const now = new Date().toISOString();
			const result = db
				.update(libraryJobs)
				.set({
					status: 'cancelled',
					completedAt: now,
					updatedAt: now
				})
				.where(eq(libraryJobs.id, id))
				.returning()
				.get();
			if (!result) throw new NotFoundError('LibraryJob', id);
			return result;
		}

		if (job.status === 'running') {
			const now = new Date().toISOString();
			const result = db
				.update(libraryJobs)
				.set({
					cancelRequested: true,
					updatedAt: now
				})
				.where(eq(libraryJobs.id, id))
				.returning()
				.get();
			if (!result) throw new NotFoundError('LibraryJob', id);
			return result;
		}

		return job;
	}

	retryJob(id: string) {
		const job = this.getJob(id);
		if (!job) throw new NotFoundError('LibraryJob', id);

		if (job.status !== 'failed' && job.status !== 'cancelled') {
			throw new ValidationError(`Cannot retry job with status ${job.status}`);
		}

		return this.enqueueJob({
			type: job.type as LibraryJobType,
			rootFolderId: job.rootFolderId,
			parentJobId: job.parentJobId,
			dedupeKey: job.dedupeKey,
			metadata: job.metadata as Record<string, unknown> | undefined
		});
	}

	recoverInterruptedJobs() {
		const now = new Date().toISOString();
		const result = db
			.update(libraryJobs)
			.set({
				status: 'failed',
				errorMessage: 'Job interrupted (server restart or crash)',
				completedAt: now,
				updatedAt: now
			})
			.where(eq(libraryJobs.status, 'running'))
			.run();

		return result.changes;
	}
}

export const libraryJobService = LibraryJobService.getInstance();
