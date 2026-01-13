export type { BackgroundService, ServiceStatus, ServiceStatusInfo } from './background-service.js';
export { serviceManager } from './service-manager.js';
export { ExternalIdService, getExternalIdService, ensureExternalIds } from './ExternalIdService.js';
export { DataRepairService, getDataRepairService } from './DataRepairService.js';
export {
	cleanTitle,
	getMovieSearchTitles,
	getSeriesSearchTitles,
	fetchAndStoreMovieAlternateTitles,
	fetchAndStoreSeriesAlternateTitles,
	addUserAlternateTitle,
	removeAlternateTitle,
	getAlternateTitles,
	deleteAllAlternateTitles
} from './AlternateTitleService.js';
