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
import {
	getBaseUrlAsync,
	getPlaybackSessionService,
	getSessionProxyService
} from '$lib/server/streaming';
import { logger } from '$lib/logging';
import { z } from 'zod';

const streamLog = { logDomain: 'streams' as const };

/**
 * Request schema for stream verification
 */
const verifyRequestSchema = z.object({
	tmdbId: z.number().int().positive(),
	type: z.enum(['movie', 'tv']),
	season: z.number().int().positive().optional(),
	episode: z.number().int().positive().optional()
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
		provider?: string;
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

		const startedAt = Date.now();
		const { tmdbId, type, season, episode } = parsed.data;
		const sessionResult = await getPlaybackSessionService().createOrReuseSession({
			tmdbId,
			type,
			season,
			episode,
			forceRefresh: true
		});

		if (!sessionResult.session) {
			logger.warn(
				{
					tmdbId,
					type,
					season,
					episode,
					error: sessionResult.error || 'Playback session unavailable',
					...streamLog
				},
				'Stream verification could not create a playback session'
			);
			return json(
				{
					success: false,
					error: sessionResult.error || 'Playback session unavailable'
				},
				{ status: 503 }
			);
		}

		const baseUrl = await getBaseUrlAsync(request);
		const proxyService = getSessionProxyService();
		const launchResponse = await proxyService.renderLaunchResponse(
			sessionResult.session,
			baseUrl,
			undefined,
			request
		);

		const playable = launchResponse.ok;
		const launchUrl =
			type === 'movie'
				? `${baseUrl}/api/streaming/session/movie/${tmdbId}/master.m3u8`
				: `${baseUrl}/api/streaming/session/tv/${tmdbId}/${season}/${episode}/master.m3u8`;

		const response: StreamVerifyResponse = {
			success: true,
			url: launchUrl,
			validation: {
				valid: playable,
				playable,
				responseTime: Date.now() - startedAt,
				error: playable ? undefined : `HTTP ${launchResponse.status}`,
				provider: sessionResult.session.provider
			}
		};

		logger.debug(
			{
				sessionToken: sessionResult.session.token,
				tmdbId,
				type,
				season,
				episode,
				launchUrl,
				responseTimeMs: Date.now() - startedAt,
				valid: playable,
				playable,
				provider: sessionResult.session.provider,
				...streamLog
			},
			'Stream verification completed'
		);

		return json(response);
	} catch (error) {
		logger.error(
			{
				err: error,
				...streamLog
			},
			'Stream verification failed'
		);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Verification failed'
			},
			{ status: 500 }
		);
	}
};
