import type { RequestHandler } from './$types';
import { getPlaybackSessionStore, getSessionProxyService } from '$lib/server/streaming';

export const GET: RequestHandler = async ({ params, request }) => {
	const session = getPlaybackSessionStore().getSession(params.token);
	if (!session) {
		return new Response(JSON.stringify({ error: 'Streaming session not found' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	return await getSessionProxyService().renderDirectResponse(session, request);
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
