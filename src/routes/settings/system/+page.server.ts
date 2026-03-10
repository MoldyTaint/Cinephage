import type { PageServerLoad } from './$types';
import { getManagedApiKeysForRequest } from '$lib/server/auth/index.js';
import { error } from '@sveltejs/kit';
import { getSystemSettingsService } from '$lib/server/settings/SystemSettingsService.js';

export const load: PageServerLoad = async ({ request, locals }) => {
	// Require authentication
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	try {
		const { mainApiKey, streamingApiKey } = await getManagedApiKeysForRequest(request.headers);

		// Get external URL setting
		const settingsService = getSystemSettingsService();
		const externalUrl = await settingsService.getExternalUrl();

		return {
			mainApiKey,
			streamingApiKey,
			externalUrl
		};
	} catch (err) {
		console.error('Error loading system settings:', err);
		return {
			mainApiKey: null,
			streamingApiKey: null,
			externalUrl: null,
			error: 'Failed to load system settings'
		};
	}
};
