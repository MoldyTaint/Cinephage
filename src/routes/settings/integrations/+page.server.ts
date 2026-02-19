import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/server/db';
import { settings } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { getIndexerManager } from '$lib/server/indexers/IndexerManager';
import { getDownloadClientManager } from '$lib/server/downloadClients/DownloadClientManager';
import { getNntpServerService } from '$lib/server/streaming/nzb/NntpServerService';
import { getSubtitleProviderManager } from '$lib/server/subtitles/services/SubtitleProviderManager';
import { LanguageProfileService } from '$lib/server/subtitles/services/LanguageProfileService';
import { getMediaBrowserManager } from '$lib/server/notifications/mediabrowser';

export const load: PageServerLoad = async () => {
	// Get TMDB status
	const apiKeySetting = await db.query.settings.findFirst({
		where: eq(settings.key, 'tmdb_api_key')
	});

	// Get indexer stats
	const indexerManager = await getIndexerManager();
	const indexers = await indexerManager.getIndexers();
	const enabledIndexers = indexers.filter((i) => i.enabled);

	// Get download client stats
	const downloadClientManager = getDownloadClientManager();
	const downloadClients = await downloadClientManager.getClients();
	const enabledClients = downloadClients.filter((c) => c.enabled);

	// Get NNTP server stats
	const nntpService = getNntpServerService();
	const nntpServers = await nntpService.getServers();
	const enabledNntpServers = nntpServers.filter((s) => s.enabled);

	// Get subtitle provider stats
	const subtitleManager = getSubtitleProviderManager();
	const subtitleProviders = await subtitleManager.getProviders();
	const enabledSubtitleProviders = subtitleProviders.filter((p) => p.enabled);
	const healthySubtitleProviders = subtitleProviders.filter((p) => p.consecutiveFailures === 0);

	// Get language profile stats
	const profileService = LanguageProfileService.getInstance();
	const languageProfiles = await profileService.getProfiles();
	const defaultProfile = languageProfiles.find((p) => p.isDefault);

	// Get media browser stats
	const mediaBrowserManager = getMediaBrowserManager();
	const mediaBrowserServers = await mediaBrowserManager.getServers();
	const enabledMediaBrowsers = mediaBrowserServers.filter((s) => s.enabled);

	return {
		tmdb: {
			hasApiKey: !!apiKeySetting,
			configured: !!apiKeySetting,
			apiKey: apiKeySetting?.value || ''
		},
		indexers: {
			total: indexers.length,
			enabled: enabledIndexers.length
		},
		downloadClients: {
			total: downloadClients.length,
			enabled: enabledClients.length
		},
		nntpServers: {
			total: nntpServers.length,
			enabled: enabledNntpServers.length
		},
		subtitleProviders: {
			total: subtitleProviders.length,
			enabled: enabledSubtitleProviders.length,
			healthy: healthySubtitleProviders.length
		},
		languageProfiles: {
			total: languageProfiles.length,
			hasDefault: !!defaultProfile
		},
		mediaBrowsers: {
			total: mediaBrowserServers.length,
			enabled: enabledMediaBrowsers.length
		}
	};
};

export const actions: Actions = {
	saveTmdbApiKey: async ({ request }) => {
		const formData = await request.formData();
		const apiKey = formData.get('apiKey') as string;

		if (apiKey) {
			await db
				.insert(settings)
				.values({ key: 'tmdb_api_key', value: apiKey })
				.onConflictDoUpdate({ target: settings.key, set: { value: apiKey } });
		} else {
			await db.delete(settings).where(eq(settings.key, 'tmdb_api_key'));
		}

		return { success: true };
	}
};
