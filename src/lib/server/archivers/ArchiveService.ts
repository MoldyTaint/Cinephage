import { realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { episodeFiles, movieFiles, movies, rootFolders, series } from '$lib/server/db/schema.js';
import type { ArchiveMediaInput } from '$lib/validation/schemas.js';
import { getArchiverManager } from './ArchiverManager.js';
import { RcloneClient } from './RcloneClient.js';
import {
	movieArchiveDirectory,
	seasonArchiveDirectory,
	seriesArchiveDirectory
} from './archivePaths.js';
import type { ArchiveFileResult } from './types.js';

interface SourceFile {
	id: string;
	relativePath: string;
	size: number | null;
	parentPath: string;
	rootPath: string | null;
	mediaTitle: string;
	mediaOriginalTitle: string | null;
	mediaPreferOriginalTitle: boolean | null;
	seasonNumber?: number;
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
				rootPath: rootFolders.path,
				mediaTitle: movies.title,
				mediaOriginalTitle: movies.originalTitle,
				mediaPreferOriginalTitle: movies.preferOriginalTitle
			})
			.from(movieFiles)
			.innerJoin(movies, eq(movieFiles.movieId, movies.id))
			.leftJoin(rootFolders, eq(movies.rootFolderId, rootFolders.id))
			.where(and(eq(movieFiles.movieId, movieId), inArray(movieFiles.id, input.fileIds)));

		this.assertAllFilesFound(files, input.fileIds);
		const movieDirectory =
			input.createFolder && files[0]
				? movieArchiveDirectory({
						title: files[0].mediaTitle,
						originalTitle: files[0].mediaOriginalTitle,
						preferOriginalTitle: files[0].mediaPreferOriginalTitle
					})
				: '';
		return this.upload(files, input, progress, () => movieDirectory);
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
				rootPath: rootFolders.path,
				mediaTitle: series.title,
				mediaOriginalTitle: series.originalTitle,
				mediaPreferOriginalTitle: series.preferOriginalTitle,
				seasonNumber: episodeFiles.seasonNumber
			})
			.from(episodeFiles)
			.innerJoin(series, eq(episodeFiles.seriesId, series.id))
			.leftJoin(rootFolders, eq(series.rootFolderId, rootFolders.id))
			.where(and(eq(episodeFiles.seriesId, seriesId), inArray(episodeFiles.id, input.fileIds)));

		this.assertAllFilesFound(files, input.fileIds);
		const seriesDirectory =
			input.createFolder && files[0]
				? seriesArchiveDirectory({
						title: files[0].mediaTitle,
						originalTitle: files[0].mediaOriginalTitle,
						preferOriginalTitle: files[0].mediaPreferOriginalTitle
					})
				: '';
		return this.upload(files, input, progress, (file) =>
			seriesDirectory && file.seasonNumber !== undefined
				? join(seriesDirectory, seasonArchiveDirectory(file.seasonNumber))
				: ''
		);
	}

	private async upload(
		files: SourceFile[],
		input: ArchiveMediaInput,
		progress: ArchiveProgressContext | undefined,
		destinationDirectoryFor: (file: SourceFile) => string
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
			const sourcePath = await this.resolveSourcePath(
				file.rootPath,
				join(file.parentPath, file.relativePath)
			);
			const destinationDirectory = destinationDirectoryFor(file);
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

	private async resolveSourcePath(rootPath: string, relativePath: string): Promise<string> {
		const lexicalRoot = resolve(rootPath);
		const lexicalSource = resolve(lexicalRoot, relativePath);
		this.assertPathWithinRoot(lexicalRoot, lexicalSource, relativePath);
		const [realRoot, realSource] = await Promise.all([
			realpath(lexicalRoot),
			realpath(lexicalSource)
		]);
		this.assertPathWithinRoot(realRoot, realSource, relativePath);
		return realSource;
	}

	private assertPathWithinRoot(rootPath: string, sourcePath: string, displayPath: string): void {
		const pathFromRoot = relative(rootPath, sourcePath);
		if (pathFromRoot === '..' || pathFromRoot.startsWith(`..${sep}`) || isAbsolute(pathFromRoot)) {
			throw new Error(`Archive source resolves outside its configured root folder: ${displayPath}`);
		}
	}

	private assertAllFilesFound(files: SourceFile[], requestedIds: string[]): void {
		const found = new Set(files.map((file) => file.id));
		if (requestedIds.some((id) => !found.has(id))) {
			throw new Error('One or more selected files were not found in this library item');
		}
	}
}

let service: ArchiveService | null = null;
export function getArchiveService(): ArchiveService {
	service ??= new ArchiveService();
	return service;
}
