import type { Handle, HandleServerError } from '@sveltejs/kit';
import { json, redirect } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';

import { logger } from '$lib/logging';
import { getLibraryScheduler, librarySchedulerService } from '$lib/server/library/index.js';
import { isFFprobeAvailable, getFFprobeVersion } from '$lib/server/library/ffprobe.js';
import { getDownloadMonitor, downloadMonitor } from '$lib/server/downloadClients/monitoring';
import { importService } from '$lib/server/downloadClients/import';
import {
	getMonitoringScheduler,
	monitoringScheduler
} from '$lib/server/monitoring/MonitoringScheduler.js';
import { taskHistoryService } from '$lib/server/tasks/TaskHistoryService.js';
import { getExternalIdService } from '$lib/server/services/ExternalIdService.js';
import { getDataRepairService } from '$lib/server/services/DataRepairService.js';
import { qualityFilter } from '$lib/server/quality';
import { isAppError } from '$lib/errors';
import { initializeDatabase } from '$lib/server/db';
import { getCaptchaSolver } from '$lib/server/captcha';
import { getServiceManager } from '$lib/server/services/service-manager.js';
import { initPersistentStreamCache } from '$lib/server/streaming/cache/PersistentStreamCache';
import { getNntpManager } from '$lib/server/streaming/usenet/NntpManager';
import { getExtractionCacheManager } from '$lib/server/streaming/nzb/extraction/ExtractionCacheManager';
import { getMediaBrowserNotifier } from '$lib/server/notifications/mediabrowser';
import { getEpgScheduler } from '$lib/server/livetv/epg';
import { initializeProviderFactory } from '$lib/server/subtitles/providers/SubtitleProviderFactory.js';

/**
 * Content Security Policy header.
 * Note: 'unsafe-inline' is required for Svelte's inline styles and some script functionality.
 * For stricter CSP, would need to implement nonce-based CSP with SvelteKit hooks.
 * Current policy is acceptable for LAN-only deployment.
 */
const CSP_HEADER = [
	"default-src 'self'",
	"script-src 'self' 'unsafe-inline'",
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data: https://image.tmdb.org https://api.cdn-live.tv https://m.media-amazon.com",
	"connect-src 'self'",
	"font-src 'self'"
].join('; ');

/**
 * Common security headers applied to all responses.
 */
const SECURITY_HEADERS: Record<string, string> = {
	'X-Content-Type-Options': 'nosniff',
	'X-Frame-Options': 'DENY',
	'Referrer-Policy': 'strict-origin-when-cross-origin',
	'X-XSS-Protection': '1; mode=block',
	'Content-Security-Policy': CSP_HEADER
};

// Initialize library scheduler on server startup
// This sets up filesystem watching and periodic scans
let libraryInitialized = false;
let downloadMonitorInitialized = false;
let monitoringInitialized = false;
let externalIdServiceInitialized = false;
let captchaSolverInitialized = false;
let nntpManagerInitialized = false;
let dataRepairServiceInitialized = false;
let mediaBrowserNotifierInitialized = false;
let epgSchedulerInitialized = false;

async function checkFFprobe() {
	const available = await isFFprobeAvailable();
	if (!available) {
		logger.warn('⚠️  ffprobe not found in PATH');
		logger.warn('   Media info extraction will not work without ffprobe.');
		logger.warn('   Install ffmpeg/ffprobe:');
		logger.warn('   - Ubuntu/Debian: sudo apt install ffmpeg');
		logger.warn('   - macOS: brew install ffmpeg');
		logger.warn('   - Or set FFPROBE_PATH environment variable');
		return;
	}

	const version = await getFFprobeVersion();
	logger.info(`ffprobe available: ${version || 'unknown version'}`);
}

async function initializeLibrary() {
	if (libraryInitialized) return;

	try {
		// Seed default scoring profiles to database (ensures foreign key targets exist)
		await qualityFilter.seedDefaultScoringProfiles();

		// Clear profile cache to ensure fresh profiles with size limits are loaded
		qualityFilter.clearCache();

		// Check ffprobe availability in background (informational only, doesn't block)
		checkFFprobe().catch((e) => logger.error('FFprobe check failed', e));

		await librarySchedulerService.initialize();
		libraryInitialized = true;
		logger.info('Library scheduler initialized');
	} catch (error) {
		logger.error('Failed to initialize library scheduler', error);
	}
}

async function initializeDownloadMonitor() {
	if (downloadMonitorInitialized) return;

	try {
		// Start the download monitor (polls clients and triggers imports)
		// This now performs a startup sync to check for orphaned downloads
		await downloadMonitor.start();

		// Start the import service (checks for pending imports from previous runs)
		importService.start();

		downloadMonitorInitialized = true;
		logger.info('Download monitor and import services started');
	} catch (error) {
		logger.error('Failed to start download monitor', error);
	}
}

