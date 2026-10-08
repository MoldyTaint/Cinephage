import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '#lib/server/auth/authorization.js';
import { requireArrCompatEnabled } from '#lib/server/arr/requireArrCompatEnabled.js';
import { buildMovieLookup } from '#lib/server/arr/movies.js';

/** GET /api/radarr/api/v3/movie/lookup?term=... */
export const GET: RequestHandler = async (event) => {
	const disabledError = requireArrCompatEnabled();
	if (disabledError) return disabledError;

	const authError = requireAdmin(event);
	if (authError) return authError;

	const term = event.url.searchParams.get('term')?.trim();
	if (!term) return json([]);

	return json(await buildMovieLookup(term));
};
