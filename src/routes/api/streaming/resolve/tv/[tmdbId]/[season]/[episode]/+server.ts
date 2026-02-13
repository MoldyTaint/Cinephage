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
	const url = new URL(request.url);
	const isPrefetch =
		url.searchParams.get('prefetch') === '1' || request.headers.get('x-prefetch') === 'true';

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

	// Prefetch requests should not consume worker slots
	let worker: StreamWorker | undefined;
	if (!isPrefetch) {
		worker = streamWorkerRegistry.findByMedia(tmdbIdNum, 'tv', seasonNum, episodeNum);

		if (!worker) {
			const newWorker = new StreamWorker({
				mediaType: 'tv',
				tmdbId: tmdbIdNum,
				season: seasonNum,
				episode: episodeNum
			});

			try {
				workerManager.spawnInBackground(newWorker);
				streamWorkerRegistry.register(newWorker);
				worker = newWorker;
			} catch (e) {
				newWorker.log(
					'warn',
					`Could not create worker: ${e instanceof Error ? e.message : 'Unknown error'}`
				);
				worker = undefined;
			}
		}

		worker?.extractionStarted();
	}

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
			worker?.complete();
			if (worker) {
				streamWorkerRegistry.unregister(worker);
			}
		} else {
			const body = await response
				.clone()
				.json()
				.catch(() => ({ error: 'Unknown error' }));
			worker?.fail(body.error || 'Stream resolution failed');
			if (worker) {
				streamWorkerRegistry.unregister(worker);
			}
		}

		return response;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		worker?.fail(errorMessage);
		if (worker) {
			streamWorkerRegistry.unregister(worker);
		}
		return errorResponse(`Stream extraction error: ${errorMessage}`, 'INTERNAL_ERROR', 500);
	}
};