async function initializeMonitoring() {
	if (monitoringInitialized) return;

	try {
		// Start the monitoring scheduler (automated searches for missing/upgrades/new episodes)
		// Note: The scheduler has a built-in 5-minute grace period before running any tasks
		await monitoringScheduler.initialize();

		// Clean up old history entries (30-day retention)
		// This runs on startup to prevent unbounded database growth
		const deletedCount = await taskHistoryService.cleanupOldHistory(30);
		if (deletedCount > 0) {
			logger.info(`Cleaned up ${deletedCount} task history entries older than 30 days`);
		}

		monitoringInitialized = true;
		logger.info('Monitoring scheduler initialized (tasks deferred by grace period)');
	} catch (error) {
		logger.error('Failed to initialize monitoring scheduler', error);
	}
}

async function initializeExternalIdService() {
	if (externalIdServiceInitialized) return;

	try {
		// Start the external ID service (ensures all media has IMDB/TVDB IDs)
		const externalIdService = getExternalIdService();
		externalIdService.start();

		externalIdServiceInitialized = true;
		logger.info('External ID service started');
	} catch (error) {
		logger.error('Failed to start external ID service', error);
	}
}

async function initializeCaptchaSolver() {
	if (captchaSolverInitialized) return;

	try {
		const captchaSolver = getCaptchaSolver();
		captchaSolver.start();
		captchaSolverInitialized = true;
		logger.info('CaptchaSolver initialized for anti-bot bypass');
	} catch (error) {
		// Non-fatal - application continues without browser solving
		// Users can still manually configure cookies for protected indexers
		logger.error('Failed to initialize CaptchaSolver (anti-bot bypass disabled)', error);
	}
}

async function initializeNntpManager() {
	if (nntpManagerInitialized) return;

	try {
		// Start the NNTP manager (for direct usenet streaming)
		const nntpManager = getNntpManager();
		nntpManager.start();

		nntpManagerInitialized = true;
		logger.info('NNTP manager started for usenet streaming');
	} catch (error) {
		// Non-fatal - application continues without usenet streaming
		logger.error('Failed to start NNTP manager (usenet streaming disabled)', error);
	}
}

async function initializeExtractionCacheManager() {
	try {
		// Start the extraction cache manager (for auto-cleanup of extracted files)
		const cacheManager = getExtractionCacheManager();
		if (cacheManager.status !== 'pending') return; // Already started
		cacheManager.start();
		logger.info('Extraction cache manager started for auto-cleanup');
	} catch (error) {
		// Non-fatal - application continues without auto-cleanup
		logger.error('Failed to start extraction cache manager', error);
	}
}

async function initializeDataRepairService() {
	if (dataRepairServiceInitialized) return;

	try {
		// Start the data repair service (fixes data from previous bugs)
		// This runs once on startup and processes any repair flags from migrations
		const dataRepairService = getDataRepairService();
		dataRepairService.start();

		dataRepairServiceInitialized = true;
		logger.info('Data repair service started');
	} catch (error) {
		// Non-fatal - application continues, but data may need manual repair
		logger.error('Failed to start data repair service', error);
	}
}

async function initializeMediaBrowserNotifier() {
	if (mediaBrowserNotifierInitialized) return;

	try {
		// Start the MediaBrowser notifier (Jellyfin/Emby library updates)
		const notifier = getMediaBrowserNotifier();
		notifier.start();

		// Wire into download monitor events
		downloadMonitor.on('queue:imported', (item) => {
			if (item.importedPath) {
				notifier.queueUpdate(item.importedPath, 'Created');
			}
		});

		mediaBrowserNotifierInitialized = true;
		logger.info('MediaBrowser notifier initialized for Jellyfin/Emby integration');
	} catch (error) {
		// Non-fatal - library updates will not be sent to media servers
		logger.error('Failed to initialize MediaBrowser notifier', error);
	}
}

async function initializeEpgScheduler() {
	if (epgSchedulerInitialized) return;

	try {
		// Start the EPG scheduler (automatic EPG sync and cleanup for Live TV)
		const epgScheduler = getEpgScheduler();
		epgScheduler.start();

		epgSchedulerInitialized = true;
		logger.info('EPG scheduler started for Live TV');
	} catch (error) {
		// Non-fatal - EPG will not auto-update but manual sync still works
		logger.error('Failed to start EPG scheduler', error);
	}
}

