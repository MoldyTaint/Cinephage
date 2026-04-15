import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { logger } from '$lib/logging';
import { requireAdmin } from '$lib/server/auth/authorization.js';
import { logHistoryService } from '$lib/server/logging/log-history.js';
import { logHistoryQuerySchema } from '$lib/validation/schemas.js';

export const GET: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	const raw = Object.fromEntries(event.url.searchParams.entries());
	const parsed = logHistoryQuerySchema.safeParse(raw);
	if (!parsed.success) {
		return json(
			{
				success: false,
				error: 'Validation failed',
				details: parsed.error.flatten()
			},
			{ status: 400 }
		);
	}

	try {
		const result = await logHistoryService.search(parsed.data);
		return json({ success: true, ...result });
	} catch (error) {
		logger.error({ err: error }, 'Failed to load log history');
		return json({ success: false, error: 'Failed to load log history' }, { status: 500 });
	}
};
