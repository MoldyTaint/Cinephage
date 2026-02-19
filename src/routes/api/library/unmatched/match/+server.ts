import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { unmatchedFileService } from '$lib/server/library/unmatched-file-service.js';
import { logger } from '$lib/logging';
import type { MatchRequest } from '$lib/types/unmatched.js';

/**
 * POST /api/library/unmatched/match
 * Match one or more unmatched files to a TMDB entry
 *
 * This endpoint replaces the old separate endpoints for:
 * - /api/library/unmatched/[id] (single match)
 * - /api/library/unmatched/folder-match (folder match)
 * - /api/library/unmatched/batch-match (batch match)
 *
 * Request body:
 * - fileIds: string[] (required) - Array of file IDs to match
 * - tmdbId: number (required) - TMDB ID to match to
 * - mediaType: 'movie' | 'tv' (required)
 * - season?: number - Default season for TV shows
 * - episodeMapping?: { [fileId: string]: { season: number; episode: number } } - Per-file overrides
 */
export const POST: RequestHandler = async ({ request }: { request: Request }) => {
	try {
		const body = await request.json();
		const { fileIds, tmdbId, mediaType, season, episodeMapping } = body as MatchRequest;

		// Validation
		if (!Array.isArray(fileIds) || fileIds.length === 0) {
			return json(
				{
					success: false,
					error: 'fileIds array is required and must not be empty',
					data: null
				},
				{ status: 400 }
			);
		}

		if (!tmdbId || typeof tmdbId !== 'number') {
			return json(
				{ success: false, error: 'tmdbId is required and must be a number', data: null },
				{ status: 400 }
			);
		}

		if (!mediaType || !['movie', 'tv'].includes(mediaType)) {
			return json(
				{ success: false, error: 'mediaType must be "movie" or "tv"', data: null },
				{ status: 400 }
			);
		}

		// Perform the match
		const result = await unmatchedFileService.matchFiles({
			fileIds,
			tmdbId,
			mediaType,
			season,
			episodeMapping
		});

		return json({
			success: result.matched > 0,
			data: result,
			meta: {
				timestamp: new Date().toISOString(),
				request: {
					fileCount: fileIds.length,
					tmdbId,
					mediaType
				}
			}
		});
	} catch (error) {
		logger.error('[API] Error matching files', error instanceof Error ? error : undefined);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to match files',
				data: null
			},
			{ status: 500 }
		);
	}
};
