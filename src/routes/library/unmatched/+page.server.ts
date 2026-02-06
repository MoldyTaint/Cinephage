import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { unmatchedFiles, rootFolders, movies, series } from '$lib/server/db/schema';
import { eq, sql } from 'drizzle-orm';
import { dirname, basename } from 'path';

export const load: PageServerLoad = async () => {
	const [files, movieItems, seriesItems, rootFolderOptions] = await Promise.all([
		db
			.select({
				id: unmatchedFiles.id,
				path: unmatchedFiles.path,
				rootFolderId: unmatchedFiles.rootFolderId,
				rootFolderPath: rootFolders.path,
				mediaType: unmatchedFiles.mediaType,
				size: unmatchedFiles.size,
				parsedTitle: unmatchedFiles.parsedTitle,
				parsedYear: unmatchedFiles.parsedYear,
				parsedSeason: unmatchedFiles.parsedSeason,
				parsedEpisode: unmatchedFiles.parsedEpisode,
				suggestedMatches: unmatchedFiles.suggestedMatches,
				reason: unmatchedFiles.reason,
				discoveredAt: unmatchedFiles.discoveredAt
			})
			.from(unmatchedFiles)
			.leftJoin(rootFolders, eq(unmatchedFiles.rootFolderId, rootFolders.id)),
		db
			.select({
				id: movies.id,
				title: movies.title,
				year: movies.year,
				posterPath: movies.posterPath
			})
			.from(movies).where(sql`
				${movies.rootFolderId} IS NULL
				OR ${movies.rootFolderId} = ''
				OR ${movies.rootFolderId} = 'null'
				OR NOT EXISTS (
					SELECT 1 FROM ${rootFolders} rf WHERE rf.id = ${movies.rootFolderId}
				)
				OR EXISTS (
					SELECT 1 FROM ${rootFolders} rf
					WHERE rf.id = ${movies.rootFolderId} AND rf.media_type != 'movie'
				)
			`),
		db
			.select({
				id: series.id,
				title: series.title,
				year: series.year,
				posterPath: series.posterPath
			})
			.from(series).where(sql`
				${series.rootFolderId} IS NULL
				OR ${series.rootFolderId} = ''
				OR ${series.rootFolderId} = 'null'
				OR NOT EXISTS (
					SELECT 1 FROM ${rootFolders} rf WHERE rf.id = ${series.rootFolderId}
				)
				OR EXISTS (
					SELECT 1 FROM ${rootFolders} rf
					WHERE rf.id = ${series.rootFolderId} AND rf.media_type != 'tv'
				)
			`),
		db
			.select({
				id: rootFolders.id,
				name: rootFolders.name,
				path: rootFolders.path,
				mediaType: rootFolders.mediaType
			})
			.from(rootFolders)
	]);

	const libraryItems = [
		...movieItems.map((item) => ({ ...item, mediaType: 'movie' as const })),
		...seriesItems.map((item) => ({ ...item, mediaType: 'tv' as const }))
	];

	// Group files by parent folder for folder view
	const folderMap = new Map<
		string,
		{
			folderPath: string;
			folderName: string;
			mediaType: string;
			files: typeof files;
			reasons: string[];
		}
	>();

	for (const file of files) {
		// Get the parent folder of the file
		const parentPath = dirname(file.path);
		const folderName = basename(parentPath);

		if (!folderMap.has(parentPath)) {
			folderMap.set(parentPath, {
				folderPath: parentPath,
				folderName,
				mediaType: file.mediaType,
				files: [],
				reasons: []
			});
		}

		const folder = folderMap.get(parentPath)!;
		folder.files.push(file);
		if (file.reason && !folder.reasons.includes(file.reason)) {
			folder.reasons.push(file.reason);
		}
	}

	// Convert to array and sort by file count (descending)
	const folders = Array.from(folderMap.values())
		.map((folder) => ({
			folderPath: folder.folderPath,
			folderName: folder.folderName,
			mediaType: folder.mediaType,
			fileCount: folder.files.length,
			files: folder.files,
			reasons: folder.reasons,
			commonParsedTitle: getMostCommonParsedTitle(folder.files)
		}))
		.sort((a, b) => b.fileCount - a.fileCount);

	return {
		files,
		folders,
		libraryItems,
		rootFolders: rootFolderOptions,
		total: files.length,
		totalFolders: folders.length
	};
};

/**
 * Get the most common parsed title from a list of files
 */
function getMostCommonParsedTitle(files: Array<{ parsedTitle: string | null }>): string | null {
	const titleCounts = new Map<string, number>();

	for (const file of files) {
		if (file.parsedTitle) {
			titleCounts.set(file.parsedTitle, (titleCounts.get(file.parsedTitle) || 0) + 1);
		}
	}

	let mostCommonTitle: string | null = null;
	let maxCount = 0;

	for (const [title, count] of titleCounts) {
		if (count > maxCount) {
			mostCommonTitle = title;
			maxCount = count;
		}
	}

	return mostCommonTitle;
}
