import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSubtitleSettingsService } from '$lib/server/subtitles/services/SubtitleSettingsService';
import { subtitleSettingsUpdateSchema } from '$lib/validation/schemas';
import { parseBody } from '$lib/server/api/validate.js';

/**
 * GET /api/subtitles/settings
 * Get all subtitle system settings.
 */
export const GET: RequestHandler = async () => {
	const settingsService = getSubtitleSettingsService();
	const settings = await settingsService.getAll();
	return json(settings);
};

/**
 * PUT /api/subtitles/settings
 * Update subtitle system settings.
 */
export const PUT: RequestHandler = async ({ request }) => {
	const data = await parseBody(request, subtitleSettingsUpdateSchema);
	const settingsService = getSubtitleSettingsService();
	const updated = await settingsService.update(data);
	return json(updated);
};

/**
 * DELETE /api/subtitles/settings
 * Reset all subtitle settings to defaults.
 */
export const DELETE: RequestHandler = async () => {
	const settingsService = getSubtitleSettingsService();
	const defaults = await settingsService.resetToDefaults();
	return json(defaults);
};
