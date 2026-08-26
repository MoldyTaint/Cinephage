import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { parseBody } from '$lib/server/api/validate.js';
import { archiveMediaSchema } from '$lib/validation/schemas.js';
import { getArchiveJobManager } from '$lib/server/archivers/index.js';

export const POST: RequestHandler = async (event) => {
	const input = await parseBody(event.request, archiveMediaSchema);
	const jobId = getArchiveJobManager().start('series', event.params.id, input);
	return json({ success: true, jobId }, { status: 202 });
};
