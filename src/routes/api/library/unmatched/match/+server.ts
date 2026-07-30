import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { unmatchedFileService } from '$lib/server/library/unmatched-file-service.js';
import { logger } from '$lib/logging';
import { parseBody } from '$lib/server/api/validate.js';
import { unmatchedMatchSchema } from '$lib/validation/schemas.js';
import { libraryMediaEvents } from '$lib/server/library/LibraryMediaEvents.js';

export const POST: RequestHandler = async ({ request }: { request: Request }) => {
	try {
		const { fileIds, tmdbId, mediaType, season, episode, episodeMapping } = await parseBody(
			request,
			unmatchedMatchSchema
		);

		const result = await unmatchedFileService.matchFiles({
			fileIds,
			tmdbId,
			mediaType,
			season,
			episode,
			episodeMapping
		});

		const firstError = result.errors.length > 0 ? result.errors[0] : undefined;

		if (result.matched > 0) {
			libraryMediaEvents.emitLibraryDataChanged({
				source: mediaType === 'tv' ? 'series' : 'movie',
				reason: 'unmatched-matched'
			});
		}

		return json({
			success: result.matched > 0,
			error: result.matched === 0 ? firstError : undefined,
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
		logger.error(
			{ error: error instanceof Error ? error.message : String(error) },
			'[API] Error matching files'
		);
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
