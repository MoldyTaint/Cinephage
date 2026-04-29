import type { PageServerLoad } from './$types';
import { getCalendarData } from '$lib/server/calendar/queries.js';
import { logger } from '$lib/logging';

export const load: PageServerLoad = async ({ url }) => {
	const monthParam = url.searchParams.get('month');
	const now = new Date();
	let currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

	if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
		currentMonth = monthParam;
	}

	try {
		const days = await getCalendarData(currentMonth, 'all');
		return { days, currentMonth };
	} catch (error) {
		logger.error('Failed to load calendar data', error instanceof Error ? error : undefined);
		return { days: [], currentMonth };
	}
};
