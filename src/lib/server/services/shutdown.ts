import { createChildLogger } from '$lib/logging';
import { getImportService } from '$lib/server/downloadClients/import/ImportService.js';
import { getServiceManager } from '$lib/server/services/service-manager.js';
import { sqlite } from '$lib/server/db/index.js';

const logger = createChildLogger({ module: 'Shutdown', logDomain: 'system' });

let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
	if (isShuttingDown) {
		logger.info('Shutdown already in progress, waiting...');
		return;
	}

	isShuttingDown = true;
	logger.info(`Received ${signal}, starting graceful shutdown...`);

	const timeout = setTimeout(() => {
		logger.error('Graceful shutdown timed out after 30s, forcing exit');
		closeDb();
		process.exit(0);
	}, 30000);

	try {
		getImportService().stop();
		await getServiceManager().stopAll();
		clearTimeout(timeout);
		logger.info('All services stopped successfully');
	} catch (error) {
		clearTimeout(timeout);
		logger.error('Error stopping services during shutdown', error);
	}

	closeDb();
	process.exit(0);
}

function closeDb(): void {
	try {
		sqlite.pragma('wal_checkpoint(TRUNCATE)');
		sqlite.close();
	} catch (err) {
		logger.error({ err }, 'Error closing database during shutdown');
	}
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
