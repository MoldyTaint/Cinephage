import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth/authorization.js';
import { syncProwlarrIndexers } from '$lib/server/indexers/prowlarr/ProwlarrConnectionService.js';

/** POST - trigger an immediate Prowlarr sync */
export const POST: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	try {
		const result = await syncProwlarrIndexers();
		return json({ success: true, result });
	} catch (err) {
		return json({ error: err instanceof Error ? err.message : 'Sync failed' }, { status: 500 });
	}
};
