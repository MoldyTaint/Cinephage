/**
 * Stream Prefetch API Endpoint
 *
 * POST /api/streaming/prefetch - Trigger a prefetch cycle
 * GET /api/streaming/prefetch/status - Get prefetch service status
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getStreamPrefetchService } from '$lib/server/streaming/prefetch';
import { logger } from '$lib/logging';

const streamLog = { logCategory: 'streams' as const };

/**
 * POST - Trigger a stream prefetch cycle
 *
 * Body (optional):
 * - movies: number (default 10) - Number of movies to prefetch
 * - episodes: number (default 10) - Number of episodes to prefetch
 *
 * Returns prefetch results
 */
export const POST: RequestHandler = async ({ request }) => {
	const prefetchService = getStreamPrefetchService();

	if (prefetchService.running) {
		return json(
			{
				success: false,
				error: 'Prefetch cycle already running'
			},
			{ status: 409 }
		);
	}

	// Start prefetch cycle
	logger.info('Stream prefetch cycle triggered via API', streamLog);

	try {
		const results = await prefetchService.runPrefetchCycle();

		const movieSuccess = results.movies.filter((r) => r.success).length;
		const movieCached = results.movies.filter((r) => r.cached).length;
		const episodeSuccess = results.episodes.filter((r) => r.success).length;
		const episodeCached = results.episodes.filter((r) => r.cached).length;

		return json({
			success: true,
			results: {
				movies: {
					processed: results.movies.length,
					success: movieSuccess,
					alreadyCached: movieCached,
					failed: results.movies.length - movieSuccess
				},
				episodes: {
					processed: results.episodes.length,
					success: episodeSuccess,
					alreadyCached: episodeCached,
					failed: results.episodes.length - episodeSuccess
				}
			}
		});
	} catch (error) {
		logger.error('Stream prefetch cycle failed', {
			error: error instanceof Error ? error.message : String(error),
			...streamLog
		});

		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Prefetch failed'
			},
			{ status: 500 }
		);
	}
};

/**
 * GET - Get prefetch service status
 */
export const GET: RequestHandler = async () => {
	const prefetchService = getStreamPrefetchService();

	return json({
		running: prefetchService.running
	});
};
