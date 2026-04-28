import type { PageServerLoad } from './$types';
import { getCalendarData } from '$lib/server/calendar/queries.js';

export const load: PageServerLoad = async ({ url }) => {
	const monthParam = url.searchParams.get('month');
	const now = new Date();
	const currentMonth =
		monthParam ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

	const days = await getCalendarData(currentMonth, 'all');
	return { days, currentMonth };
};
