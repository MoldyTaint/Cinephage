import type { LayoutServerLoad } from './$types';
import { getManagedApiKeysForRequest } from '$lib/server/auth/index.js';
import { error } from '@sveltejs/kit';
import { logger } from '$lib/logging';
import { getSystemSettingsService } from '$lib/server/settings/SystemSettingsService.js';
import { db } from '$lib/server/db';
import { settings } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const load: LayoutServerLoad = async ({ request, locals }) => {
	// Require authentication
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	try {
		const { mainApiKey, streamingApiKey } = await getManagedApiKeysForRequest(request.headers);

		// Get external URL setting
		const settingsService = getSystemSettingsService();
		const externalUrl = await settingsService.getExternalUrl();

		// Get TMDB status
		const apiKeySetting = await db.query.settings.findFirst({
			where: eq(settings.key, 'tmdb_api_key')
		});
		const metadataProviderSetting = await db.query.settings.findFirst({
			where: eq(settings.key, 'metadata_providers')
		});
		let metadataProviders = {
			hasMalClientId: false,
			hasAniListEnabled: false
		};
		if (metadataProviderSetting) {
			try {
				const parsed = JSON.parse(metadataProviderSetting.value) as {
					malClientId?: string;
					anilistEnabled?: boolean;
				};
				metadataProviders = {
					hasMalClientId: Boolean(parsed.malClientId),
					hasAniListEnabled: Boolean(parsed.anilistEnabled)
				};
			} catch {
				// Ignore malformed setting and return defaults
			}
		}

		return {
			mainApiKey,
			streamingApiKey,
			externalUrl,
			tmdb: {
				hasApiKey: !!apiKeySetting,
				configured: !!apiKeySetting
			},
			metadataProviders
		};
	} catch (err) {
		logger.error({ err, component: 'SystemSettingsPage' }, 'Error loading system settings');
		return {
			mainApiKey: null,
			streamingApiKey: null,
			externalUrl: null,
			tmdb: { hasApiKey: false, configured: false },
			metadataProviders: {
				hasMalClientId: false,
				hasAniListEnabled: false
			},
			error: 'Failed to load system settings'
		};
	}
};
