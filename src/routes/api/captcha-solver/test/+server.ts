import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCaptchaSolver } from '$lib/server/captcha';
import { z } from 'zod';
import { logger } from '$lib/logging';

/**
 * Schema for test request
 */
const testRequestSchema = z.object({
	url: z.string().url()
});

/**
 * POST /api/captcha-solver/test
 * Test captcha solving for a URL
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const validation = testRequestSchema.safeParse(body);

		if (!validation.success) {
			return json(
				{
					success: false,
					error: 'Invalid request body',
					details: validation.error.issues
				},
				{ status: 400 }
			);
		}

		const { url } = validation.data;
		const solver = getCaptchaSolver();

		// First, test if there's a challenge
		logger.info('[API] Testing for challenge', { url });
		const testResult = await solver.test(url);

		if (!testResult.hasChallenge) {
			return json({
				success: true,
				hasChallenge: false,
				message: 'No challenge detected for this URL'
			});
		}

		// Try to solve it
		logger.info('[API] Challenge detected, attempting solve', {
			url,
			type: testResult.type,
			confidence: testResult.confidence
		});

		const solveResult = await solver.solve({ url });

		return json({
			success: solveResult.success,
			hasChallenge: true,
			challengeType: testResult.type,
			confidence: testResult.confidence,
			solveTimeMs: solveResult.solveTimeMs,
			cookiesObtained: solveResult.cookies.length,
			userAgent: solveResult.userAgent,
			error: solveResult.error
		});
	} catch (error) {
		logger.error('[API] Failed to test captcha solver', error instanceof Error ? error : undefined);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to test captcha solver'
			},
			{ status: 500 }
		);
	}
};
