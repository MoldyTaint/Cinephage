import { building } from '$app/environment';
import { logger, registerServerLogSinks } from '$lib/logging';
import { getLibraryScheduler } from '$lib/server/library/library-scheduler.js';
import { isFFprobeAvailable, getFFprobeVersion } from '$lib/server/library/ffprobe.js';
import { getDownloadMonitor } from '$lib/server/downloadClients/monitoring';
import { getImportService } from '$lib/server/downloadClients/import/ImportService.js';
import { getMonitoringScheduler } from '$lib/server/monitoring/MonitoringScheduler.js';
import { getExternalIdService } from '$lib/server/services/ExternalIdService.js';
import { getDataRepairService } from '$lib/server/services/DataRepairService.js';
import { qualityFilter } from '$lib/server/quality';
import { initializeDatabase } from '$lib/server/db';
import { getCaptchaSolver } from '$lib/server/captcha';
import { getServiceManager } from '$lib/server/services/service-manager.js';
import { initPersistentStreamCache } from '$lib/server/streaming/cache/PersistentStreamCache';
import { getNntpManager } from '$lib/server/streaming/usenet/NntpManager';
import { getExtractionCacheManager } from '$lib/server/streaming/nzb/extraction/ExtractionCacheManager';
import { getMediaBrowserNotifier } from '$lib/server/notifications/mediabrowser';
import { getMediaServerStatsSyncService } from '$lib/server/mediaServerStats/MediaServerStatsSyncService.js';
import { getEpgScheduler } from '$lib/server/livetv/epg';
import { getLiveTvAccountManager } from '$lib/server/livetv/LiveTvAccountManager';
import { getLiveTvChannelService } from '$lib/server/livetv/LiveTvChannelService';
import { getLiveTvStreamService } from '$lib/server/livetv/streaming/LiveTvStreamService';
import { getStalkerPortalManager } from '$lib/server/livetv/stalker/StalkerPortalManager';
import { initializeProviderFactory } from '$lib/server/subtitles/providers/SubtitleProviderFactory.js';
import { ensureStreamingApiKeyRateLimit } from '$lib/server/auth/index.js';
import { logCaptureStore } from '$lib/server/logging/log-capture-store.js';
import { logHistoryService } from '$lib/server/logging/log-history.js';

let initializationPromise: Promise<void> | null = null;
let initializationStarted = false;

async function initializeServices(): Promise<void> {
	if (building) {
		logger.info('Skipping service initialization during build');
		return;
	}

	if (initializationPromise) {
		return initializationPromise;
	}

	initializationPromise = (async () => {
		try {
			registerServerLogSinks({
				logCaptureStore,
				logHistoryService
			});

			await initializeDatabase();
			const updatedStreamingKeys = await ensureStreamingApiKeyRateLimit();
			if (updatedStreamingKeys > 0) {
				logger.info(
					{
						updatedKeys: updatedStreamingKeys
					},
					'Updated streaming API key rate limits'
				);
			}
			logger.info('Initializing background services...');

			const ffprobeAvailable = await isFFprobeAvailable();
			if (ffprobeAvailable) {
				const version = await getFFprobeVersion();
				logger.info(`ffprobe available: ${version}`);
			} else {
				logger.warn('ffprobe not found. Library refresh will be slower and less accurate.');
			}

			await qualityFilter.seedDefaultScoringProfiles();

			const profiles = await qualityFilter.getAllProfiles();
			logger.info(`Loaded ${profiles.length} quality profiles`);

			const serviceManager = getServiceManager();

			const libraryScheduler = getLibraryScheduler();
			serviceManager.register(libraryScheduler);

			await getLibraryScheduler().initialize();
			logger.info('Library scheduler initialized');

			await initializeProviderFactory();
			logger.info('Provider registry initialized with 13 providers');

			const downloadMonitor = getDownloadMonitor();
			serviceManager.register(downloadMonitor);

			getImportService().start();

			const monitoringScheduler = getMonitoringScheduler();
			serviceManager.register(monitoringScheduler);

			const externalIdService = getExternalIdService();
			serviceManager.register(externalIdService);

			const dataRepairService = getDataRepairService();
			serviceManager.register(dataRepairService);

			const captchaSolver = getCaptchaSolver();
			if (captchaSolver) {
				serviceManager.register(captchaSolver);
				logger.info('CaptchaSolver initialized for anti-bot bypass');
			}

			await initPersistentStreamCache();

			const nntpManager = getNntpManager();
			serviceManager.register(nntpManager);

			const extractionCacheManager = getExtractionCacheManager();
			serviceManager.register(extractionCacheManager);

			const mediaBrowserNotifier = getMediaBrowserNotifier();
			serviceManager.register(mediaBrowserNotifier);
			logger.info('MediaBrowser notifier initialized for Jellyfin/Emby/Plex integration');

			const mediaServerStatsSync = getMediaServerStatsSyncService();
			serviceManager.register(mediaServerStatsSync);

			const liveTvAccountManager = getLiveTvAccountManager();
			serviceManager.register(liveTvAccountManager);

			const liveTvChannelService = getLiveTvChannelService();
			serviceManager.register(liveTvChannelService);

			const liveTvStreamService = getLiveTvStreamService();
			serviceManager.register(liveTvStreamService);

			const stalkerPortalManager = getStalkerPortalManager();
			serviceManager.register(stalkerPortalManager);

			const epgScheduler = getEpgScheduler();
			serviceManager.register(epgScheduler);

			serviceManager.startAll();

			logger.info('All background services initialized and started');
		} catch (error) {
			logger.error('Failed to initialize services', error);
			throw error;
		}
	})();

	return initializationPromise;
}

function ensureServicesInitialized(): void {
	if (building || initializationStarted) {
		return;
	}

	initializationStarted = true;
	initializeServices().catch((error) => {
		logger.error('Service initialization failed', error);
	});
}

export { initializeServices, ensureServicesInitialized };
