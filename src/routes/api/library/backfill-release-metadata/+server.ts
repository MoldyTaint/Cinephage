import { json } from '@sveltejs/kit';
import { logger } from '$lib/logging';
import { backfillReleaseMetadata } from '$lib/server/library/release-metadata-backfill.js';

export async function POST({ request }: { request: Request }) {
	try {
		const body = await request.json().catch(() => ({}));
		const apply = body?.apply === true;
		const sampleLimit = typeof body?.sampleLimit === 'number' ? body.sampleLimit : 50;

		logger.info({ apply, sampleLimit }, '[API] Starting release metadata backfill');
		const result = await backfillReleaseMetadata({ apply, sampleLimit });

		return json({
			success: true,
			...result
		});
	} catch (error) {
		logger.error(
			'[API] Release metadata backfill failed',
			error instanceof Error ? error : undefined
		);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
}
