import { basename, extname, join } from 'node:path';
import { unlink } from 'node:fs/promises';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import {
	episodeFiles,
	episodes,
	movieFiles,
	movies,
	rootFolders,
	seasons,
	series
} from '$lib/server/db/schema.js';
import type { ArchiveMediaInput } from '$lib/validation/schemas.js';
import { resolvePathWithinRoot } from '$lib/server/filesystem/delete-helpers.js';
import { libraryMediaEvents } from '$lib/server/library/LibraryMediaEvents.js';
import { getArchiverManager } from './ArchiverManager.js';
import { RcloneClient } from './RcloneClient.js';
import type { ArchiveFileResult } from './types.js';

interface SourceFile {
	id: string;
	relativePath: string;
	size: number | null;
	parentPath: string;
	rootPath: string | null;
}

export interface ArchiveProgressContext {
	group: string;
	onTotal?: (totalBytes: number) => void;
	onFileStart?: (fileId: string, path: string, completedBytes: number) => void;
	onProgress?: (completedBytes: number) => void;
	onRemoteStart?: () => void;
}

export class ArchiveService {
	async archiveMovie(
		movieId: string,
		input: ArchiveMediaInput,
		progress?: ArchiveProgressContext
	): Promise<ArchiveFileResult[]> {
		const files = await db
			.select({
				id: movieFiles.id,
				relativePath: movieFiles.relativePath,
				size: movieFiles.size,
				parentPath: movies.path,
				rootPath: rootFolders.path
			})
			.from(movieFiles)
			.innerJoin(movies, eq(movieFiles.movieId, movies.id))
			.leftJoin(rootFolders, eq(movies.rootFolderId, rootFolders.id))
			.where(and(eq(movieFiles.movieId, movieId), inArray(movieFiles.id, input.fileIds)));

		this.assertAllFilesFound(files, input.fileIds);
		const results = await this.upload(files, input, progress);
		if (input.deleteSource) {
			await this.removeSources(files);
			await db.delete(movieFiles).where(inArray(movieFiles.id, input.fileIds));
			const [remaining] = await db
				.select({ id: movieFiles.id })
				.from(movieFiles)
				.where(eq(movieFiles.movieId, movieId))
				.limit(1);
			await db
				.update(movies)
				.set({ hasFile: Boolean(remaining) })
				.where(eq(movies.id, movieId));
			libraryMediaEvents.emitMovieUpdated(movieId);
		}
		return results;
	}

	async archiveSeries(
		seriesId: string,
		input: ArchiveMediaInput,
		progress?: ArchiveProgressContext
	): Promise<ArchiveFileResult[]> {
		const files = await db
			.select({
				id: episodeFiles.id,
				relativePath: episodeFiles.relativePath,
				size: episodeFiles.size,
				parentPath: series.path,
				rootPath: rootFolders.path
			})
			.from(episodeFiles)
			.innerJoin(series, eq(episodeFiles.seriesId, series.id))
			.leftJoin(rootFolders, eq(series.rootFolderId, rootFolders.id))
			.where(and(eq(episodeFiles.seriesId, seriesId), inArray(episodeFiles.id, input.fileIds)));

		this.assertAllFilesFound(files, input.fileIds);
		const results = await this.upload(files, input, progress);
		if (input.deleteSource) {
			await this.removeSources(files);
			await db.delete(episodeFiles).where(inArray(episodeFiles.id, input.fileIds));
			await this.refreshSeriesFileFlags(seriesId);
			libraryMediaEvents.emitLibraryDataChanged({
				source: 'episode',
				reason: 'episode-file-deleted',
				entityId: seriesId
			});
		}
		return results;
	}

