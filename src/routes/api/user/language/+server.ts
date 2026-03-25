import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { locales } from '$lib/paraglide/runtime.js';
import { logger } from '$lib/logging';

const VALID_LANGUAGES = new Set<string>(locales);

export const POST: RequestHandler = async ({ request, locals }) => {
	// Check if user is authenticated
	if (!locals.user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	let data: unknown;
	try {
		data = await request.json();
	} catch {
		return json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
	}

	// Validate the request body
	if (!data || typeof data !== 'object') {
		return json({ success: false, error: 'Invalid request body' }, { status: 400 });
	}

	const { language } = data as { language?: unknown };

	if (!language || typeof language !== 'string') {
		return json({ success: false, error: 'Language is required' }, { status: 400 });
	}

	// Validate language is supported
	if (!VALID_LANGUAGES.has(language)) {
		return json(
			{
				success: false,
				error: 'Invalid language',
				supportedLanguages: Array.from(VALID_LANGUAGES)
			},
			{ status: 400 }
		);
	}

	try {
		// Update user's language preference in database
		await db.update(user).set({ language }).where(eq(user.id, locals.user.id));

		logger.info(
			{ userId: locals.user.id, language },
			'[UserLanguage] Updated user language preference'
		);

		return json({ success: true, language });
	} catch (error) {
		logger.error(
			{ err: error, userId: locals.user.id, language },
			'[UserLanguage] Failed to update user language preference'
		);

		return json({ success: false, error: 'Failed to update language preference' }, { status: 500 });
	}
};
