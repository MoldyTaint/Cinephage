import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { backfillMissingQuality } from '$lib/server/library/quality-backfill.js';
import { createChildLogger } from '$lib/logging';

const logger = createChildLogger({ module: 'LibraryBackfillQualityApi', logDomain: 'scans' });

/**
 * POST /api/library/backfill-quality
 *
 * Backfills quality data for files that have NULL quality.
 * Parses quality information from the filename and updates the database.
 */
export const POST: RequestHandler = async () => {
	try {
		logger.info('[API] Starting quality backfill');
		const result = await backfillMissingQuality();

		return json({
			success: true,
			...result
		});
	} catch (error) {
		logger.error('[API] Quality backfill failed', error instanceof Error ? error : undefined);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
