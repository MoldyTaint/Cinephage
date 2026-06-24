import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types.js';
import { requireAdmin } from '$lib/server/auth/authorization.js';
import { parseBody } from '$lib/server/api/validate.js';
import { db } from '$lib/server/db';
import { settings } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import {
	CINEPHAGE_BACKEND_SETTINGS_KEY,
	invalidateCinephageBackendConfig,
	getCinephageBackendConfig
} from '$lib/server/cinephage';

const updateSchema = z.object({
	version: z.string().optional(),
	commit: z.string().optional()
});

export const GET: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	const config = await getCinephageBackendConfig();
	return json({
		success: true,
		configured: config.configured,
		version: config.version,
		commit: config.commit
	});
};

export const PUT: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	const payload = await parseBody(event.request, updateSchema);

	const row = await db.query.settings.findFirst({
		where: eq(settings.key, CINEPHAGE_BACKEND_SETTINGS_KEY)
	});

	let stored: Record<string, unknown> = {};
	try {
		stored = row ? JSON.parse(row.value) : {};
	} catch {
		/* use empty */
	}

	if (payload.version !== undefined) {
		stored.version = payload.version;
	}
	if (payload.commit !== undefined) {
		stored.commit = payload.commit;
	}

	await db
		.insert(settings)
		.values({ key: CINEPHAGE_BACKEND_SETTINGS_KEY, value: JSON.stringify(stored) })
		.onConflictDoUpdate({
			target: settings.key,
			set: { value: JSON.stringify(stored) }
		});

	invalidateCinephageBackendConfig();

	return json({ success: true, ...stored });
};
