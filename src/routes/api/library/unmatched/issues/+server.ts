import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { db } from '$lib/server/db/index.js';
import { movies, rootFolders, series } from '$lib/server/db/schema.js';
import { sql } from 'drizzle-orm';
import { logger } from '$lib/logging';
import type { LibraryIssue, RootFolderOption } from '$lib/types/unmatched.js';

/**
 * GET /api/library/unmatched/issues
 * Return library items with missing/invalid root folder assignments.
 */
export const GET: RequestHandler = async () => {
	try {
		const [movieItems, seriesItems, rootFolderOptions] = await Promise.all([
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

		const libraryItems: LibraryIssue[] = [
			...movieItems.map((item) => ({
				...item,
				mediaType: 'movie' as const,
				issue: 'missing_root_folder' as const
			})),
			...seriesItems.map((item) => ({
				...item,
				mediaType: 'tv' as const,
				issue: 'missing_root_folder' as const
			}))
		];

		return json({
			success: true,
			data: {
				libraryItems,
				rootFolders: rootFolderOptions as RootFolderOption[],
				total: libraryItems.length
			},
			meta: {
				timestamp: new Date().toISOString()
			}
		});
	} catch (error) {
		logger.error(
			'[API] Error fetching unmatched library issues',
			error instanceof Error ? error : undefined
		);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to fetch library issues',
				data: null
			},
			{ status: 500 }
		);
	}
};
