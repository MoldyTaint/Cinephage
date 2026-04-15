import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { LanguageProfileService } from '$lib/server/subtitles/services/LanguageProfileService';
import { languageProfileUpdateSchema } from '$lib/validation/schemas';
import type { LanguagePreference } from '$lib/server/db/schema';
import { parseBody, assertFound } from '$lib/server/api/validate.js';

/**
 * GET /api/subtitles/language-profiles/:id
 * Get a single language profile by ID.
 */
export const GET: RequestHandler = async ({ params }) => {
	const service = LanguageProfileService.getInstance();
	const profile = await service.getProfile(params.id);

	assertFound(profile, 'Language profile', params.id);

	return json(profile);
};

/**
 * PUT /api/subtitles/language-profiles/:id
 * Update a language profile.
 */
export const PUT: RequestHandler = async ({ params, request }) => {
	const validated = await parseBody(request, languageProfileUpdateSchema);
	const service = LanguageProfileService.getInstance();

	const updated = await service.updateProfile(params.id, {
		name: validated.name,
		languages: validated.languages as LanguagePreference[] | undefined,
		upgradesAllowed: validated.upgradesAllowed,
		isDefault: validated.isDefault,
		cutoffIndex: validated.cutoffIndex,
		minimumScore: validated.minimumScore
	});

	return json({ success: true, profile: updated });
};

/**
 * DELETE /api/subtitles/language-profiles/:id
 * Delete a language profile.
 */
export const DELETE: RequestHandler = async ({ params }) => {
	const service = LanguageProfileService.getInstance();
	await service.deleteProfile(params.id);
	return json({ success: true });
};
