import type { RequestHandler } from './$types';

function redirectToNativeEndpoint(request: Request): Response {
	const target = new URL(request.url);
	target.pathname = target.pathname.replace(/\/master\.m3u8$/, '');
	return new Response(null, { status: 307, headers: { Location: target.toString() } });
}

export const GET: RequestHandler = async ({ request }) => redirectToNativeEndpoint(request);

export const HEAD: RequestHandler = async ({ request }) => redirectToNativeEndpoint(request);
