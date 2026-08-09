import type { RequestHandler } from './$types';
import {
	getBaseUrlAsync,
	getPlaybackSessionService,
	getSessionProxyService,
	type PlaybackSession
} from '$lib/server/streaming';

function errorResponse(message: string, code: string, status: number): Response {
	return new Response(JSON.stringify({ error: message, code }), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

async function resolveEpisodeSession(
	tmdbId: string,
	season: string,
	episode: string
): Promise<{
	session: PlaybackSession | null;
	error?: string;
	invalid?: boolean;
	code?: string;
}> {
	if (!tmdbId || !season || !episode) {
		return { session: null, error: 'Missing parameters', invalid: true, code: 'MISSING_PARAM' };
	}
	if (!/^\d+$/.test(tmdbId) || !/^\d+$/.test(season) || !/^\d+$/.test(episode)) {
		return {
			session: null,
			error: 'Invalid parameter format',
			invalid: true,
			code: 'INVALID_PARAM'
		};
	}
	return getPlaybackSessionService().createOrReuseSession({
		tmdbId: parseInt(tmdbId, 10),
		type: 'tv',
		season: parseInt(season, 10),
		episode: parseInt(episode, 10)
	});
}

/**
 * GET /api/streaming/session/tv/{tmdbId}/{season}/{episode}
 *
 * Source-aware launch entry for .strm files. The path deliberately has no
 * `.m3u` suffix so media servers (Jellyfin) treat the source as remuxable —
 * Jellyfin's SupportsDirectStream rejects any HTTP path containing `.m3u`.
 * mp4 sources stream as progressive mp4; HLS sources get the rewritten
 * playlist (identified by Content-Type).
 */
export const GET: RequestHandler = async ({ params, request, url }) => {
	const { session, error, invalid, code } = await resolveEpisodeSession(
		params.tmdbId,
		params.season,
		params.episode
	);
	if (invalid) {
		return errorResponse(error || 'Invalid parameters', code || 'INVALID_PARAM', 400);
	}
	if (!session) {
		return errorResponse(error || 'No playable stream found', 'PLAYBACK_UNAVAILABLE', 503);
	}

	const baseUrl = await getBaseUrlAsync(request);
	const apiKey = url.searchParams.get('api_key') || request.headers.get('x-api-key') || undefined;

	return await getSessionProxyService().renderLaunchMedia(session, baseUrl, apiKey, request);
};

export const HEAD: RequestHandler = async ({ params, request }) => {
	const { session, error, invalid, code } = await resolveEpisodeSession(
		params.tmdbId,
		params.season,
		params.episode
	);
	if (invalid) {
		return errorResponse(error || 'Invalid parameters', code || 'INVALID_PARAM', 400);
	}
	if (!session) {
		return errorResponse(error || 'No playable stream found', 'PLAYBACK_UNAVAILABLE', 503);
	}

	return await getSessionProxyService().renderHeadResponse(session, request);
};

export const OPTIONS: RequestHandler = async () => {
	return new Response(null, {
		status: 200,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, OPTIONS, HEAD',
			'Access-Control-Allow-Headers': 'Range, Content-Type'
		}
	});
};
