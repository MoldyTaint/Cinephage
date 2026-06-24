import type { LayoutServerLoad } from './$types';
import { getManagedApiKeysForRequest } from '$lib/server/auth/index.js';
import { error } from '@sveltejs/kit';
import { logger } from '$lib/logging';
import { getSystemSettingsService } from '$lib/server/settings/SystemSettingsService.js';
import { db } from '$lib/server/db';
import { settings } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { getMetadataProviderConfig } from '$lib/server/metadata/provider-settings.js';

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

		const metadataConfig = await getMetadataProviderConfig();

		return {
			mainApiKey,
			streamingApiKey,
			externalUrl,
			tmdb: {
				hasApiKey: !!apiKeySetting,
				configured: !!apiKeySetting
			},
			metadataProviders: {
				animeEnrichmentEnabled: metadataConfig.animeEnrichmentEnabled,
				source: metadataConfig.source
			}
		};
	} catch (err) {
		logger.error({ err, component: 'SystemSettingsPage' }, 'Error loading system settings');
		return {
			mainApiKey: null,
			streamingApiKey: null,
			externalUrl: null,
			tmdb: { hasApiKey: false, configured: false },
			metadataProviders: {
				animeEnrichmentEnabled: true,
				source: 'cinephage'
			},
			error: 'Failed to load system settings'
		};
	}
};
