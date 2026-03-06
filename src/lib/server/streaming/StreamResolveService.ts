/**
 * Stream Resolve Service
 *
 * Unified service for resolving streams from the Cinephage backend.
 * Features:
 * - Uses the built-in `cinephage-stream` indexer configuration
 * - Resolves streams from the Cinephage API
 * - Uses first-success-wins validation
 * - Handles language preference filtering
 * - Caches successful stream results
 */

import { logger } from '$lib/logging';
import { getCinephageBackendClient } from '$lib/server/indexers/streaming/CinephageBackendClient';
import { streamCache } from './cache';
import { filterStreamsByLanguage } from './providers/language-utils';
import type { StreamSource, StreamSubtitle, StreamType } from './types/stream';
import { fetchAndRewritePlaylist } from './utils';

const streamLog = { logCategory: 'streams' as const };

/** Parameters for stream resolution */
export interface ResolveParams {
	tmdbId: number;
	type: 'movie' | 'tv';
	season?: number;
	episode?: number;
	baseUrl: string;
	apiKey?: string;
}

/** Cached stream data including subtitles */
interface CachedStream {
	rawUrl: string;
	referer: string;
	type: StreamType;
	subtitles?: StreamSubtitle[];
}

/**
 * Create JSON error response
 */
function errorResponse(message: string, code: string, status: number): Response {
	return new Response(JSON.stringify({ error: message, code }), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

/**
 * Build a proxied response for direct file streams such as MP4.
 */
function createDirectStreamResponse(url: string, baseUrl: string, referer: string): Response {
	const proxyUrl = new URL('/api/streaming/proxy/direct.mp4', baseUrl);
	proxyUrl.searchParams.set('url', url);
	proxyUrl.searchParams.set('referer', referer);

	return Response.redirect(proxyUrl.toString(), 307);
}

/**
 * Get preferred languages for the content
 */
async function getPreferredLanguages(tmdbId: number, type: 'movie' | 'tv'): Promise<string[]> {
	try {
		if (type === 'movie') {
			const { getPreferredLanguagesForMovie } = await import('./language-profile-helper');
			return await getPreferredLanguagesForMovie(tmdbId);
		} else {
			const { getPreferredLanguagesForSeries } = await import('./language-profile-helper');
			return await getPreferredLanguagesForSeries(tmdbId);
		}
	} catch {
		return [];
	}
}

/** Result of validating a single stream source */
interface SourceValidationResult {
	success: true;
	response: Response;
	source: StreamSource;
	rawUrl: string;
}

interface SourceValidationFailure {
	success: false;
}

type SourceValidationOutcome = SourceValidationResult | SourceValidationFailure;

/**
 * Try sources in parallel and return first successful stream (first-success-wins pattern)
 * This is much faster than sequential validation when sources fail - we don't wait for each timeout
 */
async function tryStreamSources(
	sources: StreamSource[],
	baseUrl: string,
	cacheKey: string,
	apiKey?: string
): Promise<{ response: Response; source: StreamSource } | null> {
	if (sources.length === 0) {
		return null;
	}

	const { getBestQualityStreamUrl: getBestQuality } = await import('./hls');

	// Validate all sources in parallel
	const validationPromises = sources.map(async (source): Promise<SourceValidationOutcome> => {
		try {
			if (source.type === 'mp4') {
				return {
					success: true,
					response: createDirectStreamResponse(source.url, baseUrl, source.referer),
					source,
					rawUrl: source.url
				};
			}

			const bestResult = await getBestQuality(source.url, source.referer);

			const response = await fetchAndRewritePlaylist(
				bestResult.rawUrl,
				source.referer,
				baseUrl,
				source.subtitles,
				apiKey
			);

			return { success: true, response, source, rawUrl: bestResult.rawUrl };
		} catch {
			return { success: false };
		}
	});

	// First-success-wins pattern: return as soon as any source succeeds
	let hasWinner = false;

	const winnerPromise = new Promise<SourceValidationResult | null>((resolve) => {
		let completedCount = 0;

		for (const promise of validationPromises) {
			promise.then((outcome) => {
				completedCount++;

				// If this succeeded and we don't have a winner yet, this is the winner
				if (outcome.success && !hasWinner) {
					hasWinner = true;

					// Log subtitle availability
					if (outcome.source.subtitles?.length) {
						logger.info('Stream has subtitles', {
							provider: outcome.source.provider,
							subtitleCount: outcome.source.subtitles.length,
							languages: outcome.source.subtitles.map((s) => s.language),
							...streamLog
						});
					}

					// Cache the successful stream
					const cacheData: CachedStream = {
						rawUrl: outcome.rawUrl,
						referer: outcome.source.referer,
						type: outcome.source.type,
						subtitles: outcome.source.subtitles
					};
					streamCache.set(cacheKey, JSON.stringify(cacheData));

					resolve(outcome);
				}

				// If all sources have completed and none succeeded, resolve with null
				if (completedCount === sources.length && !hasWinner) {
					resolve(null);
				}
			});
		}
	});

	const winner = await winnerPromise;
	return winner ? { response: winner.response, source: winner.source } : null;
}

/**
 * Resolve a stream for the given content
 *
 * This is the main entry point for stream resolution. It:
 * 1. Checks cache for existing stream
 * 2. Computes what metadata is needed based on enabled providers
 * 3. Fetches required metadata in parallel
 * 4. Extracts streams from providers
 * 5. Filters by language preference
 * 6. Returns first working stream
 */
export async function resolveStream(params: ResolveParams): Promise<Response> {
	const { tmdbId, type, season, episode, baseUrl, apiKey } = params;
	const cinephageBackend = getCinephageBackendClient();

	// Compute cache key
	const cacheKey =
		type === 'movie'
			? `stream:movie:${tmdbId}:best`
			: `stream:tv:${tmdbId}:${season}:${episode}:best`;

	// Check cache first
	const cachedJson = streamCache.get(cacheKey);
	if (cachedJson) {
		try {
			const cached = JSON.parse(cachedJson) as CachedStream;
			logger.debug('Cache hit for stream', { cacheKey, ...streamLog });

			if (cached.type === 'mp4') {
				return createDirectStreamResponse(cached.rawUrl, baseUrl, cached.referer);
			}

			return await fetchAndRewritePlaylist(
				cached.rawUrl,
				cached.referer,
				baseUrl,
				cached.subtitles,
				apiKey
			);
		} catch {
			// Invalid cache entry, continue with extraction
		}
	}

	// Get preferred languages
	const preferredLanguages = await getPreferredLanguages(tmdbId, type);

	// Resolve streams from the Cinephage backend
	const result = await cinephageBackend.getStreams({
		tmdbId,
		type,
		season,
		episode
	});

	if (!result.success || result.sources.length === 0) {
		return errorResponse(
			`Stream resolution failed: ${result.error || 'No sources found'}`,
			'EXTRACTION_FAILED',
			503
		);
	}

	// Filter streams by language preference
	const { matching, fallback } = filterStreamsByLanguage(result.sources, preferredLanguages);

	logger.debug('Stream sources by language', {
		tmdbId,
		type,
		preferredLanguages,
		matchingCount: matching.length,
		fallbackCount: fallback.length,
		...streamLog
	});

	// Try matching language streams first
	const matchingResult = await tryStreamSources(matching, baseUrl, cacheKey, apiKey);
	if (matchingResult) {
		logger.info('Using stream source', {
			provider: matchingResult.source.provider,
			server: matchingResult.source.server,
			language: matchingResult.source.language,
			quality: matchingResult.source.quality,
			hasSubtitles: (matchingResult.source.subtitles?.length ?? 0) > 0,
			...streamLog
		});
		return matchingResult.response;
	}

	// Try fallback streams if matching failed
	if (fallback.length > 0) {
		logger.warn('No matching language streams worked, trying fallback', {
			tmdbId,
			preferredLanguages,
			triedMatching: matching.length,
			...streamLog
		});

		const fallbackResult = await tryStreamSources(fallback, baseUrl, cacheKey, apiKey);
		if (fallbackResult) {
			logger.info('Using fallback language stream', {
				provider: fallbackResult.source.provider,
				language: fallbackResult.source.language,
				...streamLog
			});
			return fallbackResult.response;
		}
	}

	// All sources failed
	return errorResponse('All stream sources failed', 'ALL_SOURCES_FAILED', 503);
}
