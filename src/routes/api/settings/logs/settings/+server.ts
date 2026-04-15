import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';

import { logger } from '$lib/logging';
import { requireAdmin } from '$lib/server/auth/authorization.js';
import {
	DEFAULT_LOG_RETENTION_DAYS,
	MAX_LOG_RETENTION_DAYS,
	logHistoryService
} from '$lib/server/logging/log-history.js';

const updateRetentionSchema = z.object({
	retentionDays: z.coerce.number().int().min(1).max(MAX_LOG_RETENTION_DAYS)
});

export const GET: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	try {
		const retentionDays = await logHistoryService.getRetentionDays();
		return json({
			success: true,
			retentionDays,
			defaultRetentionDays: DEFAULT_LOG_RETENTION_DAYS,
			maxRetentionDays: MAX_LOG_RETENTION_DAYS
		});
	} catch (error) {
		logger.error({ err: error }, 'Failed to load log retention settings');
		return json(
			{ success: false, error: 'Failed to load log retention settings' },
			{ status: 500 }
		);
	}
};

export const PUT: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
	}

	const parsed = updateRetentionSchema.safeParse(body);
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
		const retentionDays = await logHistoryService.setRetentionDays(parsed.data.retentionDays);
		return json({ success: true, retentionDays });
	} catch (error) {
		logger.error({ err: error }, 'Failed to update log retention settings');
		return json(
			{ success: false, error: 'Failed to update log retention settings' },
			{ status: 500 }
		);
	}
};
