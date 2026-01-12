/**
 * Download Clients Module
 *
 * Provides services for managing download clients (QBittorrent, etc.)
 * and root folders (media library destinations).
 */

export {
	DownloadClientManager,
	getDownloadClientManager,
	resetDownloadClientManager
} from './DownloadClientManager';
export type { DownloadClientInput } from './DownloadClientManager';

export {
	RootFolderService,
	getRootFolderService,
	resetRootFolderService
} from './RootFolderService';
export type { RootFolderInput } from './RootFolderService';

export { QBittorrentClient } from './qbittorrent/QBittorrentClient';
export { NZBMountClient } from './nzbmount/NZBMountClient';

export type {
	IDownloadClient,
	DownloadClientConfig,
	AddDownloadOptions,
	DownloadInfo
} from './core/interfaces';
