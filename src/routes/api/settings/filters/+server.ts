import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth/authorization.js';
import { db } from '$lib/server/db';
import { settings } from '$lib/server/db/schema';
import { globalTmdbFiltersSchema } from '$lib/validation/schemas';
import { eq } from 'drizzle-orm';
import { tmdb } from '$lib/server/tmdb';
import type { GlobalTmdbFilters } from '$lib/types/tmdb';
import { parseBody } from '$lib/server/api/validate.js';

const DEFAULT_FILTERS: GlobalTmdbFilters = {
	include_adult: false,
	min_vote_average: 0,
	min_vote_count: 0,
	language: 'en-US',
	region: 'US',
	excluded_genre_ids: []
};

export const GET: RequestHandler = async (event) => {
	// Require admin authentication
	const authError = requireAdmin(event);
	if (authError) return authError;

	const settingsData = await db.query.settings.findFirst({
		where: eq(settings.key, 'global_filters')
	});

	if (!settingsData) {
		return json({ success: true, filters: DEFAULT_FILTERS });
	}

	try {
		const stored = JSON.parse(settingsData.value) as Partial<GlobalTmdbFilters>;
		return json({
			success: true,
			filters: {
				...DEFAULT_FILTERS,
				...stored
			}
		});
	} catch {
		// Invalid JSON, return defaults
		return json({ success: true, filters: DEFAULT_FILTERS });
	}
};

export const PUT: RequestHandler = async (event) => {
	// Require admin authentication
	const authError = requireAdmin(event);
	if (authError) return authError;

	const { request } = event;
	const result = await parseBody(request, globalTmdbFiltersSchema);

	await db
		.insert(settings)
		.values({
			key: 'global_filters',
			value: JSON.stringify(result)
		})
		.onConflictDoUpdate({
			target: settings.key,
			set: { value: JSON.stringify(result) }
		});

	tmdb.invalidateSettings();

	return json({ success: true, filters: result });
};