// Start initialization in next tick - ensures module loading completes immediately
// so the HTTP server can start responding to requests while services initialize in background.
// Using setImmediate pushes the async work to the next event loop iteration.
setImmediate(async () => {
	try {
		// 1. Run database migrations FIRST - creates/updates tables as needed
		// This is the only truly blocking operation (other services depend on DB schema)
		await initializeDatabase();

		// 1b. Run data repair service to fix any flagged data from previous bugs
		// This processes repair flags set by migrations (e.g., series missing episodes)
		initializeDataRepairService().catch((e) => logger.error('Data repair service failed', e));

		// 1c. Warm the stream cache from database (fast, improves first playback)
		initPersistentStreamCache().catch((e) => logger.error('Stream cache warming failed', e));

		// 1d. Initialize subtitle provider registry (no provider warm-up)
		initializeProviderFactory().catch((e) =>
			logger.error('Subtitle provider registry init failed', e)
		);

		// 2. Register all services with ServiceManager for centralized lifecycle management
		const serviceManager = getServiceManager();
		serviceManager.register(getDataRepairService());
		serviceManager.register(getLibraryScheduler());
		serviceManager.register(getDownloadMonitor());
		serviceManager.register(getMonitoringScheduler());
		serviceManager.register(getExternalIdService());
		serviceManager.register(getNntpManager());
		serviceManager.register(getExtractionCacheManager());
		serviceManager.register(getMediaBrowserNotifier());
		serviceManager.register(getEpgScheduler());

		// 3. Essential services run in parallel (fire-and-forget with error handling)
		// These don't block each other or HTTP responses
		Promise.all([
			initializeLibrary().catch((e) => logger.error('Library init failed', e)),
			initializeDownloadMonitor().catch((e) => logger.error('Download monitor init failed', e))
		]).then(() => {
			// Initialize MediaBrowser notifier after download monitor is ready
			// so event listeners can be attached
			initializeMediaBrowserNotifier().catch((e) =>
				logger.error('MediaBrowser notifier init failed', e)
			);
		});

		// 4. Background services start after a short delay
		// The monitoring scheduler also has an internal 5-minute grace period before tasks run
		setTimeout(() => {
			initializeMonitoring().catch((e) => logger.error('Monitoring init failed', e));
			initializeExternalIdService().catch((e) => logger.error('External ID init failed', e));
			initializeNntpManager().catch((e) => logger.error('NNTP manager init failed', e));
			initializeExtractionCacheManager().catch((e) =>
				logger.error('Extraction cache init failed', e)
			);
			initializeEpgScheduler().catch((e) => logger.error('EPG scheduler init failed', e));
		}, 5000);

		// 5. Captcha solver starts after other services (resource-intensive, lower priority)
		// This is delayed to allow core services to stabilize first
		setTimeout(() => {
			initializeCaptchaSolver().catch((e) => logger.error('CaptchaSolver init failed', e));
		}, 10000);

		logger.info('All services registered with ServiceManager');
	} catch (error) {
		logger.error('Critical: Database initialization failed - application may not function', error);
	}
});

