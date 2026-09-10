import type { PageServerLoad } from './$types';
import { getCalendarData } from '$lib/server/calendar/queries.js';
import { getCalendarPreferences } from '$lib/server/settings/calendar-preferences.js';
import { calendarPreferencesSchema } from '$lib/validation/schemas.js';
import { tmdb } from '$lib/server/tmdb.js';
import { createChildLogger } from '$lib/logging';

const logger = createChildLogger({ module: 'CalendarPage', logDomain: 'system' });

export const load: PageServerLoad = async ({ url }) => {
	const monthParam = url.searchParams.get('month');
	const now = new Date();
	let currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

	if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
		currentMonth = monthParam;
	}

	try {
		const [preferences, movieGenresRes, tvGenresRes] = await Promise.all([
			getCalendarPreferences(),
			tmdb.getMovieGenres().catch(() => ({ genres: [] })),
			tmdb.getTvGenres().catch(() => ({ genres: [] }))
		]);

		const genreMap = new Map<number, string>();
		for (const g of [...movieGenresRes.genres, ...tvGenresRes.genres]) {
			genreMap.set(g.id, g.name);
		}
		const genres = Array.from(genreMap.entries())
			.map(([id, name]) => ({ id, name }))
			.sort((a, b) => a.name.localeCompare(b.name));

		const days = await getCalendarData(
			currentMonth,
			preferences.contentType,
			preferences.libraryOnly,
			preferences.minRating,
			preferences.genreIds,
			preferences.excludeAdult,
			preferences.certifications
		);
		return { days, currentMonth, preferences, genres };
	} catch (error) {
		logger.error('Failed to load calendar data', error instanceof Error ? error : undefined);
		return { days: [], currentMonth, preferences: calendarPreferencesSchema.parse({}), genres: [] };
	}
};
