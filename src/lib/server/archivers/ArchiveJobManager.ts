import { randomUUID } from 'node:crypto';
import { logger } from '$lib/logging';
import type { ArchiveMediaInput } from '$lib/validation/schemas.js';
import { getArchiverManager } from './ArchiverManager.js';
import { getArchiveService } from './ArchiveService.js';
import { RcloneClient, type RcloneStats } from './RcloneClient.js';
import type { ArchiveFileResult } from './types.js';

export type ArchiveJobState = 'queued' | 'running' | 'completed' | 'failed';
export type ArchiveJobPhase = 'queued' | 'sending' | 'uploading' | 'completed' | 'failed';

export interface ArchiveJobStatus {
	id: string;
	state: ArchiveJobState;
	phase: ArchiveJobPhase;
	mediaType: 'movie' | 'series';
	mediaId: string;
	group: string;
	totalBytes: number;
	transferredBytes: number;
	progress: number;
	currentFile: string | null;
	error: string | null;
	results: ArchiveFileResult[];
	startedAt: string;
	completedAt: string | null;
	rcloneStats: RcloneStats | null;
}

interface InternalJob extends Omit<ArchiveJobStatus, 'progress' | 'rcloneStats'> {
	archiverId: string;
}

export class ArchiveJobManager {
	private readonly jobs = new Map<string, InternalJob>();

	start(mediaType: 'movie' | 'series', mediaId: string, input: ArchiveMediaInput): string {
		this.prune();
		const id = randomUUID();
		const job: InternalJob = {
			id,
			state: 'queued',
			phase: 'queued',
			mediaType,
			mediaId,
			archiverId: input.archiverId,
			group: `cinephage/archive/${id}`,
			totalBytes: 0,
			transferredBytes: 0,
			currentFile: null,
			error: null,
			results: [],
			startedAt: new Date().toISOString(),
			completedAt: null
		};
		this.jobs.set(id, job);
		logger.info(
			{
				component: 'ArchiveJobManager',
				logDomain: 'imports',
				jobId: id,
				archiverId: input.archiverId,
				mediaType,
				mediaId,
				fileCount: input.fileIds.length,
				deleteSource: input.deleteSource,
				createFolder: input.createFolder
			},
			'Archive job queued'
		);
		void this.run(job, input);
		return id;
	}

	async get(id: string): Promise<ArchiveJobStatus | null> {
		const job = this.jobs.get(id);
		if (!job) return null;
		let rcloneStats: RcloneStats | null = null;
		if (job.state === 'running' && job.phase === 'uploading') {
			try {
				const record = await getArchiverManager().getRecord(job.archiverId);
				if (record) rcloneStats = await new RcloneClient(record).getStats(job.group);
			} catch {
				// The upload remains valid if live stats are temporarily unavailable.
			}
		}
		const remoteBytes = rcloneStats?.bytes ?? 0;
		const transferredBytes = job.phase === 'uploading' ? remoteBytes : job.transferredBytes;
		const totalBytes = Math.max(job.totalBytes, rcloneStats?.totalBytes ?? 0);
		const totalWorkBytes = totalBytes * 2;
		const completedWorkBytes = job.transferredBytes + remoteBytes;
		const { archiverId: _archiverId, ...publicJob } = job;
		return {
			...publicJob,
			transferredBytes,
			totalBytes,
			progress:
				job.state === 'completed'
					? 100
					: totalWorkBytes > 0
						? Math.min(99, Math.round((completedWorkBytes / totalWorkBytes) * 100))
						: 0,
			rcloneStats
		};
	}

	private async run(job: InternalJob, input: ArchiveMediaInput): Promise<void> {
		job.state = 'running';
		job.phase = 'sending';
		try {
			const context = {
				group: job.group,
				onTotal: (bytes: number) => (job.totalBytes = bytes),
				onFileStart: (_id: string, path: string, completedBytes: number) => {
					job.phase = 'sending';
					job.currentFile = path;
					job.transferredBytes = completedBytes;
				},
				onProgress: (bytes: number) => (job.transferredBytes = bytes),
				onRemoteStart: () => {
					job.phase = 'uploading';
					logger.info(
						{
							component: 'ArchiveJobManager',
							logDomain: 'imports',
							jobId: job.id,
							currentFile: job.currentFile,
							stagedBytes: job.transferredBytes
						},
						'Archive source sent to rclone; waiting for remote upload'
					);
				}
			};
			job.results =
				job.mediaType === 'movie'
					? await getArchiveService().archiveMovie(job.mediaId, input, context)
					: await getArchiveService().archiveSeries(job.mediaId, input, context);
			job.transferredBytes = job.totalBytes;
			job.currentFile = null;
			job.state = 'completed';
			job.phase = 'completed';
			logger.info(
				{
					component: 'ArchiveJobManager',
					logDomain: 'imports',
					jobId: job.id,
					fileCount: job.results.length,
					transferredBytes: job.transferredBytes,
					durationMs: Date.now() - new Date(job.startedAt).getTime()
				},
				'Archive job completed'
			);
		} catch (error) {
			job.state = 'failed';
			job.phase = 'failed';
			job.error = error instanceof Error ? error.message : String(error);
			logger.error(
				{
					err: error,
					component: 'ArchiveJobManager',
					logDomain: 'imports',
					jobId: job.id,
					archiverId: job.archiverId,
					mediaType: job.mediaType,
					mediaId: job.mediaId,
					currentFile: job.currentFile,
					transferredBytes: job.transferredBytes,
					totalBytes: job.totalBytes
				},
				'Archive job failed'
			);
		} finally {
			job.completedAt = new Date().toISOString();
		}
	}

	private prune(): void {
		const cutoff = Date.now() - 60 * 60 * 1000;
		for (const [id, job] of this.jobs) {
			if (job.completedAt && new Date(job.completedAt).getTime() < cutoff) this.jobs.delete(id);
		}
	}
}

let jobs: ArchiveJobManager | null = null;
export function getArchiveJobManager(): ArchiveJobManager {
	jobs ??= new ArchiveJobManager();
	return jobs;
}
