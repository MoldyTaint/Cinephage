/**
 * Stream Resolve Endpoint - TV Episodes
 * Extracts stream from providers and returns HLS playlist directly
 * (Jellyfin doesn't follow redirects for .strm files)
 *
 * GET /api/streaming/resolve/tv/[tmdbId]/[season]/[episode]
 */

import type { RequestHandler } from './$types';
import { fetchAndRewritePlaylist } from '$lib/server/streaming/utils';
import { StreamWorker, streamWorkerRegistry, workerManager } from '$lib/server/workers';
import { getPreferredLanguagesForSeries } from '$lib/server/streaming/language-profile-helper';
import { filterStreamsByLanguage } from '$lib/server/streaming/providers/language-utils';
import { logger } from '$lib/logging';

const streamLog = { logCategory: 'streams' as const };

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
			// Start the worker in background (it will wait for complete/fail)
			workerManager.spawnInBackground(worker);
		} catch (e) {
			// Concurrency limit reached - still process request, just without worker tracking
			worker.log(
				'warn',
				`Could not create worker: ${e instanceof Error ? e.message : 'Unknown error'}`
			);
			worker = undefined as unknown as StreamWorker;
		}
	}

	worker?.extractionStarted();

	try {
		// Dynamic imports to isolate any module loading errors
		const { extractStreams, streamCache, getBestQualityStreamUrl, getBaseUrlAsync } =
			await import('$lib/server/streaming');
		const baseUrl = await getBaseUrlAsync(request);

		// Cache key stores { rawUrl, referer } as JSON for direct fetching
		const cacheKey = `stream:tv:${tmdbId}:${seasonNum}:${episodeNum}:best`;
		const cachedJson = streamCache.get(cacheKey);

		if (cachedJson) {
			try {
				const cached = JSON.parse(cachedJson) as { rawUrl: string; referer: string };
				worker?.cacheHit();
				// Fetch the playlist directly and rewrite URLs for proxy
				return await fetchAndRewritePlaylist(cached.rawUrl, cached.referer, baseUrl);
			} catch {
				// Invalid cache entry, continue with extraction
			}
		}

		// Try to get metadata from TMDB (optional - but needed for anime providers)
		let imdbId: string | undefined;
		let title: string | undefined;
		let year: number | undefined;
		let alternativeTitles: string[] | undefined;

		try {
			const { tmdb } = await import('$lib/server/tmdb');

			// Fetch external IDs
			const externalIds = await tmdb.getTvExternalIds(tmdbIdNum);
			imdbId = externalIds.imdb_id || undefined;

			// Fetch show details for title and year (needed for AnimeKai, AniList resolution)
			const showDetails = await tmdb.getTVShow(tmdbIdNum);
			title = showDetails.name;
			year = showDetails.first_air_date
				? parseInt(showDetails.first_air_date.substring(0, 4), 10)
				: undefined;

			// Use original name as alternative title if different (common for anime)
			if (showDetails.original_name && showDetails.original_name !== showDetails.name) {
				alternativeTitles = [showDetails.original_name];
			}
		} catch {
			// TMDB lookup failed - extraction can still work for non-anime providers
		}

		// Get user's preferred languages for stream selection
		let preferredLanguages: string[] = [];
		try {
			preferredLanguages = await getPreferredLanguagesForSeries(tmdbIdNum);
		} catch {
			// Language profile lookup failed - continue without language preference
		}

		// Extract streams from providers
		const result = await extractStreams({
			tmdbId,
			type: 'tv',
			season: seasonNum,
			episode: episodeNum,
			imdbId,
			title,
			year,
			alternativeTitles,
			preferredLanguages
		});

		if (!result.success || result.sources.length === 0) {
			worker?.fail(result.error || 'No sources found');
			return errorResponse(
				`Stream extraction failed: ${result.error || 'No sources found'}`,
				'EXTRACTION_FAILED',
				503
			);
		}

		// Separate streams by language preference: try matching first, fallback second
		const { matching, fallback } = filterStreamsByLanguage(result.sources, preferredLanguages);

		logger.debug('Stream sources by language', {
			tmdbId: tmdbIdNum,
			season: seasonNum,
			episode: episodeNum,
			preferredLanguages,
			matchingCount: matching.length,
			fallbackCount: fallback.length,
			...streamLog
		});

		const errors: string[] = [];

		// Try ALL matching language streams first
		for (const source of matching) {
			try {
				const bestResult = await getBestQualityStreamUrl(source.url, source.referer);

				const response = await fetchAndRewritePlaylist(bestResult.rawUrl, source.referer, baseUrl);

				// Success with preferred language
				logger.info('Using stream source', {
					provider: source.provider,
					server: source.server,
					language: source.language,
					quality: source.quality,
					title: source.title,
					...streamLog
				});
				worker?.extractionSucceeded(source.provider || 'unknown', source.quality);
				streamCache.set(
					cacheKey,
					JSON.stringify({ rawUrl: bestResult.rawUrl, referer: source.referer })
				);
				return response;
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				errors.push(`${source.provider}: ${msg}`);
			}
		}

		// Only try fallback streams if ALL matching streams failed
		if (fallback.length > 0) {
			logger.warn('No matching language streams worked, trying fallback', {
				tmdbId: tmdbIdNum,
				season: seasonNum,
				episode: episodeNum,
				preferredLanguages,
				triedMatching: matching.length,
				remainingFallback: fallback.length,
				...streamLog
			});

			for (const source of fallback) {
				try {
					const bestResult = await getBestQualityStreamUrl(source.url, source.referer);

					const response = await fetchAndRewritePlaylist(
						bestResult.rawUrl,
						source.referer,
						baseUrl
					);

					// Success with fallback language
					logger.info('Using fallback language stream', {
						tmdbId: tmdbIdNum,
						language: source.language || 'unknown',
						preferredLanguages,
						provider: source.provider,
						...streamLog
					});
					worker?.extractionSucceeded(source.provider || 'unknown', source.quality);
					streamCache.set(
						cacheKey,
						JSON.stringify({ rawUrl: bestResult.rawUrl, referer: source.referer })
					);
					return response;
				} catch (error) {
					const msg = error instanceof Error ? error.message : String(error);
					errors.push(`${source.provider}: ${msg}`);
				}
			}
		}

		// All sources failed
		worker?.fail('All stream sources failed');
		return errorResponse(
			`All stream sources failed: ${errors.join('; ')}`,
			'ALL_SOURCES_FAILED',
			503
		);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		worker?.fail(errorMessage);
		return errorResponse(`Stream extraction error: ${errorMessage}`, 'INTERNAL_ERROR', 500);
	}
};
