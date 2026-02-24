import { tmdb } from '$lib/server/tmdb';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createChildLogger } from '$lib/logging';
import { isAppError, getErrorMessage } from '$lib/errors';
import { checkRateLimit, rateLimitHeaders } from '$lib/server/rateLimit';
import { enrichWithLibraryStatus } from '$lib/server/library/status';

/**
 * Determine media type from TMDB endpoint path for library status enrichment
 */
function getMediaTypeFromPath(path: string): 'movie' | 'tv' | 'all' {
	if (path.startsWith('movie/') || path.includes('/movie')) return 'movie';
	if (path.startsWith('tv/') || path.includes('/tv')) return 'tv';
	return 'all';
}

const handler: RequestHandler = async ({ params, url, locals, getClientAddress }) => {
	const { correlationId } = locals;
	const log = createChildLogger({ correlationId, service: 'tmdb-proxy' });

	// Rate limiting - skip in development, generous limits in production
	const isDev = import.meta.env.DEV;
	if (!isDev) {
		const clientIp = getClientAddress();
		// 1000 requests per minute is generous enough for most use cases
		const rateLimit = checkRateLimit(`tmdb:${clientIp}`, { windowMs: 60_000, maxRequests: 1000 });

		if (!rateLimit.allowed) {
			log.warn('Rate limit exceeded', { clientIp });
			return json(
				{ error: 'Rate limit exceeded', correlationId },
				{
					status: 429,
					headers: rateLimitHeaders(rateLimit)
				}
			);
		}
	}

	const path = params.path;
	if (!path) {
		log.warn('Request missing path');
		return json({ error: 'No path provided', correlationId }, { status: 400 });
	}

	// Forward query params
	const query = url.searchParams.toString();
	const endpoint = query ? `${path}?${query}` : path;

	try {
		log.debug('Proxying TMDB request', { endpoint });

		const data = await tmdb.fetch(endpoint);

		log.debug('TMDB request successful', { endpoint });

		// Enrich results with library status if this is a list response
		if (data && typeof data === 'object' && 'results' in data && Array.isArray(data.results)) {
			const mediaType = getMediaTypeFromPath(path);
			const enrichedResults = await enrichWithLibraryStatus(data.results, mediaType);
			return json({ ...data, results: enrichedResults });
		}

		return json(data);
	} catch (e) {
		const message = getErrorMessage(e);
		const statusCode = isAppError(e) ? e.statusCode : 500;

		log.error('TMDB proxy error', e, { endpoint });

		return json({ error: message, correlationId }, { status: statusCode });
	}
};

// Only expose GET — write methods (POST/PUT/DELETE) are not used
export const GET = handler;
