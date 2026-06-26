import { and, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import {
	downloadQueue,
	episodeFiles,
	episodes,
	movieFiles,
	movies
} from '$lib/server/db/schema.js';
import type { GrabTarget } from '$lib/server/filters/stages/grab/types.js';

type OccupancyReason =
	| 'movie_already_downloading'
	| 'movie_already_has_file'
	| 'episode_already_downloading'
	| 'episode_already_has_file';

export interface MediaOccupancyResult {
	occupied: boolean;
	reason?: OccupancyReason;
	details?: {
		queueItemId?: string;
		fileId?: string;
		episodeIds?: string[];
	};
}

export interface MediaOccupancyOptions {
	isUpgrade?: boolean;
}

const BLOCKING_DOWNLOAD_STATUSES = [
	'queued',
	'downloading',
	'awaiting',
	'paused',
	'seeding',
	'importing'
];
const ALWAYS_BLOCKING_DOWNLOAD_STATUSES = ['queued', 'downloading', 'awaiting', 'importing'];

interface LockWaiter {
	keys: string[];
	resolve: () => void;
}

class MediaOccupancyServiceImpl {
	private activeLockKeys = new Set<string>();
	private lockQueue: LockWaiter[] = [];

	async runExclusive<T>(target: GrabTarget, fn: () => Promise<T>): Promise<T> {
		const keys = this.getLockKeys(target);
		await this.acquire(keys);

		try {
			return await fn();
		} finally {
			this.release(keys);
		}
	}

	async check(
		target: GrabTarget,
		options: MediaOccupancyOptions = {}
	): Promise<MediaOccupancyResult> {
		if (target.type === 'movie') {
			return this.checkMovie(target.movieId, options);
		}

		return this.checkEpisodes(this.getEpisodeIds(target), options);
	}

	private async checkMovie(
		movieId: string,
		options: MediaOccupancyOptions
	): Promise<MediaOccupancyResult> {
		const activeDownload = await this.getBlockingMovieDownload(movieId);
		if (activeDownload) {
			return {
				occupied: true,
				reason: 'movie_already_downloading',
				details: { queueItemId: activeDownload.id }
			};
		}

		if (options.isUpgrade) {
			return { occupied: false };
		}

		const existingFile = await db
			.select({ id: movieFiles.id })
			.from(movieFiles)
			.where(eq(movieFiles.movieId, movieId))
			.limit(1);

		if (existingFile.length > 0) {
			return {
				occupied: true,
				reason: 'movie_already_has_file',
				details: { fileId: existingFile[0].id }
			};
		}

		const movieRows = await db
			.select({ hasFile: movies.hasFile })
			.from(movies)
			.where(eq(movies.id, movieId))
			.limit(1);

		if (movieRows[0]?.hasFile) {
			return { occupied: true, reason: 'movie_already_has_file' };
		}

		return { occupied: false };
	}

	private async checkEpisodes(
		episodeIds: string[],
		options: MediaOccupancyOptions
	): Promise<MediaOccupancyResult> {
		if (episodeIds.length === 0) {
			return { occupied: false };
		}

		const activeDownload = await this.getBlockingEpisodeDownload(episodeIds);
		if (activeDownload) {
			return {
				occupied: true,
				reason: 'episode_already_downloading',
				details: { queueItemId: activeDownload.id, episodeIds: activeDownload.episodeIds ?? [] }
			};
		}

		if (options.isUpgrade) {
			return { occupied: false };
		}

		const targetEpisodeIds = new Set(episodeIds);
		const relatedEpisodes = await db
			.select({ id: episodes.id, seriesId: episodes.seriesId, hasFile: episodes.hasFile })
			.from(episodes)
			.where(inArray(episodes.id, episodeIds));

		const fileSeriesIds = [...new Set(relatedEpisodes.map((episode) => episode.seriesId))];
		if (fileSeriesIds.length > 0) {
			const files = await db
				.select({ id: episodeFiles.id, episodeIds: episodeFiles.episodeIds })
				.from(episodeFiles)
				.where(inArray(episodeFiles.seriesId, fileSeriesIds));

			const matchingFile = files.find((file) =>
				(file.episodeIds ?? []).some((episodeId) => targetEpisodeIds.has(episodeId))
			);

			if (matchingFile) {
				return {
					occupied: true,
					reason: 'episode_already_has_file',
					details: { fileId: matchingFile.id, episodeIds: matchingFile.episodeIds ?? [] }
				};
			}
		}

		const episodeWithFile = relatedEpisodes.find((episode) => episode.hasFile);
		if (episodeWithFile) {
			return {
				occupied: true,
				reason: 'episode_already_has_file',
				details: { episodeIds: [episodeWithFile.id] }
			};
		}

		return { occupied: false };
	}

	private async getBlockingMovieDownload(movieId: string) {
		const activeDownloads = await db
			.select({
				id: downloadQueue.id,
				status: downloadQueue.status,
				importedAt: downloadQueue.importedAt
			})
			.from(downloadQueue)
			.where(
				and(
					eq(downloadQueue.movieId, movieId),
					inArray(downloadQueue.status, BLOCKING_DOWNLOAD_STATUSES)
				)
			);

		return activeDownloads.find((download) => this.isBlockingDownload(download));
	}

	private async getBlockingEpisodeDownload(episodeIds: string[]) {
		const targetEpisodeIds = new Set(episodeIds);
		const activeDownloads = await db
			.select({
				id: downloadQueue.id,
				episodeIds: downloadQueue.episodeIds,
				status: downloadQueue.status,
				importedAt: downloadQueue.importedAt
			})
			.from(downloadQueue)
			.where(inArray(downloadQueue.status, BLOCKING_DOWNLOAD_STATUSES));

		return activeDownloads.find((download) => {
			if (!this.isBlockingDownload(download)) {
				return false;
			}

			return (download.episodeIds ?? []).some((episodeId) => targetEpisodeIds.has(episodeId));
		});
	}

	private isBlockingDownload(download: { status: string; importedAt: string | null }) {
		return (
			ALWAYS_BLOCKING_DOWNLOAD_STATUSES.includes(download.status) ||
			((download.status === 'paused' || download.status === 'seeding') && !download.importedAt)
		);
	}

	private getEpisodeIds(target: Exclude<GrabTarget, { type: 'movie' }>) {
		if (target.type === 'episode') {
			return [target.episodeId];
		}

		return target.episodeIds;
	}

	private getLockKeys(target: GrabTarget): string[] {
		if (target.type === 'movie') {
			return [`movie:${target.movieId}`];
		}

		const episodeIds = this.getEpisodeIds(target);
		if (episodeIds.length > 0) {
			return episodeIds.map((episodeId) => `episode:${episodeId}`);
		}

		return [`series:${target.seriesId}`];
	}

	private async acquire(keys: string[]): Promise<void> {
		if (this.canAcquire(keys)) {
			this.addActiveKeys(keys);
			return;
		}

		await new Promise<void>((resolve) => {
			this.lockQueue.push({ keys, resolve });
		});
	}

	private release(keys: string[]): void {
		for (const key of keys) {
			this.activeLockKeys.delete(key);
		}

		this.drainQueue();
	}

	private drainQueue(): void {
		for (let index = 0; index < this.lockQueue.length; ) {
			const waiter = this.lockQueue[index];
			if (!this.canAcquire(waiter.keys)) {
				index += 1;
				continue;
			}

			this.lockQueue.splice(index, 1);
			this.addActiveKeys(waiter.keys);
			waiter.resolve();
		}
	}

	private canAcquire(keys: string[]): boolean {
		return keys.every((key) => !this.activeLockKeys.has(key));
	}

	private addActiveKeys(keys: string[]): void {
		for (const key of keys) {
			this.activeLockKeys.add(key);
		}
	}
}

export const mediaOccupancyService = new MediaOccupancyServiceImpl();
export { MediaOccupancyServiceImpl as MediaOccupancyService };