// Graceful shutdown handler - uses ServiceManager for coordinated shutdown
async function gracefulShutdown(signal: string) {
	logger.info(`Received ${signal}, shutting down gracefully...`);

	const shutdownPromises: Promise<void>[] = [];

	// Stop all registered services via ServiceManager
	const serviceManager = getServiceManager();
	shutdownPromises.push(
		serviceManager
			.stopAll()
			.catch((e) => logger.error('Error stopping services via ServiceManager', e))
	);

	// Stop captcha solver (BackgroundService interface)
	if (captchaSolverInitialized) {
		shutdownPromises.push(
			getCaptchaSolver()
				.stop()
				.catch((e: Error) => logger.error('Error shutting down CaptchaSolver', e))
		);
	}

	// Wait for all services to stop (with timeout)
	await Promise.race([
		Promise.all(shutdownPromises),
		new Promise((resolve) => setTimeout(resolve, 5000)) // 5s timeout
	]);

	logger.info('Shutdown complete');
	process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Safety net for unhandled promise rejections - prevents crashes from missed error handling
process.on('unhandledRejection', (reason, _promise) => {
	logger.error('Unhandled Promise Rejection (safety net caught)', {
		reason: reason instanceof Error ? reason.message : String(reason),
		stack: reason instanceof Error ? reason.stack : undefined
	});
	// Don't exit - let the app continue running
});

/**
 * Server hooks for SvelteKit.
 * Adds correlation IDs to all requests for tracing.
 */
export const handle: Handle = async ({ event, resolve }) => {
	// Generate or extract correlation ID
	const correlationId = event.request.headers.get('x-correlation-id') ?? randomUUID();

	// Attach to locals for use in routes
	event.locals.correlationId = correlationId;

	// Route standardization redirects
	const pathname = event.url.pathname;

	if (
		pathname === '/movies' ||
		pathname === '/movies/' ||
		pathname === '/library/movie' ||
		pathname === '/library/movie/'
	) {
		throw redirect(308, '/library/movies');
	}
	if (pathname === '/tv' || pathname === '/tv/') {
		throw redirect(308, '/library/tv');
	}
	if (
		pathname === '/movie' ||
		pathname === '/movie/' ||
		pathname === '/discover/movie' ||
		pathname === '/discover/movie/' ||
		pathname === '/discover/tv' ||
		pathname === '/discover/tv/' ||
		pathname === '/discover/person' ||
		pathname === '/discover/person/' ||
		pathname === '/person' ||
		pathname === '/person/'
	) {
		throw redirect(308, '/discover');
	}
	if (pathname.startsWith('/movie/')) {
		throw redirect(308, `/discover/movie/${pathname.slice('/movie/'.length)}`);
	}
	if (pathname.startsWith('/tv/')) {
		throw redirect(308, `/discover/tv/${pathname.slice('/tv/'.length)}`);
	}
	if (pathname.startsWith('/person/')) {
		throw redirect(308, `/discover/person/${pathname.slice('/person/'.length)}`);
	}

	// Check if this is a streaming route - these handle their own errors
	const isStreamingRoute = event.url.pathname.startsWith('/api/streaming/');

	// Log incoming request
	logger.debug('Incoming request', {
		correlationId,
		method: event.request.method,
		path: event.url.pathname
	});

	const startTime = performance.now();

	try {
		// Disable JS modulepreload Link headers to reduce response header size.
		// With 270+ JS chunks, these headers can exceed nginx's default buffer (4KB).
		// Preload hints are still included in HTML <link> tags, so no functional impact.
		const response = await resolve(event, {
			preload: ({ type }) => type !== 'js'
		});

		// Add correlation ID to response headers
		response.headers.set('x-correlation-id', correlationId);

		// Add security headers (skip CSP for streaming routes - they need flexible origins)
		if (isStreamingRoute) {
			response.headers.set('Access-Control-Allow-Origin', '*');
			response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
			response.headers.set('Access-Control-Allow-Headers', 'Range, Content-Type');
		} else {
			for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
				response.headers.set(header, value);
			}
		}

		// Log completed request
		const duration = Math.round(performance.now() - startTime);
		logger.debug('Request completed', {
			correlationId,
			method: event.request.method,
			path: event.url.pathname,
			status: response.status,
			durationMs: duration
		});

		return response;
	} catch (error) {
		// Streaming routes handle their own errors - re-throw to let SvelteKit handle
		if (isStreamingRoute) {
			logger.error('Streaming route error', error, {
				correlationId,
				method: event.request.method,
				path: event.url.pathname
			});
			// Return plain text error for streaming routes (media players expect this)
			const message = error instanceof Error ? error.message : 'Stream error';
			return new Response(message, {
				status: 500,
				headers: {
					'Content-Type': 'text/plain',
					'x-correlation-id': correlationId,
					'Access-Control-Allow-Origin': '*'
				}
			});
		}

		// Log unhandled errors
		logger.error('Unhandled error in request', error, {
			correlationId,
			method: event.request.method,
			path: event.url.pathname
		});

		// Handle AppError instances with consistent formatting
		if (isAppError(error)) {
			const response = json(
				{
					success: false,
					...error.toJSON()
				},
				{
					status: error.statusCode,
					headers: {
						'x-correlation-id': correlationId,
						...SECURITY_HEADERS
					}
				}
			);
			return response;
		}

		// For non-AppError exceptions, return generic 500 error
		const response = json(
			{
				success: false,
				error: 'Internal Server Error',
				code: 'INTERNAL_ERROR'
			},
			{
				status: 500,
				headers: {
					'x-correlation-id': correlationId,
					...SECURITY_HEADERS
				}
			}
		);
		return response;
	}
};

/**
 * Global error handler for uncaught exceptions.
 * This catches errors that weren't handled in the request handler.
 */
export const handleError: HandleServerError = ({ error, event }) => {
	const correlationId = event.locals.correlationId ?? 'unknown';

	logger.error('Uncaught exception', error, {
		correlationId,
		method: event.request.method,
		path: event.url.pathname
	});

	// Return safe error message to client
	return {
		message: isAppError(error) ? error.message : 'An unexpected error occurred',
		code: isAppError(error) ? error.code : 'INTERNAL_ERROR'
	};
};
