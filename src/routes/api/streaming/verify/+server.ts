/**
 * Stream Verification API Endpoint
 *
 * Validates that a stream URL is playable.
 * Useful for checking stream health before playback.
 *
 * POST /api/streaming/verify - Verify a stream URL
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getStreamValidator, quickValidateStream } from '$lib/server/streaming/validation';
import type { StreamSource } from '$lib/server/streaming/types';
import { logger } from '$lib/logging';
import { z } from 'zod';
import { resolveAndValidateUrl } from '$lib/server/http/ssrf-protection';

const streamLog = { logCategory: 'streams' as const };

/**
 * Request schema for stream verification
 */
const verifyRequestSchema = z.object({
	url: z.string().url(),
	referer: z.string().optional(),
	quick: z.boolean().optional().default(false),
	timeout: z.number().min(1000).max(30000).optional().default(10000),
	validateSegments: z.boolean().optional().default(false)
});

/**
 * Response structure for stream verification
 */
export interface StreamVerifyResponse {
	success: boolean;
	url: string;
	validation: {
		valid: boolean;
		playable: boolean;
		responseTime?: number;
		error?: string;
		variantCount?: number;
	};
}

/**
 * POST /api/streaming/verify
 * Verify that a stream URL is playable
 *
 * Request body:
 * {
 *   url: string,           // Stream URL to verify
 *   referer?: string,      // Optional referer header
 *   quick?: boolean,       // Quick validation only (default: false)
 *   timeout?: number,      // Validation timeout in ms (default: 10000)
 *   validateSegments?: boolean  // Also validate segments (default: false)
 * }
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const parsed = verifyRequestSchema.safeParse(body);

		if (!parsed.success) {
			return json(
				{
					success: false,
					error: 'Invalid request',
					details: parsed.error.flatten().fieldErrors
				},
				{ status: 400 }
			);
		}

		const { url, referer, quick, timeout, validateSegments } = parsed.data;

		// SSRF protection: validate URL before making any requests
		const safetyCheck = await resolveAndValidateUrl(url);
		if (!safetyCheck.safe) {
			logger.warn('Blocked unsafe verify URL', {
				url,
				reason: safetyCheck.reason,
				...streamLog
			});
			return json(
				{ success: false, error: 'URL not allowed', reason: safetyCheck.reason },
				{ status: 403 }
			);
		}

		logger.debug('Verifying stream URL', { url, quick, timeout, ...streamLog });

		// Quick validation just checks if URL is reachable
		if (quick) {
			const isValid = await quickValidateStream(url, referer, timeout);
			return json({
				success: true,
				url,
				validation: {
					valid: isValid,
					playable: isValid
				}
			});
		}

		// Full validation
		const validator = getStreamValidator();
		const source: StreamSource = {
			url,
			referer: referer ?? '',
			quality: 'unknown',
			title: 'Verification',
			type: 'hls',
			requiresSegmentProxy: false
		};

		const validation = await validator.validateStream(source, {
			timeout,
			validateSegments
		});

		const response: StreamVerifyResponse = {
			success: true,
			url,
			validation: {
				valid: validation.valid,
				playable: validation.playable,
				responseTime: validation.responseTime,
				error: validation.error,
				variantCount: validation.variantCount
			}
		};

		logger.debug('Stream verification complete', {
			url,
			valid: validation.valid,
			playable: validation.playable,
			...streamLog
		});

		return json(response);
	} catch (error) {
		logger.error('Stream verification failed', error, streamLog);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Verification failed'
			},
			{ status: 500 }
		);
	}
};
