/**
 * Live TV Accounts API
 *
 * GET  /api/livetv/accounts - List all Live TV accounts
 * POST /api/livetv/accounts - Create a new Live TV account
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getLiveTvAccountManager } from '$lib/server/livetv/LiveTvAccountManager';
import { logger } from '$lib/logging';
import { liveTvAccountCreateSchema } from '$lib/validation/schemas.js';
import { isAppError } from '$lib/errors';

/**
 * List all Live TV accounts
 */
export const GET: RequestHandler = async () => {
	const manager = getLiveTvAccountManager();
	const accounts = await manager.getAccounts();

	return json({
		success: true,
		accounts
	});
};

/**
 * Create a new Live TV account
 */
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();

	// Validate input
	const parsed = liveTvAccountCreateSchema.safeParse(body);
	if (!parsed.success) {
		return json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
	}

	const manager = getLiveTvAccountManager();

	// Check if testFirst is explicitly set to false
	const testFirst = parsed.data.testFirst;

	try {
		const account = await manager.createAccount(parsed.data, testFirst);

		return json(
			{
				success: true,
				account
			},
			{ status: 201 }
		);
	} catch (error) {
		logger.error(
			'[API] Failed to create Live TV account',
			error instanceof Error ? error : undefined
		);

		// Re-throw ValidationError and AppError for central handler
		if (isAppError(error)) {
			throw error;
		}

		const message = error instanceof Error ? error.message : String(error);

		// Connection test failures return specific error
		if (message.includes('Connection test failed')) {
			return json(
				{
					success: false,
					error: message
				},
				{ status: 400 }
			);
		}

		// Unique constraint violation
		if (message.includes('UNIQUE constraint failed')) {
			return json(
				{
					success: false,
					error: 'An account with this configuration already exists'
				},
				{ status: 409 }
			);
		}

		// Generic error - don't leak details
		return json(
			{
				success: false,
				error: 'Failed to create account'
			},
			{ status: 500 }
		);
	}
};
