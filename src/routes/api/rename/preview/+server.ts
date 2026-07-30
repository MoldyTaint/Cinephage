/**
 * Bulk Rename Preview API
 *
 * GET /api/rename/preview?mediaType=movie|tv|all[&offset=N&limit=N&category=willChange]
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

const DEFAULT_PAGE_SIZE = 500;

function paginate(items: unknown[], offset: number, limit: number) {
	const start = Math.max(0, offset);
	const end = Math.min(items.length, start + limit);
	return items.slice(start, end);
}

/**
 * GET /api/rename/preview
 * Get preview of all files that would be renamed
 *
 * Query params:
 * - mediaType: 'movie' | 'tv' | 'all' (default: 'all')
 * - offset: starting index for paginated results (default: 0)
 * - limit: max items to return (default: 500)
 * - category: filter to 'willChange' | 'alreadyCorrect' | 'collisions' | 'errors' (optional)
 */
export const GET: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	const { url } = event;
	try {
		const mediaType = url.searchParams.get('mediaType') || 'all';
		const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
		const limit = Math.max(
			1,
			Math.min(
				2000,
				parseInt(url.searchParams.get('limit') || String(DEFAULT_PAGE_SIZE), 10) ||
					DEFAULT_PAGE_SIZE
			)
		);
		const category = url.searchParams.get('category') || undefined;

		const service = new RenamePreviewService();
		let result: RenamePreviewResult;

		if (mediaType === 'movie') {
			result = await service.previewAllMovies();
		} else if (mediaType === 'tv') {
			result = await service.previewAllEpisodes();
		} else {
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

		// Return counts always, but paginate item arrays to avoid sending
		// massive responses for large libraries.
		const counts = {
			totalFiles: result.totalFiles,
			totalWillChange: result.totalWillChange,
			totalAlreadyCorrect: result.totalAlreadyCorrect,
			totalCollisions: result.totalCollisions,
			totalErrors: result.totalErrors
		};

		if (category === 'willChange') {
			return json({
				success: true,
				...counts,
				items: paginate(result.willChange, offset, limit),
				offset,
				limit,
				total: result.totalWillChange
			});
		}
		if (category === 'alreadyCorrect') {
			return json({
				success: true,
				...counts,
				items: paginate(result.alreadyCorrect, offset, limit),
				offset,
				limit,
				total: result.totalAlreadyCorrect
			});
		}
		if (category === 'collisions') {
			return json({
				success: true,
				...counts,
				items: paginate(result.collisions, offset, limit),
				offset,
				limit,
				total: result.totalCollisions
			});
		}
		if (category === 'errors') {
			return json({
				success: true,
				...counts,
				items: paginate(result.errors, offset, limit),
				offset,
				limit,
				total: result.totalErrors
			});
		}

		return json({ success: true, ...result });
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
