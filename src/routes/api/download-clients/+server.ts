import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDownloadClientManager } from '$lib/server/downloadClients';
import { downloadClientCreateSchema } from '$lib/validation/schemas';

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
export const POST: RequestHandler = async ({ request }) => {
	let data: unknown;
	try {
		data = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const result = downloadClientCreateSchema.safeParse(data);

	if (!result.success) {
		return json(
			{
				error: 'Validation failed',
				details: result.error.flatten()
			},
			{ status: 400 }
		);
	}

	const validated = result.data;
	const manager = getDownloadClientManager();

	try {
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
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json({ error: message }, { status: 500 });
	}
};
