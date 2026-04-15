import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDownloadClientManager } from '$lib/server/downloadClients/DownloadClientManager';
import { downloadClientUpdateSchema } from '$lib/validation/schemas';
import { assertFound, parseBody } from '$lib/server/api/validate';
import { NotFoundError } from '$lib/errors';
import { requireAdmin } from '$lib/server/auth/authorization.js';

/**
 * GET /api/download-clients/[id]
 * Get a single download client.
 */
export const GET: RequestHandler = async ({ params }) => {
	const manager = getDownloadClientManager();
	const client = await manager.getClient(params.id);

	// Throws NotFoundError if client is null, handled by hooks.server.ts
	return json(assertFound(client, 'Download client', params.id));
};

/**
 * PUT /api/download-clients/[id]
 * Update a download client.
 */
export const PUT: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	const { params, request } = event;
	// Throws ValidationError if invalid JSON or schema mismatch
	const data = await parseBody(request, downloadClientUpdateSchema);
	const manager = getDownloadClientManager();

	try {
		const updated = await manager.updateClient(params.id, data);
		return json({ success: true, client: updated });
	} catch (error) {
		// Re-throw as NotFoundError for proper status code
		if (error instanceof Error && error.message.includes('not found')) {
			throw new NotFoundError('Download client', params.id);
		}
		throw error;
	}
};

/**
 * DELETE /api/download-clients/[id]
 * Delete a download client.
 */
export const DELETE: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	const { params } = event;
	const manager = getDownloadClientManager();

	try {
		await manager.deleteClient(params.id);
		return json({ success: true });
	} catch (error) {
		// Re-throw as NotFoundError for proper status code
		if (error instanceof Error && error.message.includes('not found')) {
			throw new NotFoundError('Download client', params.id);
		}
		throw error;
	}
};
