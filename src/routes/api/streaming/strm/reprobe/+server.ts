/**
 * Reprobe .strm Media Info Endpoint
 *
 * Re-extracts media info for existing .strm files by probing the URL inside the .strm.
 * Falls back to synthetic STRM defaults on failure.
 *
 * POST /api/streaming/strm/reprobe
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { movieFiles, movies, episodeFiles, series, rootFolders } from '$lib/server/db/schema';
import { mediaInfoService } from '$lib/server/library/media-info';
import { createChildLogger } from '$lib/logging';
import { eq, sql } from 'drizzle-orm';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const logger = createChildLogger({ module: 'StrmReprobeAPI' });

type ReprobeResult = {
	success: boolean;
	total: number;
	distinctTotal: number;
	updated: number;
	failed: number;
	skipped: number;
	skippedStreamer: number;
	errors: Array<{ id: string; path: string; error: string }>;
};

function resolveMediaPath(
	rootPath: string,
	parentPath: string | null,
	relativePath: string
): string {
	const cleanedParent = (parentPath ?? '').replace(/^[/\\]+/, '');
	if (
		cleanedParent &&
		(relativePath === cleanedParent || relativePath.startsWith(`${cleanedParent}/`))
	) {
		return join(rootPath, relativePath);
	}
	return join(rootPath, cleanedParent, relativePath);
}

export const POST: RequestHandler = async () => {
	try {
		const result: ReprobeResult = {
			success: true,
			total: 0,
			distinctTotal: 0,
			updated: 0,
			failed: 0,
			skipped: 0,
			skippedStreamer: 0,
			errors: []
		};
		const distinctPaths = new Set<string>();

		const strmLike = sql`lower(${movieFiles.relativePath}) like '%.strm'`;
		const movieStrmFiles = await db
			.select({
				id: movieFiles.id,
				relativePath: movieFiles.relativePath,
				moviePath: movies.path,
				rootPath: rootFolders.path,
				scoringProfileId: movies.scoringProfileId
			})
			.from(movieFiles)
			.leftJoin(movies, eq(movieFiles.movieId, movies.id))
			.leftJoin(rootFolders, eq(movies.rootFolderId, rootFolders.id))
			.where(strmLike);

		const episodeStrmFiles = await db
			.select({
				id: episodeFiles.id,
				relativePath: episodeFiles.relativePath,
				seriesPath: series.path,
				rootPath: rootFolders.path,
				scoringProfileId: series.scoringProfileId
			})
			.from(episodeFiles)
			.leftJoin(series, eq(episodeFiles.seriesId, series.id))
			.leftJoin(rootFolders, eq(series.rootFolderId, rootFolders.id))
			.where(sql`lower(${episodeFiles.relativePath}) like '%.strm'`);

		for (const file of movieStrmFiles) {
			if (!file.rootPath || !file.moviePath) {
				result.skipped += 1;
				continue;
			}
			if (file.scoringProfileId === 'streamer') {
				result.skippedStreamer += 1;
				continue;
			}
			const fullPath = resolveMediaPath(file.rootPath, file.moviePath, file.relativePath);
			if (!existsSync(fullPath)) {
				continue;
			}
			distinctPaths.add(fullPath);
			result.total += 1;
			try {
				const mediaInfo = await mediaInfoService.extractMediaInfo(fullPath);
				await db.update(movieFiles).set({ mediaInfo }).where(eq(movieFiles.id, file.id));
				result.updated += 1;
			} catch (error) {
				result.failed += 1;
				const message = error instanceof Error ? error.message : String(error);
				result.errors.push({ id: file.id, path: fullPath, error: message });
			}
		}

		for (const file of episodeStrmFiles) {
			if (!file.rootPath || !file.seriesPath) {
				result.skipped += 1;
				continue;
			}
			if (file.scoringProfileId === 'streamer') {
				result.skippedStreamer += 1;
				continue;
			}
			const fullPath = resolveMediaPath(file.rootPath, file.seriesPath, file.relativePath);
			if (!existsSync(fullPath)) {
				continue;
			}
			distinctPaths.add(fullPath);
			result.total += 1;
			try {
				const mediaInfo = await mediaInfoService.extractMediaInfo(fullPath);
				await db.update(episodeFiles).set({ mediaInfo }).where(eq(episodeFiles.id, file.id));
				result.updated += 1;
			} catch (error) {
				result.failed += 1;
				const message = error instanceof Error ? error.message : String(error);
				result.errors.push({ id: file.id, path: fullPath, error: message });
			}
		}

		logger.info('[StrmReprobeAPI] Completed', {
			total: result.total,
			distinctTotal: distinctPaths.size,
			updated: result.updated,
			failed: result.failed,
			skipped: result.skipped
		});

		result.distinctTotal = distinctPaths.size;
		return json(result);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		logger.error('[StrmReprobeAPI] Failed', { error: message });
		return json(
			{
				success: false,
				total: 0,
				distinctTotal: 0,
				updated: 0,
				failed: 0,
				skipped: 0,
				errors: [{ id: 'global', path: 'global', error: message }]
			},
			{ status: 500 }
		);
	}
};
