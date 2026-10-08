import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { requireAdmin } from '#lib/server/auth/authorization.js';
import { libraryJobService } from '#lib/server/library/jobs/LibraryJobService.js';

export const POST: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;
	try {
		const job = await libraryJobService.retryJob(event.params.id);
		return json({ success: true, job });
	} catch (error) {
		return json(
			{ success: false, error: error instanceof Error ? error.message : 'Failed to retry job' },
			{ status: 400 }
		);
	}
};
