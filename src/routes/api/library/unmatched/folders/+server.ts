import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { db } from '$lib/server/db/index.js';
import { unmatchedFiles, rootFolders } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { dirname, basename } from 'path';
import { logger } from '$lib/logging';

/**
 * GET /api/library/unmatched/folders
 * List all unmatched files grouped by parent folder
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const mediaType = url.searchParams.get('mediaType'); // 'movie' | 'tv' | null

		const query = db
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
			.leftJoin(rootFolders, eq(unmatchedFiles.rootFolderId, rootFolders.id));

		const files = mediaType
			? await query.where(eq(unmatchedFiles.mediaType, mediaType))
			: await query;

		// Group files by parent folder
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
				// Get the most common parsed title for the folder
				commonParsedTitle: getMostCommonParsedTitle(folder.files)
			}))
			.sort((a, b) => b.fileCount - a.fileCount);

		return json({
			success: true,
			folders,
			totalFolders: folders.length,
			totalFiles: files.length
		});
	} catch (error) {
		logger.error(
			'[API] Error fetching unmatched folders',
			error instanceof Error ? error : undefined
		);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to fetch unmatched folders'
			},
			{ status: 500 }
		);
	}
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
