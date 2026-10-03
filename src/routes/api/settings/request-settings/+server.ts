/**
 * Global request-system settings.
 *
 * GET /api/settings/request-settings — current settings (defaults if unset)
 * PUT /api/settings/request-settings — replace settings (full object)
 *
 * Auth: admin only.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { parseBody } from '$lib/server/api/validate.js';
import { requireAdmin } from '$lib/server/auth/authorization.js';
import { isAppError } from '$lib/errors';
import {
	getRequestSettingsService,
	requestSettingsSchema
} from '$lib/server/requests/RequestSettingsService.js';

export const GET: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	const settings = await getRequestSettingsService().getRequestSettings();
	return json({ success: true, settings });
};

export const PUT: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	try {
		const next = await parseBody(event.request, requestSettingsSchema);
		const settings = await getRequestSettingsService().saveRequestSettings(next);
		return json({ success: true, settings });
	} catch (error) {
		// Invalid bodies are client errors, not unhandled 500s.
		if (isAppError(error)) {
			return json({ success: false, error: error.message }, { status: error.statusCode });
		}
		throw error;
	}
};