	private async upload(
		files: SourceFile[],
		input: ArchiveMediaInput,
		progress?: ArchiveProgressContext
	): Promise<ArchiveFileResult[]> {
		const record = await getArchiverManager().getRecord(input.archiverId);
		if (!record || !record.enabled) throw new Error('Archiver not found or disabled');
		if (record.type !== 'rclone') throw new Error(`Unsupported archiver type: ${record.type}`);

		const client = new RcloneClient(record);
		const results: ArchiveFileResult[] = [];
		progress?.onTotal?.(files.reduce((total, file) => total + (file.size ?? 0), 0));
		let completedBytes = 0;
		for (const file of files) {
			if (!file.rootPath) throw new Error(`No root folder is configured for ${file.relativePath}`);
			const sourcePath = resolvePathWithinRoot(
				file.rootPath,
				join(file.parentPath, file.relativePath)
			);
			const destinationDirectory = input.createFolder
				? this.safeRemoteSegment(basename(file.relativePath, extname(file.relativePath)))
				: '';
			progress?.onFileStart?.(file.id, file.relativePath, completedBytes);
			const destination = await client.uploadFile(sourcePath, destinationDirectory, {
				group: progress?.group,
				onProgress: (fileBytes) => progress?.onProgress?.(completedBytes + fileBytes),
				onRemoteStart: progress?.onRemoteStart
			});
			completedBytes += file.size ?? 0;
			progress?.onProgress?.(completedBytes);
			results.push({
				fileId: file.id,
				sourcePath: file.relativePath,
				destination,
				size: file.size
			});
		}
		return results;
	}

	private assertAllFilesFound(files: SourceFile[], requestedIds: string[]): void {
		const found = new Set(files.map((file) => file.id));
		if (requestedIds.some((id) => !found.has(id))) {
			throw new Error('One or more selected files were not found in this library item');
		}
	}

	private async removeSources(files: SourceFile[]): Promise<void> {
		// Upload every selected file before deleting any source, so a failed batch
		// leaves the complete local set available for a safe retry.
		for (const file of files) {
			if (!file.rootPath) continue;
			const sourcePath = resolvePathWithinRoot(
				file.rootPath,
				join(file.parentPath, file.relativePath)
			);
			await unlink(sourcePath);
		}
	}

	private async refreshSeriesFileFlags(seriesId: string): Promise<void> {
		const [allEpisodes, remainingFiles] = await Promise.all([
			db
				.select({ id: episodes.id, seasonId: episodes.seasonId })
				.from(episodes)
				.where(eq(episodes.seriesId, seriesId)),
			db
				.select({ episodeIds: episodeFiles.episodeIds })
				.from(episodeFiles)
				.where(eq(episodeFiles.seriesId, seriesId))
		]);
		const availableIds = new Set(remainingFiles.flatMap((file) => file.episodeIds ?? []));
		for (const episode of allEpisodes) {
			await db
				.update(episodes)
				.set({ hasFile: availableIds.has(episode.id) })
				.where(eq(episodes.id, episode.id));
		}

		const seasonCounts = new Map<string, number>();
		for (const episode of allEpisodes) {
			if (episode.seasonId && availableIds.has(episode.id)) {
				seasonCounts.set(episode.seasonId, (seasonCounts.get(episode.seasonId) ?? 0) + 1);
			}
		}
		for (const [seasonId, count] of seasonCounts) {
			await db.update(seasons).set({ episodeFileCount: count }).where(eq(seasons.id, seasonId));
		}
		const seasonIds = new Set(allEpisodes.map((episode) => episode.seasonId).filter(Boolean));
		for (const seasonId of seasonIds) {
			if (seasonId && !seasonCounts.has(seasonId)) {
				await db.update(seasons).set({ episodeFileCount: 0 }).where(eq(seasons.id, seasonId));
			}
		}
		await db
			.update(series)
			.set({ episodeFileCount: availableIds.size })
			.where(eq(series.id, seriesId));
	}

	private safeRemoteSegment(value: string): string {
		return (
			value
				.replace(/[\\/:*?"<>|]/g, '_')
				.replace(/^\.+|\.+$/g, '')
				.trim() || 'archive'
		);
	}
}

let service: ArchiveService | null = null;
export function getArchiveService(): ArchiveService {
	service ??= new ArchiveService();
	return service;
}
