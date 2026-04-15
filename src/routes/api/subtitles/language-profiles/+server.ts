import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { LanguageProfileService } from '$lib/server/subtitles/services/LanguageProfileService';
import { languageProfileCreateSchema } from '$lib/validation/schemas';
import type { LanguagePreference } from '$lib/server/db/schema';
import { parseBody } from '$lib/server/api/validate.js';

/**
 * GET /api/subtitles/language-profiles
 * List all language profiles.
 */
export const GET: RequestHandler = async () => {
	const service = LanguageProfileService.getInstance();
	const profiles = await service.getProfiles();

	return json(profiles);
};

/**
 * POST /api/subtitles/language-profiles
 * Create a new language profile.
 */
export const POST: RequestHandler = async ({ request }) => {
	const validated = await parseBody(request, languageProfileCreateSchema);
	const service = LanguageProfileService.getInstance();

	const created = await service.createProfile({
		name: validated.name,
		languages: validated.languages as LanguagePreference[],
		upgradesAllowed: validated.upgradesAllowed,
		isDefault: validated.isDefault,
		cutoffIndex: validated.cutoffIndex,
		minimumScore: validated.minimumScore
	});

	return json({ success: true, profile: created });
};
