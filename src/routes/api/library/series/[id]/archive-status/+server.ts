import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getArchiveStatusService } from '$lib/server/archivers/ArchiveStatusService.js';

export const GET: RequestHandler = async ({ params }) => {
	const status = await getArchiveStatusService().series(params.id);
	return status
		? json({ success: true, status })
		: json({ success: false, error: 'Series not found' }, { status: 404 });
};
