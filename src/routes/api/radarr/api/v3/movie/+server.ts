import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth/authorization.js';
import { requireArrCompatEnabled } from '$lib/server/arr/requireArrCompatEnabled.js';
import { buildMovies } from '$lib/server/arr/movies.js';
import { addMovieFromArr } from '$lib/server/arr/libraryWrite.js';
import { withForwardedApiKey } from '$lib/server/arr/internalFetch.js';

/** GET /api/radarr/api/v3/movie */
export const GET: RequestHandler = async (event) => {
	const disabledError = requireArrCompatEnabled();
	if (disabledError) return disabledError;

	const authError = requireAdmin(event);
	if (authError) return authError;

	return json(await buildMovies());
};

/**
 * POST /api/radarr/api/v3/movie - the actual "Request" action: add a movie
 * to the library. See libraryWrite.ts for the real add flow this reuses.
 */
export const POST: RequestHandler = async (event) => {
	const disabledError = requireArrCompatEnabled();
	if (disabledError) return disabledError;

	const authError = requireAdmin(event);
	if (authError) return authError;

	const body = await event.request.json().catch(() => ({}));
	const result = await addMovieFromArr(withForwardedApiKey(event), body);
	return json(result.body, { status: result.status });
};
