import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth/authorization.js';
import { db } from '$lib/server/db';
import { settings } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { tvdbApiKeySchema, tvdbPinSchema } from '$lib/validation/schemas';
import { tvdb } from '$lib/server/tvdb.js';
import { z } from 'zod';
import { parseBody } from '$lib/server/api/validate.js';

const tvdbSettingsSchema = z.object({
	apiKey: z.string().optional().default(''),
	pin: z.string().optional().default('')
});

export const GET: RequestHandler = async (event) => {
	// Require admin authentication
	const authError = requireAdmin(event);
	if (authError) return authError;

	const [apiKeySetting, pinSetting] = await Promise.all([
		db.query.settings.findFirst({ where: eq(settings.key, 'tvdb_api_key') }),
		db.query.settings.findFirst({ where: eq(settings.key, 'tvdb_api_pin') })
	]);

	return json({
		success: true,
		hasApiKey: Boolean(apiKeySetting),
		hasPin: Boolean(pinSetting)
	});
};

export const PUT: RequestHandler = async (event) => {
	// Require admin authentication
	const authError = requireAdmin(event);
	if (authError) return authError;

	const { request } = event;
	const parsedBody = await parseBody(request, tvdbSettingsSchema);

	const apiKey = parsedBody.apiKey.trim();
	const pinRaw = parsedBody.pin.trim();

	// Blank api key = no-op (never wipe the stored secret from an empty form field)
	if (!apiKey) {
		return json({ success: true, unchanged: true });
	}

	const keyValidation = tvdbApiKeySchema.safeParse(apiKey);
	if (!keyValidation.success) {
		return json(
			{
				error: keyValidation.error.issues[0]?.message ?? 'Invalid TVDB API key'
			},
			{ status: 400 }
		);
	}

	const pinValidation = tvdbPinSchema.safeParse(pinRaw);
	if (!pinValidation.success) {
		return json(
			{
				error: pinValidation.error.issues[0]?.message ?? 'Invalid TVDB PIN'
			},
			{ status: 400 }
		);
	}

	// Upsert the API key
	await db
		.insert(settings)
		.values({ key: 'tvdb_api_key', value: apiKey })
		.onConflictDoUpdate({ target: settings.key, set: { value: apiKey } });

	// Upsert the PIN (store the trimmed value, including empty to allow clearing it)
	await db
		.insert(settings)
		.values({ key: 'tvdb_api_pin', value: pinValidation.data })
		.onConflictDoUpdate({ target: settings.key, set: { value: pinValidation.data } });

	tvdb.invalidateSettings();

	return json({ success: true });
};
