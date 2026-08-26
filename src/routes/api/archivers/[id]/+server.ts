import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { requireAdmin } from '$lib/server/auth/authorization.js';
import { parseBody } from '$lib/server/api/validate.js';
import { getArchiverManager } from '$lib/server/archivers/index.js';
import { archiverUpdateSchema } from '$lib/validation/schemas.js';

export const PUT: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;
	const manager = getArchiverManager();
	const existing = await manager.getRecord(event.params.id);
	if (!existing) return json({ success: false, error: 'Archiver not found' }, { status: 404 });
	const input = await parseBody(event.request, archiverUpdateSchema);
	const effective = {
		...existing,
		...input,
		password: input.password || existing.password
	};
	if (effective.enabled) {
		const result = await manager.testConfig(effective);
		if (!result.success) {
			return json(
				{ success: false, error: `Connection test failed: ${result.error}` },
				{ status: 400 }
			);
		}
	}
	if (!input.password) delete input.password;
	return json({
		success: true,
		archiver: await manager.update(event.params.id, input)
	});
};

export const DELETE: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;
	const deleted = await getArchiverManager().delete(event.params.id);
	return deleted
		? json({ success: true })
		: json({ success: false, error: 'Archiver not found' }, { status: 404 });
};
