/**
 * Wraps `event.fetch` so internal, same-origin calls this layer makes to
 * other authenticated Cinephage routes (`/api/library/movies`,
 * `/api/search`, `/api/download/grab`, ...) carry the arr-compat request's
 * own API key.
 *
 * `event.fetch` re-enters SvelteKit's full request pipeline as a new
 * request - it does not automatically carry the original request's custom
 * headers (only cookies get special same-origin handling). Without this,
 * every such internal call gets rejected by hooks.server.ts's own
 * top-level `/api/*` auth gate (event.locals.user is unset for that inner,
 * header-less request), which surfaces as a generic "Unauthorized" from
 * whatever real endpoint we're reusing - not a 404, not a validation
 * error, just an opaque auth failure that has nothing to do with the
 * actual request. Confirmed via a real Jellyseerr/Overseerr "add movie"
 * request that reached Cinephage fine (verified via direct reproduction)
 * but failed here.
 */

type FetchFn = typeof fetch;

/**
 * Extracts the API key the same way hooks.server.ts does (header first,
 * then the `apikey`/`api_key` query params real arr clients also use), and
 * returns a fetch function that attaches it to every call.
 */
export function withForwardedApiKey(event: {
	request: Request;
	url: URL;
	fetch: FetchFn;
}): FetchFn {
	const apiKey =
		event.request.headers.get('x-api-key') ??
		event.url.searchParams.get('apikey') ??
		event.url.searchParams.get('api_key');

	if (!apiKey) return event.fetch;

	return (async (input: RequestInfo | URL, init: RequestInit = {}) => {
		const headers = new Headers(init.headers);
		headers.set('x-api-key', apiKey);
		return event.fetch(input, { ...init, headers });
	}) as FetchFn;
}
