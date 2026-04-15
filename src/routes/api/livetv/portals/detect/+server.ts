/**
 * Live TV Portal Detection API
 *
 * POST /api/livetv/portals/detect - Detect portal type from URL
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getStalkerPortalManager } from '$lib/server/livetv/stalker';
import { stalkerPortalDetectSchema } from '$lib/validation/schemas';
import { logger } from '$lib/logging';

/**
 * Detect portal type from URL
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();

		// Validate input
		const parsed = stalkerPortalDetectSchema.safeParse(body);
		if (!parsed.success) {
			return json(
				{
					error: 'Validation failed',
					details: parsed.error.flatten().fieldErrors
				},
				{ status: 400 }
			);
		}

		const manager = getStalkerPortalManager();
		const result = await manager.detectPortalType(parsed.data.url);

		return json(result);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);

		logger.error({ error: message }, '[API] Failed to detect portal type');

		return json(
			{
				success: false,
				error: 'Failed to detect portal type'
			},
			{ status: 500 }
		);
	}
};
