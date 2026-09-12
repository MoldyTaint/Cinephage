import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth/authorization.js';
import { requireArrCompatEnabled } from '$lib/server/arr/requireArrCompatEnabled.js';
import { buildSeries } from '$lib/server/arr/series.js';
import { addSeriesFromArr } from '$lib/server/arr/libraryWrite.js';
import { withForwardedApiKey } from '$lib/server/arr/internalFetch.js';

/** GET /api/sonarr/api/v3/series */
export const GET: RequestHandler = async (event) => {
	const disabledError = requireArrCompatEnabled();
	if (disabledError) return disabledError;

	const authError = requireAdmin(event);
	if (authError) return authError;

	return json(await buildSeries());
};

/**
 * POST /api/sonarr/api/v3/series - the actual "Request" action: add a
 * series to the library. See libraryWrite.ts for the real add flow this
 * reuses.
 */
export const POST: RequestHandler = async (event) => {
	const disabledError = requireArrCompatEnabled();
	if (disabledError) return disabledError;

	const authError = requireAdmin(event);
	if (authError) return authError;

	const body = await event.request.json().catch(() => ({}));
	const result = await addSeriesFromArr(withForwardedApiKey(event), body);
	return json(result.body, { status: result.status });
};
