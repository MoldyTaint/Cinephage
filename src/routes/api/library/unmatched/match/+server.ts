import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { unmatchedFileService } from '$lib/server/library/unmatched-file-service.js';
import { logger } from '$lib/logging';
import { parseBody } from '$lib/server/api/validate.js';
import { unmatchedMatchSchema } from '$lib/validation/schemas.js';

export const POST: RequestHandler = async ({ request }: { request: Request }) => {
	try {
		const { fileIds, tmdbId, mediaType, season, episodeMapping } = await parseBody(
			request,
			unmatchedMatchSchema
		);

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
