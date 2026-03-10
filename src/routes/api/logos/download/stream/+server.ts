import type { RequestHandler } from './$types';
import { createSSEStream } from '$lib/server/sse';
import { getLogoDownloadService } from '$lib/server/logos/LogoDownloadService';
import type { LogoDownloadProgress } from '$lib/server/logos/LogoDownloadService';
import { logger } from '$lib/logging';

/**
 * GET /api/logos/download/stream
 * SSE endpoint for real-time logo download progress
 */
export const GET: RequestHandler = async () => {
	const service = getLogoDownloadService();

	return createSSEStream((send) => {
		// First, register ALL event listeners BEFORE doing anything else
		// This prevents missing events that fire during setup

		const onStarted = (data: LogoDownloadProgress) => {
			logger.info('[LogoDownloadStream] Download started event', {
				total: data.total,
				status: data.status
			});
			send('logos:started', data);
		};

		const onProgress = (data: LogoDownloadProgress) => {
			send('logos:progress', data);
		};

		const onCompleted = (data: LogoDownloadProgress) => {
			logger.info('[LogoDownloadStream] Download completed event', {
				downloaded: data.downloaded,
				total: data.total
			});
			send('logos:completed', data);
		};

		const onError = (data: LogoDownloadProgress) => {
			logger.error('[LogoDownloadStream] Download error event', {
				error: data.error
			});
			send('logos:error', data);
		};

		// Register listeners FIRST
		service.on('started', onStarted);
		service.on('progress', onProgress);
		service.on('completed', onCompleted);
		service.on('error', onError);

		// NOW get and send current status (after listeners are registered)
		const currentStatus: LogoDownloadProgress = service.progress;
		logger.info('[LogoDownloadStream] Client connected, sending status', {
			status: currentStatus.status,
			downloaded: currentStatus.downloaded,
			total: currentStatus.total
		});
		send('logos:status', currentStatus);

		// Return cleanup function
		return () => {
			service.off('started', onStarted);
			service.off('progress', onProgress);
			service.off('completed', onCompleted);
			service.off('error', onError);
		};
	});
};
