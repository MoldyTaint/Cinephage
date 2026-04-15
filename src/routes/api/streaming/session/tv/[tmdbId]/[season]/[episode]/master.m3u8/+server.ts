import type { RequestHandler } from './$types';
import {
	getBaseUrlAsync,
	getPlaybackSessionService,
	getSessionProxyService
} from '$lib/server/streaming';

function errorResponse(message: string, code: string, status: number): Response {
	return new Response(JSON.stringify({ error: message, code }), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

export const GET: RequestHandler = async ({ params, request, url }) => {
	const { tmdbId, season, episode } = params;
	if (!tmdbId || !season || !episode) {
		return errorResponse('Missing parameters', 'MISSING_PARAM', 400);
	}

	if (!/^\d+$/.test(tmdbId) || !/^\d+$/.test(season) || !/^\d+$/.test(episode)) {
		return errorResponse('Invalid parameter format', 'INVALID_PARAM', 400);
	}

	const baseUrl = await getBaseUrlAsync(request);
	const apiKey = url.searchParams.get('api_key') || request.headers.get('x-api-key') || undefined;
	const playbackSessions = getPlaybackSessionService();
	const proxyService = getSessionProxyService();

	const { session, error } = await playbackSessions.createOrReuseSession({
		tmdbId: parseInt(tmdbId, 10),
		type: 'tv',
		season: parseInt(season, 10),
		episode: parseInt(episode, 10)
	});

	if (!session) {
		return errorResponse(error || 'No playable stream found', 'PLAYBACK_UNAVAILABLE', 503);
	}

	return await proxyService.renderLaunchResponse(session, baseUrl, apiKey, request);
};

export const HEAD: RequestHandler = async ({ params, request, url }) => {
	const response = await GET({ params, request, url } as Parameters<RequestHandler>[0]);
	return new Response(null, {
		status: response.status,
		headers: response.headers
	});
};
