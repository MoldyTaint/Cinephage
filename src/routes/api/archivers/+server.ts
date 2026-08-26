import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { requireAdmin } from '$lib/server/auth/authorization.js';
import { parseBody } from '$lib/server/api/validate.js';
import { getArchiverManager } from '$lib/server/archivers/index.js';
import { archiverCreateSchema } from '$lib/validation/schemas.js';

export const GET: RequestHandler = async ({ url }) => {
	const manager = getArchiverManager();
	return json({
		success: true,
		archivers: await manager.list(url.searchParams.get('enabled') === 'true')
	});
};

export const POST: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;
	const input = await parseBody(event.request, archiverCreateSchema);
	const manager = getArchiverManager();
	if (input.enabled) {
		const result = await manager.testConfig(input);
		if (!result.success) {
			return json(
				{ success: false, error: `Connection test failed: ${result.error}` },
				{ status: 400 }
			);
		}
	}
	return json({ success: true, archiver: await manager.create(input) });
};
