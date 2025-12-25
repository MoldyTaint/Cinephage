/**
 * Stream Resolve Endpoint - TV Episodes
 * Extracts stream from providers and returns HLS playlist directly
 * (Jellyfin doesn't follow redirects for .strm files)
 *
 * GET /api/streaming/resolve/tv/[tmdbId]/[season]/[episode]
 */

import type { RequestHandler } from './$types';
import { StreamWorker, streamWorkerRegistry, workerManager } from '$lib/server/workers';

/** Create JSON error response */
function errorResponse(message: string, code: string, status: number): Response {
	return new Response(JSON.stringify({ error: message, code }), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

export const GET: RequestHandler = async ({ params, request }) => {
	const { tmdbId, season, episode } = params;

	if (!tmdbId || !season || !episode) {
		return errorResponse('Missing parameters', 'MISSING_PARAM', 400);
	}

	// Validate all params are numeric
	if (!/^\d+$/.test(tmdbId) || !/^\d+$/.test(season) || !/^\d+$/.test(episode)) {
		return errorResponse('Invalid parameter format', 'INVALID_PARAM', 400);
	}

	const tmdbIdNum = parseInt(tmdbId, 10);
	const seasonNum = parseInt(season, 10);
	const episodeNum = parseInt(episode, 10);

	// Create or find existing stream worker for this media
	let worker = streamWorkerRegistry.findByMedia(tmdbIdNum, 'tv', seasonNum, episodeNum);

	if (!worker) {
		worker = new StreamWorker({
			mediaType: 'tv',
			tmdbId: tmdbIdNum,
			season: seasonNum,
			episode: episodeNum
		});

		try {
			workerManager.spawn(worker);
			streamWorkerRegistry.register(worker);
			workerManager.spawnInBackground(worker);
		} catch (e) {
			worker.log(
				'warn',
				`Could not create worker: ${e instanceof Error ? e.message : 'Unknown error'}`
			);
			worker = undefined as unknown as StreamWorker;
		}
	}

	worker?.extractionStarted();

	try {
		const { resolveStream, getBaseUrlAsync } = await import('$lib/server/streaming');
		const baseUrl = await getBaseUrlAsync(request);

		const response = await resolveStream({
			tmdbId: tmdbIdNum,
			type: 'tv',
			season: seasonNum,
			episode: episodeNum,
			baseUrl
		});

		// Track success/failure in worker
		if (response.ok) {
			worker?.extractionSucceeded('streaming', 'auto');
		} else {
			const body = await response.clone().json().catch(() => ({ error: 'Unknown error' }));
			worker?.fail(body.error || 'Stream resolution failed');
		}

		return response;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		worker?.fail(errorMessage);
		return errorResponse(`Stream extraction error: ${errorMessage}`, 'INTERNAL_ERROR', 500);
	}
};
