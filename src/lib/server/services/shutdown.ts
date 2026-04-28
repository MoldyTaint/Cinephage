import { logger } from '$lib/logging';
import { getImportService } from '$lib/server/downloadClients/import/ImportService.js';
import { getServiceManager } from '$lib/server/services/service-manager.js';

let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
	if (isShuttingDown) {
		logger.info('Shutdown already in progress, waiting...');
		return;
	}

	isShuttingDown = true;
	logger.info(`Received ${signal}, starting graceful shutdown...`);

	try {
		const serviceManager = getServiceManager();
		const timeout = setTimeout(() => {
			logger.error('Graceful shutdown timed out after 30s, forcing exit');
			process.exit(1);
		}, 30000);

		getImportService().stop();
		await serviceManager.stopAll();
		clearTimeout(timeout);

		logger.info('All services stopped successfully');
		process.exit(0);
	} catch (error) {
		logger.error('Error during graceful shutdown', error);
		process.exit(1);
	}
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
