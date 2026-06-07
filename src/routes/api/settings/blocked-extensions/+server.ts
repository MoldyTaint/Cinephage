import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth/authorization.js';
import { globalBlockedVideoExtensionsSchema } from '$lib/validation/schemas.js';
import { parseBody } from '$lib/server/api/validate.js';
import {
	getBlockedVideoExtensions,
	setBlockedVideoExtensions,
	invalidateBlockedVideoExtensionsCache
} from '$lib/server/settings/blocked-extensions.js';

export const GET: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	const data = await getBlockedVideoExtensions();
	return json({ success: true, ...data });
};

export const PUT: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	const result = await parseBody(event.request, globalBlockedVideoExtensionsSchema);

	await setBlockedVideoExtensions(result);

	invalidateBlockedVideoExtensionsCache();

	return json({ success: true, ...result });
};
