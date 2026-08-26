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
	fileCount: number;
	totalBytes: number;
	error: string | null;
}

export interface MediaArchiveStatus {
	archived: boolean;
	totalFiles: number;
	totalBytes: number;
	archivers: ArchivePresence[];
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
			.select({ relativePath: movieFiles.relativePath })
			.from(movieFiles)
			.where(eq(movieFiles.movieId, movieId));
		return this.inspect(
			movieArchiveDirectory(movie),
			files.map((file) => this.legacyFileDirectory(file.relativePath)),
			files.map((file) => basename(file.relativePath))
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
			.select({ relativePath: episodeFiles.relativePath })
			.from(episodeFiles)
			.where(eq(episodeFiles.seriesId, seriesId));
		return this.inspect(
			seriesArchiveDirectory(show),
			[],
			files.map((file) => basename(file.relativePath))
		);
	}

	private async inspect(
		mediaDirectory: string,
		legacyDirectories: string[],
		mediaFileNames: string[]
	): Promise<MediaArchiveStatus> {
		const records = await db.select().from(archivers).where(eq(archivers.enabled, true));
		const candidateDirectories = [...new Set([mediaDirectory, ...legacyDirectories])];
		const results = await Promise.all(
			records.map(async (record): Promise<ArchivePresence> => {
				const client = new RcloneClient(record);
				let fileCount = 0;
				let totalBytes = 0;
				let firstError: string | null = null;
				const matchedPaths: string[] = [];
				for (const directory of candidateDirectories) {
					try {
						const files = await client.listFiles(directory);
						if (files.length > 0) matchedPaths.push(directory);
						fileCount += files.length;
						totalBytes += files.reduce((total, file) => total + (file.Size ?? 0), 0);
					} catch (error) {
						const message = error instanceof Error ? error.message : String(error);
						const missing = /not found|directory not found|doesn't exist|does not exist/i.test(
							message
						);
						if (!missing && firstError === null) firstError = message;
					}
				}
				if (mediaFileNames.length > 0) {
					try {
						const wantedNames = new Set(mediaFileNames);
						const rootMatches = (await client.listFiles('', false)).filter((file) =>
							wantedNames.has(file.Name ?? basename(file.Path ?? ''))
						);
						if (rootMatches.length > 0) matchedPaths.push('');
						fileCount += rootMatches.length;
						totalBytes += rootMatches.reduce((total, file) => total + (file.Size ?? 0), 0);
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
					fileCount,
					totalBytes,
					error: firstError
				};
			})
		);
		return {
			archived: results.some((result) => result.fileCount > 0),
			totalFiles: results.reduce((total, result) => total + result.fileCount, 0),
			totalBytes: results.reduce((total, result) => total + result.totalBytes, 0),
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
