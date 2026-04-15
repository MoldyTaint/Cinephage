import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth/authorization.js';
import { db } from '$lib/server/db';
import { settings } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { tmdbApiKeySchema } from '$lib/validation/schemas';
import { tmdb } from '$lib/server/tmdb';
import { z } from 'zod';
import { parseBody } from '$lib/server/api/validate.js';

const tmdbSettingsSchema = z.object({
	apiKey: z.string().optional().default('')
});

export const GET: RequestHandler = async (event) => {
	// Require admin authentication
	const authError = requireAdmin(event);
	if (authError) return authError;

	const apiKeySetting = await db.query.settings.findFirst({
		where: eq(settings.key, 'tmdb_api_key')
	});

	return json({
		success: true,
		hasApiKey: Boolean(apiKeySetting)
	});
};

export const PUT: RequestHandler = async (event) => {
	// Require admin authentication
	const authError = requireAdmin(event);
	if (authError) return authError;

	const { request } = event;
	const parsedBody = await parseBody(request, tmdbSettingsSchema);

	const apiKey = parsedBody.apiKey.trim();
	if (!apiKey) {
		return json({ success: true, unchanged: true });
	}

	const validation = tmdbApiKeySchema.safeParse(apiKey);
	if (!validation.success) {
		return json(
			{
				error: validation.error.issues[0]?.message ?? 'Invalid TMDB API key'
			},
			{ status: 400 }
		);
	}

	await db
		.insert(settings)
		.values({ key: 'tmdb_api_key', value: apiKey })
		.onConflictDoUpdate({ target: settings.key, set: { value: apiKey } });

	tmdb.invalidateSettings();

	return json({ success: true });
};
