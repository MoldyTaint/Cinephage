/**
 * Live TV Portals API
 *
 * GET  /api/livetv/portals - List all saved portals
 * POST /api/livetv/portals - Create a new portal
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getStalkerPortalManager } from '$lib/server/livetv/stalker';
import { stalkerPortalCreateSchema } from '$lib/validation/schemas';
import { logger } from '$lib/logging';
import { ValidationError } from '$lib/errors';

/**
 * List all portals
 */
export const GET: RequestHandler = async () => {
	try {
		const manager = getStalkerPortalManager();
		const portals = await manager.getPortals();

		return json({
			success: true,
			portals
		});
	} catch (error) {
		logger.error('[API] Failed to list portals', error instanceof Error ? error : undefined);

		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to list portals'
			},
			{ status: 500 }
		);
	}
};

/**
 * Create a new portal
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();

		// Validate input
		const parsed = stalkerPortalCreateSchema.safeParse(body);
		if (!parsed.success) {
			throw new ValidationError('Validation failed', {
				details: parsed.error.flatten()
			});
		}

		const manager = getStalkerPortalManager();

		// Check if detectType is explicitly set to false
		const detectType = body.detectType !== false;

		const portal = await manager.createPortal(parsed.data, detectType);

		return json(
			{
				success: true,
				portal
			},
			{ status: 201 }
		);
	} catch (error) {
		logger.error('[API] Failed to create portal', error instanceof Error ? error : undefined);

		// Validation errors
		if (error instanceof ValidationError) {
			return json(
				{
					success: false,
					error: error.message,
					code: error.code,
					context: error.context
				},
				{ status: error.statusCode }
			);
		}

		const message = error instanceof Error ? error.message : String(error);

		// Duplicate URL
		if (message.includes('already exists')) {
			return json(
				{
					success: false,
					error: message
				},
				{ status: 409 }
			);
		}

		// Unique constraint violation
		if (message.includes('UNIQUE constraint failed')) {
			return json(
				{
					success: false,
					error: 'A portal with this URL already exists'
				},
				{ status: 409 }
			);
		}

		return json(
			{
				success: false,
				error: message || 'Failed to create portal'
			},
			{ status: 500 }
		);
	}
};
