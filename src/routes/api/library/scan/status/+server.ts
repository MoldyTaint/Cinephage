import type { RequestHandler } from './$types.js';
import { createSSEStream } from '$lib/server/sse';
import { librarySchedulerService, diskScanService } from '$lib/server/library/index.js';

/**
 * GET /api/library/scan/status
 * Get current scan status (Server-Sent Events for real-time updates)
 */
export const GET: RequestHandler = async ({ request }) => {
	// Check if client wants SSE
	const acceptHeader = request.headers.get('accept');
	const wantsSSE = acceptHeader?.includes('text/event-stream');

	if (wantsSSE) {
		return createSSEStream(async (send) => {
			const status = await librarySchedulerService.getStatus();
			send('status', status);

			const onProgress = (progress: unknown) => {
				send('progress', progress);
			};

			const onScanStart = (data: unknown) => {
				send('scanStart', data);
			};

			const onScanComplete = (data: unknown) => {
				send('scanComplete', data);
			};

			const onScanError = (data: unknown) => {
				send('scanError', data);
			};

			diskScanService.on('progress', onProgress);
			librarySchedulerService.on('scanStart', onScanStart);
			librarySchedulerService.on('scanComplete', onScanComplete);
			librarySchedulerService.on('scanError', onScanError);

			return () => {
				diskScanService.off('progress', onProgress);
				librarySchedulerService.off('scanStart', onScanStart);
				librarySchedulerService.off('scanComplete', onScanComplete);
				librarySchedulerService.off('scanError', onScanError);
			};
		});
	}

	// Regular JSON response
	const status = await librarySchedulerService.getStatus();

	return new Response(JSON.stringify({ success: true, ...status }), {
		headers: {
			'Content-Type': 'application/json'
		}
	});
};
