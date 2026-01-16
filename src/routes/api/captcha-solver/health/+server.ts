import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCaptchaSolver } from '$lib/server/captcha';
import { logger } from '$lib/logging';

/**
 * GET /api/captcha-solver/health
 * Returns health status and statistics for the captcha solver
 */
export const GET: RequestHandler = async () => {
	try {
		const solver = getCaptchaSolver();
		const health = solver.getHealth();

		return json({
			success: true,
			health
		});
	} catch (error) {
		logger.error(
			'[API] Failed to get captcha solver health',
			error instanceof Error ? error : undefined
		);
		return json(
			{
				success: false,
				error: 'Failed to get captcha solver health'
			},
			{ status: 500 }
		);
	}
};

/**
 * DELETE /api/captcha-solver/health
 * Resets statistics and clears the cache
 */
export const DELETE: RequestHandler = async () => {
	try {
		const solver = getCaptchaSolver();
		solver.resetStats();
		solver.clearCache();

		return json({
			success: true,
			message: 'Cache cleared and statistics reset'
		});
	} catch (error) {
		logger.error(
			'[API] Failed to reset captcha solver stats',
			error instanceof Error ? error : undefined
		);
		return json(
			{
				success: false,
				error: 'Failed to reset captcha solver stats'
			},
			{ status: 500 }
		);
	}
};
