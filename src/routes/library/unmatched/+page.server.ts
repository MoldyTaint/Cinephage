import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { unmatchedFiles, rootFolders, movies, series } from '$lib/server/db/schema';
import { eq, sql } from 'drizzle-orm';

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

	return {
		files,
		libraryItems,
		rootFolders: rootFolderOptions,
		total: files.length
	};
};
