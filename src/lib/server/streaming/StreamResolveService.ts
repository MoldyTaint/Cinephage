/**
 * Stream Resolve Service
 *
 * Unified service for resolving streams from providers.
 * Features:
 * - Computes metadata requirements based on enabled providers
 * - Fetches only required metadata in parallel
 * - Uses first-success-wins extraction pattern
 * - Handles language preference filtering
 * - Caches successful stream results
 */

import { logger } from '$lib/logging';
import { streamCache } from './cache';
import { getBestQualityStreamUrl } from './hls';
import { getAvailableProviders } from './providers';
import { filterStreamsByLanguage } from './providers/language-utils';
import type { MetadataRequirements } from './types/provider';
import type { StreamSource, StreamSubtitle } from './types/stream';
import { fetchAndRewritePlaylist } from './utils';

const streamLog = { logCategory: 'streams' as const };

/** Parameters for stream resolution */
export interface ResolveParams {
	tmdbId: number;
	type: 'movie' | 'tv';
	season?: number;
	episode?: number;
	baseUrl: string;
}

/** Cached stream data including subtitles */
interface CachedStream {
	rawUrl: string;
	referer: string;
	subtitles?: StreamSubtitle[];
}

/** Metadata fetched from TMDB */
interface TmdbMetadata {
	imdbId?: string;
	title?: string;
	year?: number;
	alternativeTitles?: string[];
}

/** Result of metadata requirements computation */
interface MetadataNeeds {
	imdbId: boolean;
	title: boolean;
	year: boolean;
	alternativeTitles: boolean;
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
 * Compute what metadata is needed based on enabled providers
 */
function computeMetadataNeeds(): MetadataNeeds {
	const providers = getAvailableProviders().filter((p) => p.config.enabledByDefault);

	const needs: MetadataNeeds = {
		imdbId: false,
		title: false,
		year: false,
		alternativeTitles: false
	};

	for (const provider of providers) {
		const req = provider.config.requirements;
		if (req.imdbId) needs.imdbId = true;
		if (req.title) needs.title = true;
		if (req.year) needs.year = true;
		if (req.alternativeTitles) needs.alternativeTitles = true;
	}

	return needs;
}

/**
 * Fetch TMDB metadata for a movie
 */
async function fetchMovieMetadata(
	tmdbId: number,
	needs: MetadataNeeds
): Promise<TmdbMetadata> {
	const metadata: TmdbMetadata = {};

	// Skip if we don't need any metadata
	if (!needs.imdbId && !needs.title && !needs.year) {
		return metadata;
	}

	try {
		const { tmdb } = await import('$lib/server/tmdb');

		// Fetch what we need in parallel
		const promises: Promise<void>[] = [];

		if (needs.imdbId) {
			promises.push(
				tmdb.getMovieExternalIds(tmdbId).then((externalIds) => {
					metadata.imdbId = externalIds.imdb_id || undefined;
				}).catch(() => { /* ignore */ })
			);
		}

		if (needs.title || needs.year) {
			promises.push(
				tmdb.getMovie(tmdbId).then((movieDetails) => {
					metadata.title = movieDetails.title;
					metadata.year = movieDetails.release_date
						? parseInt(movieDetails.release_date.substring(0, 4), 10)
						: undefined;
				}).catch(() => { /* ignore */ })
			);
		}

		await Promise.all(promises);
	} catch {
		// TMDB lookup failed entirely
	}

	return metadata;
}

/**
 * Fetch TMDB metadata for a TV show
 */
async function fetchTvMetadata(
	tmdbId: number,
	needs: MetadataNeeds
): Promise<TmdbMetadata> {
	const metadata: TmdbMetadata = {};

	// Skip if we don't need any metadata
	if (!needs.imdbId && !needs.title && !needs.year && !needs.alternativeTitles) {
		return metadata;
	}

	try {
		const { tmdb } = await import('$lib/server/tmdb');

		// Fetch what we need in parallel
		const promises: Promise<void>[] = [];

		if (needs.imdbId) {
			promises.push(
				tmdb.getTvExternalIds(tmdbId).then((externalIds) => {
					metadata.imdbId = externalIds.imdb_id || undefined;
				}).catch(() => { /* ignore */ })
			);
		}

		if (needs.title || needs.year || needs.alternativeTitles) {
			promises.push(
				tmdb.getTVShow(tmdbId).then((showDetails) => {
					metadata.title = showDetails.name;
					metadata.year = showDetails.first_air_date
						? parseInt(showDetails.first_air_date.substring(0, 4), 10)
						: undefined;

					// Use original name as alternative title if different
					if (needs.alternativeTitles && showDetails.original_name && showDetails.original_name !== showDetails.name) {
						metadata.alternativeTitles = [showDetails.original_name];
					}
				}).catch(() => { /* ignore */ })
			);
		}

		await Promise.all(promises);
	} catch {
		// TMDB lookup failed entirely
	}

	return metadata;
}

/**
 * Get preferred languages for the content
 */
async function getPreferredLanguages(
	tmdbId: number,
	type: 'movie' | 'tv'
): Promise<string[]> {
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
	cacheKey: string
): Promise<{ response: Response; source: StreamSource } | null> {
	if (sources.length === 0) {
		return null;
	}

	const { getBestQualityStreamUrl: getBestQuality } = await import('./hls');

	// Validate all sources in parallel
	const validationPromises = sources.map(async (source): Promise<SourceValidationOutcome> => {
		try {
			const bestResult = await getBestQuality(source.url, source.referer);

			const response = await fetchAndRewritePlaylist(
				bestResult.rawUrl,
				source.referer,
				baseUrl,
				source.subtitles
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
	const { tmdbId, type, season, episode, baseUrl } = params;

	// Dynamic import to avoid circular dependencies
	const { extractStreams } = await import('./providers');

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
			return await fetchAndRewritePlaylist(
				cached.rawUrl,
				cached.referer,
				baseUrl,
				cached.subtitles
			);
		} catch {
			// Invalid cache entry, continue with extraction
		}
	}

	// Compute what metadata we need based on enabled providers
	const needs = computeMetadataNeeds();

	logger.debug('Metadata needs computed', {
		tmdbId,
		type,
		needs,
		...streamLog
	});

	// Fetch required metadata in parallel
	const metadata =
		type === 'movie'
			? await fetchMovieMetadata(tmdbId, needs)
			: await fetchTvMetadata(tmdbId, needs);

	// Get preferred languages
	const preferredLanguages = await getPreferredLanguages(tmdbId, type);

	// Extract streams from providers
	const result = await extractStreams({
		tmdbId: tmdbId.toString(),
		type,
		season,
		episode,
		imdbId: metadata.imdbId,
		title: metadata.title,
		year: metadata.year,
		alternativeTitles: metadata.alternativeTitles,
		preferredLanguages
	});

	if (!result.success || result.sources.length === 0) {
		return errorResponse(
			`Stream extraction failed: ${result.error || 'No sources found'}`,
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
	const matchingResult = await tryStreamSources(matching, baseUrl, cacheKey);
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

		const fallbackResult = await tryStreamSources(fallback, baseUrl, cacheKey);
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
