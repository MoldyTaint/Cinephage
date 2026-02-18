import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDownloadClientManager } from '$lib/server/downloadClients/DownloadClientManager';
import { toFriendlyDownloadClientError } from '$lib/downloadClients/errorMessages';

/**
 * POST /api/download-clients/[id]/test
 * Test an existing download client using stored credentials.
 */
export const POST: RequestHandler = async ({ params }) => {
	const manager = getDownloadClientManager();
	const result = await manager.testClientById(params.id);

	if (result.success) {
		return json(result);
	}

	const status = result.error?.includes('not found') ? 404 : 400;
	return json(
		{
			...result,
			error: toFriendlyDownloadClientError(result.error)
		},
		{ status }
	);
};
