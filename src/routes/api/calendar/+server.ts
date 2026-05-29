import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { getCalendarData } from '$lib/server/calendar/queries.js';

const calendarQuerySchema = z.object({
	month: z
		.string()
		.regex(/^\d{4}-\d{2}$/)
		.default(() => {
			const now = new Date();
			return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
		}),
	type: z.enum(['all', 'movies', 'episodes']).default('all')
});

export const GET: RequestHandler = async ({ url }) => {
	const result = calendarQuerySchema.safeParse(Object.fromEntries(url.searchParams));
	if (!result.success) {
		return json({ error: 'Invalid parameters', details: result.error.flatten() }, { status: 400 });
	}

	const days = await getCalendarData(result.data.month, result.data.type);
	return json(days);
};
