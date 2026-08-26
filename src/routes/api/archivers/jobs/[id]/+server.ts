import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getArchiveJobManager } from '$lib/server/archivers/index.js';

export const GET: RequestHandler = async ({ params }) => {
	const job = await getArchiveJobManager().get(params.id);
	return job
		? json({ success: true, job })
		: json({ success: false, error: 'Archive job not found or expired' }, { status: 404 });
};
