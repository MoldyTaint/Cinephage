import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin, requireAuth } from '$lib/server/auth/authorization.js';
import {
	isAnimeRootFolderEnforcementEnabled,
	setAnimeRootFolderEnforcement
} from '$lib/server/library/anime-root-enforcement-settings.js';
import { z } from 'zod';

const updateSchema = z.object({
	enforceAnimeSubtype: z.boolean()
});

export const GET: RequestHandler = async (event) => {
	const authError = requireAuth(event);
	if (authError) return authError;

	const enforceAnimeSubtype = await isAnimeRootFolderEnforcementEnabled();
	return json({ enforceAnimeSubtype });
};

export const POST: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	let data: unknown;
	try {
		data = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const parsed = updateSchema.safeParse(data);
	if (!parsed.success) {
		return json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
	}

	await setAnimeRootFolderEnforcement(parsed.data.enforceAnimeSubtype);
	return json({ success: true, enforceAnimeSubtype: parsed.data.enforceAnimeSubtype });
};
