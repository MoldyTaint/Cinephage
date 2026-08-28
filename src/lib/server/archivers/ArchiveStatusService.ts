import { basename, extname } from 'node:path';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { archivers, episodeFiles, movieFiles, movies, series } from '$lib/server/db/schema.js';
import { RcloneClient, type RcloneListItem } from './RcloneClient.js';
import {
	movieArchiveDirectory,
	safeArchiveSegment,
	seasonArchiveDirectory,
	seriesArchiveDirectory
} from './archivePaths.js';

export interface ArchivePresence {
	archiverId: string;
	archiverName: string;
	path: string;
	matchedPaths: string[];
	archivedFileIds: string[];
	fileCount: number;
	totalBytes: number;
	error: string | null;
}

export interface MediaArchiveStatus {
	archived: boolean;
	totalFiles: number;
	totalBytes: number;
	archivedFileIds: string[];
	archivers: ArchivePresence[];
}

interface MediaFileReference {
	id: string;
	relativePath: string;
	size: number | null;
	archivePath: string;
}

interface CandidateDirectory {
	path: string;
	fileId?: string;
}

export class ArchiveStatusService {
	async movie(movieId: string): Promise<MediaArchiveStatus | null> {
		const [movie] = await db
			.select({
				title: movies.title,
				originalTitle: movies.originalTitle,
				preferOriginalTitle: movies.preferOriginalTitle
			})
			.from(movies)
			.where(eq(movies.id, movieId))
			.limit(1);
		if (!movie) return null;
		const files = await db
			.select({ id: movieFiles.id, relativePath: movieFiles.relativePath, size: movieFiles.size })
			.from(movieFiles)
			.where(eq(movieFiles.movieId, movieId));
		return this.inspect(
			movieArchiveDirectory(movie),
			files.map((file) => ({
				path: this.legacyFileDirectory(file.relativePath),
				fileId: file.id
			})),
			files.map((file) => ({ ...file, archivePath: basename(file.relativePath) }))
		);
	}

	async series(seriesId: string): Promise<MediaArchiveStatus | null> {
		const [show] = await db
			.select({
				title: series.title,
				originalTitle: series.originalTitle,
				preferOriginalTitle: series.preferOriginalTitle
			})
			.from(series)
			.where(eq(series.id, seriesId))
			.limit(1);
		if (!show) return null;
		const files = await db
			.select({
				id: episodeFiles.id,
				relativePath: episodeFiles.relativePath,
				size: episodeFiles.size,
				seasonNumber: episodeFiles.seasonNumber
			})
			.from(episodeFiles)
			.where(eq(episodeFiles.seriesId, seriesId));
		return this.inspect(
			seriesArchiveDirectory(show),
			[],
			files.map((file) => ({
				id: file.id,
				relativePath: file.relativePath,
				size: file.size,
				archivePath: `${seasonArchiveDirectory(file.seasonNumber)}/${basename(file.relativePath)}`
			}))
		);
	}

	private async inspect(
		mediaDirectory: string,
		legacyDirectories: CandidateDirectory[],
		mediaFiles: MediaFileReference[]
	): Promise<MediaArchiveStatus> {
		const records = await db.select().from(archivers).where(eq(archivers.enabled, true));
		const candidateDirectories: CandidateDirectory[] = [
			{ path: mediaDirectory },
			...legacyDirectories.filter((candidate) => candidate.path !== mediaDirectory)
		];
		const idsByFileName = new Map<string, string[]>();
		const filesByArchivePath = new Map<string, MediaFileReference[]>();
		for (const file of mediaFiles) {
			const fileName = basename(file.relativePath);
			idsByFileName.set(fileName, [...(idsByFileName.get(fileName) ?? []), file.id]);
			const archivePath = this.normalizeRemotePath(file.archivePath);
			filesByArchivePath.set(archivePath, [...(filesByArchivePath.get(archivePath) ?? []), file]);
		}
		const results = await Promise.all(
			records.map(async (record): Promise<ArchivePresence> => {
				const client = new RcloneClient(record);
				let firstError: string | null = null;
				const matchedPaths: string[] = [];
				const archivedFileIds = new Set<string>();
				for (const directory of candidateDirectories) {
					try {
						const files = await client.listFiles(directory.path);
						if (files.length > 0) matchedPaths.push(directory.path);
						for (const file of files) {
							if (directory.fileId) {
								const expected = mediaFiles.find((candidate) => candidate.id === directory.fileId);
								if (expected && this.sizeMatches(expected, file)) archivedFileIds.add(expected.id);
								continue;
							}
							const path = this.normalizeRemotePath(file.Path ?? file.Name ?? '');
							for (const expected of filesByArchivePath.get(path) ?? []) {
								if (this.sizeMatches(expected, file)) archivedFileIds.add(expected.id);
							}
						}
					} catch (error) {
						const message = error instanceof Error ? error.message : String(error);
						const missing = /not found|directory not found|doesn't exist|does not exist/i.test(
							message
						);
						if (!missing && firstError === null) firstError = message;
					}
				}
				if (mediaFiles.length > 0) {
					try {
						const wantedNames = new Set(idsByFileName.keys());
						const rootMatches = (await client.listFiles('', false)).filter((file) =>
							wantedNames.has(file.Name ?? basename(file.Path ?? ''))
						);
						if (rootMatches.length > 0) matchedPaths.push('');
						for (const file of rootMatches) {
							for (const id of idsByFileName.get(file.Name ?? basename(file.Path ?? '')) ?? []) {
								const expected = mediaFiles.find((candidate) => candidate.id === id);
								if (expected && this.sizeMatches(expected, file)) archivedFileIds.add(id);
							}
						}
					} catch (error) {
						const message = error instanceof Error ? error.message : String(error);
						if (firstError === null) firstError = message;
					}
				}
				const matchedFiles = mediaFiles.filter((file) => archivedFileIds.has(file.id));
				return {
					archiverId: record.id,
					archiverName: record.name,
					path: mediaDirectory,
					matchedPaths,
					archivedFileIds: [...archivedFileIds],
					fileCount: matchedFiles.length,
					totalBytes: matchedFiles.reduce((total, file) => total + (file.size ?? 0), 0),
					error: firstError
				};
			})
		);
		const archivedFileIds = [...new Set(results.flatMap((result) => result.archivedFileIds))];
		return {
			archived: results.some((result) => result.fileCount > 0),
			totalFiles: results.reduce((total, result) => total + result.fileCount, 0),
			totalBytes: results.reduce((total, result) => total + result.totalBytes, 0),
			archivedFileIds,
			archivers: results
		};
	}

	private legacyFileDirectory(relativePath: string): string {
		return safeArchiveSegment(basename(relativePath, extname(relativePath)));
	}

	private normalizeRemotePath(value: string): string {
		return value.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
	}

	private sizeMatches(expected: MediaFileReference, actual: RcloneListItem): boolean {
		return expected.size === null || actual.Size === undefined || actual.Size === expected.size;
	}
}

let statusService: ArchiveStatusService | null = null;
export function getArchiveStatusService(): ArchiveStatusService {
	statusService ??= new ArchiveStatusService();
	return statusService;
}
