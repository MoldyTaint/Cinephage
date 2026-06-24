import type { LayoutServerLoad } from './$types';
import { getManagedApiKeysForRequest } from '$lib/server/auth/index.js';
import { error } from '@sveltejs/kit';
import { logger } from '$lib/logging';
import { getSystemSettingsService } from '$lib/server/settings/SystemSettingsService.js';
import { db } from '$lib/server/db';
import { settings } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { getMetadataProviderConfig } from '$lib/server/metadata/provider-settings.js';
import { getCinephageBackendConfig } from '$lib/server/cinephage';

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
		const cinephageConfig = await getCinephageBackendConfig();

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
			},
			cinephageBackend: {
				configured: cinephageConfig.configured,
				version: cinephageConfig.version,
				commit: cinephageConfig.commit
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
			cinephageBackend: {
				configured: false
			},
			error: 'Failed to load system settings'
		};
	}
};
