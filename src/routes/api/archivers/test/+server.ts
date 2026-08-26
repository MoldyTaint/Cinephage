import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { requireAdmin } from '$lib/server/auth/authorization.js';
import { parseBody } from '$lib/server/api/validate.js';
import { getArchiverManager } from '$lib/server/archivers/index.js';
import { archiverTestSchema } from '$lib/validation/schemas.js';

export const POST: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;
	const input = await parseBody(event.request, archiverTestSchema);
	return json(await getArchiverManager().testConfig(input));
};
