/**
 * Stream Resolve Endpoint - Movies
 * Extracts stream from providers and returns HLS playlist directly
 * (Jellyfin doesn't follow redirects for .strm files)
 *
 * GET /api/streaming/resolve/movie/[tmdbId]
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
	const tmdbId = params.tmdbId;

	if (!tmdbId) {
		return errorResponse('Missing TMDB ID', 'MISSING_PARAM', 400);
	}

	// Validate tmdbId is numeric
	if (!/^\d+$/.test(tmdbId)) {
		return errorResponse('Invalid TMDB ID format', 'INVALID_PARAM', 400);
	}

	const tmdbIdNum = parseInt(tmdbId, 10);

	// Create or find existing stream worker for this media
	let worker = streamWorkerRegistry.findByMedia(tmdbIdNum, 'movie');

	if (!worker) {
		worker = new StreamWorker({
			mediaType: 'movie',
			tmdbId: tmdbIdNum
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
			type: 'movie',
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
