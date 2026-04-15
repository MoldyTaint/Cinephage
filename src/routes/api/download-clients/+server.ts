import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDownloadClientManager } from '$lib/server/downloadClients/DownloadClientManager';
import { downloadClientCreateSchema } from '$lib/validation/schemas';
import { requireAdmin } from '$lib/server/auth/authorization.js';
import { parseBody } from '$lib/server/api/validate.js';

/**
 * GET /api/download-clients
 * List all configured download clients.
 * Note: Passwords are redacted for security.
 */
export const GET: RequestHandler = async () => {
	const manager = getDownloadClientManager();
	const clients = await manager.getClients();

	// Password is already excluded from DownloadClient type (only hasPassword boolean is included)
	return json(clients);
};

/**
 * POST /api/download-clients
 * Create a new download client.
 */
export const POST: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	const { request } = event;
	const validated = await parseBody(request, downloadClientCreateSchema);

	const manager = getDownloadClientManager();

	const created = await manager.createClient({
		name: validated.name,
		implementation: validated.implementation,
		enabled: validated.enabled,
		host: validated.host,
		port: validated.port,
		useSsl: validated.useSsl,
		urlBase: validated.urlBase,
		mountMode: validated.mountMode,
		username: validated.username,
		password: validated.password,
		movieCategory: validated.movieCategory,
		tvCategory: validated.tvCategory,
		recentPriority: validated.recentPriority,
		olderPriority: validated.olderPriority,
		initialState: validated.initialState,
		seedRatioLimit: validated.seedRatioLimit,
		seedTimeLimit: validated.seedTimeLimit,
		downloadPathLocal: validated.downloadPathLocal,
		downloadPathRemote: validated.downloadPathRemote,
		tempPathLocal: validated.tempPathLocal,
		tempPathRemote: validated.tempPathRemote,
		priority: validated.priority
	});

	return json({ success: true, client: created });
};
