import { basename, extname } from 'node:path';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { archivers, episodeFiles, movieFiles, movies, series } from '$lib/server/db/schema.js';
import { RcloneClient } from './RcloneClient.js';
import {
	movieArchiveDirectory,
	safeArchiveSegment,
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
			.select({ id: movieFiles.id, relativePath: movieFiles.relativePath })
			.from(movieFiles)
			.where(eq(movieFiles.movieId, movieId));
		return this.inspect(
			movieArchiveDirectory(movie),
			files.map((file) => ({
				path: this.legacyFileDirectory(file.relativePath),
				fileId: file.id
			})),
			files
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
			.select({ id: episodeFiles.id, relativePath: episodeFiles.relativePath })
			.from(episodeFiles)
			.where(eq(episodeFiles.seriesId, seriesId));
		return this.inspect(seriesArchiveDirectory(show), [], files);
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
		for (const file of mediaFiles) {
			const fileName = basename(file.relativePath);
			idsByFileName.set(fileName, [...(idsByFileName.get(fileName) ?? []), file.id]);
		}
		const results = await Promise.all(
			records.map(async (record): Promise<ArchivePresence> => {
				const client = new RcloneClient(record);
				let fileCount = 0;
				let totalBytes = 0;
				let firstError: string | null = null;
				const matchedPaths: string[] = [];
				const archivedFileIds = new Set<string>();
				for (const directory of candidateDirectories) {
					try {
						const files = await client.listFiles(directory.path);
						if (files.length > 0) matchedPaths.push(directory.path);
						fileCount += files.length;
						totalBytes += files.reduce((total, file) => total + (file.Size ?? 0), 0);
						if (directory.fileId && files.length > 0) archivedFileIds.add(directory.fileId);
						for (const file of files) {
							for (const id of idsByFileName.get(file.Name ?? basename(file.Path ?? '')) ?? []) {
								archivedFileIds.add(id);
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
						fileCount += rootMatches.length;
						totalBytes += rootMatches.reduce((total, file) => total + (file.Size ?? 0), 0);
						for (const file of rootMatches) {
							for (const id of idsByFileName.get(file.Name ?? basename(file.Path ?? '')) ?? []) {
								archivedFileIds.add(id);
							}
						}
					} catch (error) {
						const message = error instanceof Error ? error.message : String(error);
						if (firstError === null) firstError = message;
					}
				}
				return {
					archiverId: record.id,
					archiverName: record.name,
					path: mediaDirectory,
					matchedPaths,
					archivedFileIds: [...archivedFileIds],
					fileCount,
					totalBytes,
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
}

let statusService: ArchiveStatusService | null = null;
export function getArchiveStatusService(): ArchiveStatusService {
	statusService ??= new ArchiveStatusService();
	return statusService;
}
