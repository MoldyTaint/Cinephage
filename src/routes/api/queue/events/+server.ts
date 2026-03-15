import type { RequestHandler } from './$types';
import { createSSEStream } from '$lib/server/sse';
import { downloadMonitor } from '$lib/server/downloadClients/monitoring';

/**
 * Server-Sent Events endpoint for real-time queue updates
 *
 * Events emitted:
 * - queue:added - New item added to queue
 * - queue:updated - Item status/progress changed
 * - queue:completed - Download completed
 * - queue:imported - Item imported to library
 * - queue:failed - Download or import failed
 * - queue:removed - Item removed from queue
 */
export const GET: RequestHandler = async () => {
	return createSSEStream((send) => {
		const onQueueAdded = (item: unknown) => {
			send('queue:added', item);
		};

		const onQueueUpdated = (item: unknown) => {
			send('queue:updated', item);
		};

		const onQueueCompleted = (item: unknown) => {
			send('queue:completed', item);
		};

		const onQueueFailed = (data: unknown) => {
			send('queue:failed', data);
		};

		const onQueueImported = (data: unknown) => {
			send('queue:imported', data);
		};

		const onQueueRemoved = (id: unknown) => {
			send('queue:removed', { id });
		};

		downloadMonitor.on('queue:added', onQueueAdded);
		downloadMonitor.on('queue:updated', onQueueUpdated);
		downloadMonitor.on('queue:completed', onQueueCompleted);
		downloadMonitor.on('queue:failed', onQueueFailed);
		downloadMonitor.on('queue:imported', onQueueImported);
		downloadMonitor.on('queue:removed', onQueueRemoved);

		return () => {
			downloadMonitor.off('queue:added', onQueueAdded);
			downloadMonitor.off('queue:updated', onQueueUpdated);
			downloadMonitor.off('queue:completed', onQueueCompleted);
			downloadMonitor.off('queue:failed', onQueueFailed);
			downloadMonitor.off('queue:imported', onQueueImported);
			downloadMonitor.off('queue:removed', onQueueRemoved);
		};
	});
};
