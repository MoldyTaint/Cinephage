import type { RequestHandler } from './$types';
import { getPlaybackSessionStore, getSessionProxyService } from '$lib/server/streaming';

/**
 * GET /api/streaming/session/{token}/dash/[...path]
 *
 * Serves a DASH segment/init resource referenced by a rewritten MPD. The path
 * is relative to the session's MPD directory; the upstream URL is
 * reconstructed from the session's entryUrl origin and proxied with the
 * session's signed headers (e.g. CloudFront cookies) and Range passthrough.
 */
export const GET: RequestHandler = async ({ params, request }) => {
	const session = getPlaybackSessionStore().getSession(params.token);
	if (!session) {
		return new Response(JSON.stringify({ error: 'Streaming session not found' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const rawPath = params.path ?? '';
	const segments = rawPath.split('/').filter(Boolean);
	if (segments.length === 0 || segments.some((part) => part === '..')) {
		return new Response(JSON.stringify({ error: 'Invalid DASH resource path' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	let upstreamUrl: string;
	try {
		const entry = new URL(session.entryUrl);
		const mpdDir = entry.pathname.substring(0, entry.pathname.lastIndexOf('/') + 1);
		upstreamUrl = new URL(`${mpdDir}${segments.join('/')}`, entry.origin).toString();
	} catch {
		return new Response(JSON.stringify({ error: 'Invalid DASH resource path' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	return await getSessionProxyService().renderDashResource(session, upstreamUrl, request);
};

export const HEAD: RequestHandler = async ({ params, request }) => {
	const response = await GET({ params, request } as Parameters<RequestHandler>[0]);
	return new Response(null, {
		status: response.status,
		headers: response.headers
	});
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
