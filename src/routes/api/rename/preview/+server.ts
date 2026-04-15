/**
 * Bulk Rename Preview API
 *
 * GET /api/rename/preview?mediaType=movie|tv|all
 * Returns a preview of all files that would be renamed based on current naming settings.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	RenamePreviewService,
	type RenamePreviewResult
} from '$lib/server/library/naming/RenamePreviewService';
import { logger } from '$lib/logging';
import { requireAdmin } from '$lib/server/auth/authorization.js';

/**
 * GET /api/rename/preview
 * Get preview of all files that would be renamed
 *
 * Query params:
 * - mediaType: 'movie' | 'tv' | 'all' (default: 'all')
 */
export const GET: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	const { url } = event;
	try {
		const mediaType = url.searchParams.get('mediaType') || 'all';

		const service = new RenamePreviewService();
		let result: RenamePreviewResult;

		if (mediaType === 'movie') {
			result = await service.previewAllMovies();
		} else if (mediaType === 'tv') {
			result = await service.previewAllEpisodes();
		} else {
			// All: combine movies and episodes
			const movieResult = await service.previewAllMovies();
			const episodeResult = await service.previewAllEpisodes();

			result = {
				willChange: [...movieResult.willChange, ...episodeResult.willChange],
				alreadyCorrect: [...movieResult.alreadyCorrect, ...episodeResult.alreadyCorrect],
				collisions: [...movieResult.collisions, ...episodeResult.collisions],
				errors: [...movieResult.errors, ...episodeResult.errors],
				totalFiles: movieResult.totalFiles + episodeResult.totalFiles,
				totalWillChange: movieResult.totalWillChange + episodeResult.totalWillChange,
				totalAlreadyCorrect: movieResult.totalAlreadyCorrect + episodeResult.totalAlreadyCorrect,
				totalCollisions: movieResult.totalCollisions + episodeResult.totalCollisions,
				totalErrors: movieResult.totalErrors + episodeResult.totalErrors
			};
		}

		return json(result);
	} catch (error) {
		logger.error(
			{
				error: error instanceof Error ? error.message : String(error)
			},
			'[RenamePreview API] Failed to generate preview'
		);

		return json(
			{
				error: 'Failed to generate rename preview',
				details: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
