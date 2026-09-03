/**
 * Library Watcher Service
 *
 * Watches root folders for filesystem changes using chokidar.
 * Triggers incremental scans when files are added, removed, or changed.
 */

import { promises as fsPromises } from 'node:fs';
import chokidar, { type FSWatcher } from 'chokidar';
import { db } from '$lib/server/db/index.js';
import { rootFolders, librarySettings } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { diskScanService } from './disk-scan.js';
import { libraryOperationLock } from './library-operation-lock.js';
import { mediaMatcherService } from './media-matcher.js';
import { isVideoFile } from './media-info.js';
import { EventEmitter } from 'events';
import { createChildLogger } from '$lib/logging';

const logger = createChildLogger({ logDomain: 'scans' as const });

const DEBOUNCE_TIME = 5000;

const NETWORK_FS_TYPES = new Set([
	'nfs',
	'nfs4',
	'cifs',
	'smbfs',
	'smb2',
	'fuse.sshfs',
	'fuse.rclone',
	'fuse.s3fs',
	'glusterfs',
	'davfs',
	'overlay' // Docker bind mounts from Windows hosts appear as overlay
]);

async function detectFilesystemType(targetPath: string): Promise<string | null> {
	try {
		const mounts = await fsPromises.readFile('/proc/mounts', 'utf8');
		let bestLength = 0;
		let bestFsType: string | null = null;
		for (const line of mounts.split('\n')) {
			const parts = line.split(' ');
			if (parts.length < 3) continue;
			const mountPoint = parts[1];
			const fsType = parts[2];
			if (
				(targetPath === mountPoint || targetPath.startsWith(mountPoint + '/')) &&
				mountPoint.length > bestLength
			) {
				bestLength = mountPoint.length;
				bestFsType = fsType;
			}
		}
		return bestFsType;
	} catch {
		return null;
	}
}

interface FileChange {
	type: 'add' | 'change' | 'unlink';
	path: string;
	rootFolderId: string;
	timestamp: number;
}

export class LibraryWatcherService extends EventEmitter {
	private static instance: LibraryWatcherService;
	private watchers: Map<string, FSWatcher> = new Map();
	private pendingChanges: Map<string, FileChange> = new Map();
	private processTimeout: NodeJS.Timeout | null = null;
	private enabled = false;
	private rootFolderMap: Map<string, string> = new Map();

	private constructor() {
		super();
	}

	static getInstance(): LibraryWatcherService {
		if (!LibraryWatcherService.instance) {
			LibraryWatcherService.instance = new LibraryWatcherService();
		}
		return LibraryWatcherService.instance;
	}

	private async isWatchingEnabled(): Promise<boolean> {
		const setting = await db
			.select()
			.from(librarySettings)
			.where(eq(librarySettings.key, 'watch_enabled'))
			.limit(1);

		if (setting.length > 0) {
			return setting[0].value === 'true';
		}

		return true;
	}

	async initialize(): Promise<void> {
		const watchEnabled = await this.isWatchingEnabled();
		if (!watchEnabled) {
			logger.info('[LibraryWatcher] Filesystem watching is disabled');
			return;
		}

		const folders = await db.select().from(rootFolders);

		for (const folder of folders) {
			await this.watchFolder(folder.id, folder.path);
		}

		this.enabled = true;
		logger.info({ folderCount: folders.length }, '[LibraryWatcher] Initialized watchers');
	}

	async shutdown(): Promise<void> {
		for (const [folderId, watcher] of this.watchers) {
			await watcher.close();
			logger.debug({ folderId }, '[LibraryWatcher] Stopped watching folder');
		}

		this.watchers.clear();
		this.rootFolderMap.clear();
		this.pendingChanges.clear();

		if (this.processTimeout) {
			clearTimeout(this.processTimeout);
			this.processTimeout = null;
		}

		this.enabled = false;
	}

	async watchFolder(folderId: string, folderPath: string): Promise<void> {
		if (this.watchers.has(folderId)) {
			await this.watchers.get(folderId)?.close();
		}

		this.rootFolderMap.set(folderPath, folderId);

		const fsType = await detectFilesystemType(folderPath);
		if (fsType !== null) {
			if (NETWORK_FS_TYPES.has(fsType)) {
				logger.warn(
					{ folderId, folderPath, fsType },
					'[LibraryWatcher] Path is on a network filesystem: inotify-based watching may not function reliably over this mount type; scan-on-change may miss events'
				);
			} else {
				logger.info({ folderId, folderPath, fsType }, '[LibraryWatcher] Filesystem type detected');
			}
		}

		const watcher = chokidar.watch(folderPath, {
			persistent: true,
			ignoreInitial: true,
			followSymlinks: false,
			depth: 10,
			awaitWriteFinish: {
				stabilityThreshold: 2000,
				pollInterval: 500
			},
			ignored: [/(^|[/\\])\../, /node_modules/, /@eaDir/, /#recycle/i, /\$RECYCLE\.BIN/i]
		});

		// Suppress duplicate ENOSPC warnings.
		let enospcWarned = false;

		watcher
			.on('add', (path) => this.handleFileEvent('add', path, folderId))
			.on('change', (path) => this.handleFileEvent('change', path, folderId))
			.on('unlink', (path) => this.handleFileEvent('unlink', path, folderId))
			.on('error', (error) => {
				if ((error as NodeJS.ErrnoException).code === 'ENOSPC') {
					if (!enospcWarned) {
						enospcWarned = true;
						logger.warn(
							{ folderId, folderPath },
							'[LibraryWatcher] ENOSPC: system inotify watch limit reached. ' +
								'Increase fs.inotify.max_user_watches (e.g. echo 524288 | sudo tee /proc/sys/fs/inotify/max_user_watches), ' +
								'or disable "Watch filesystem for changes" in Settings and rely on scheduled scans instead.'
						);
					}
					// ENOSPC is not recoverable by the scheduler;s suppress re-emit to avoid log spam.
					return;
				}
				logger.error({ err: error, folderId }, '[LibraryWatcher] Error in folder');
				this.emit('error', { folderId, error });
			})
			.on('ready', () => {
				const watched = watcher.getWatched();
				const dirCount = Object.keys(watched).length;
				const fileCount = Object.values(watched).reduce((sum, files) => sum + files.length, 0);
				logger.info({ folderPath, dirCount, fileCount }, '[LibraryWatcher] Watching folder');
			});

		this.watchers.set(folderId, watcher);
	}

	async unwatchFolder(folderId: string): Promise<void> {
		const watcher = this.watchers.get(folderId);
		if (watcher) {
			await watcher.close();
			this.watchers.delete(folderId);

			for (const [path, id] of this.rootFolderMap) {
				if (id === folderId) {
					this.rootFolderMap.delete(path);
					break;
				}
			}

			logger.debug({ folderId }, '[LibraryWatcher] Stopped watching folder');
		}
	}

	private handleFileEvent(
		type: 'add' | 'change' | 'unlink',
		path: string,
		rootFolderId: string
	): void {
		if (!isVideoFile(path)) {
			return;
		}

		logger.debug({ type, path }, '[LibraryWatcher] File event');

		this.pendingChanges.set(path, {
			type,
			path,
			rootFolderId,
			timestamp: Date.now()
		});

		if (this.processTimeout) {
			clearTimeout(this.processTimeout);
		}

		this.processTimeout = setTimeout(() => {
			this.processPendingChanges();
		}, DEBOUNCE_TIME);
	}

	private requeue(changes: FileChange[]): void {
		for (const change of changes) {
			this.pendingChanges.set(change.path, change);
		}

		if (this.processTimeout) {
			clearTimeout(this.processTimeout);
		}

		this.processTimeout = setTimeout(() => {
			this.processPendingChanges();
		}, DEBOUNCE_TIME);
	}

	private async processPendingChanges(): Promise<void> {
		if (this.pendingChanges.size === 0) {
			return;
		}

		const changesByFolder = new Map<string, FileChange[]>();

		for (const [, change] of this.pendingChanges) {
			const existing = changesByFolder.get(change.rootFolderId) || [];
			existing.push(change);
			changesByFolder.set(change.rootFolderId, existing);
		}

		this.pendingChanges.clear();

		for (const [folderId, changes] of changesByFolder) {
			logger.info({ folderId, changeCount: changes.length }, '[LibraryWatcher] Processing changes');

			try {
				if (diskScanService.scanning || libraryOperationLock.isLocked) {
					logger.debug(
						{ changeCount: changes.length },
						'[LibraryWatcher] Scan or rename in progress, re-queueing changes'
					);
					this.requeue(changes);
					continue;
				}

				await diskScanService.scanRootFolder(folderId);

				await mediaMatcherService.processAllUnmatched();

				this.emit('processed', { folderId, changes: changes.length });
			} catch (error) {
				logger.error({ err: error, ...{ folderId } }, '[LibraryWatcher] Error processing changes');
				this.emit('error', { folderId, error });

				// Re-queue only when the failure is transient (scan/lock contention).
				// Permanent errors (e.g. root folder deleted) would otherwise loop forever.
				if (diskScanService.scanning || libraryOperationLock.isLocked) {
					this.requeue(changes);
				}
			}
		}
	}

	getStatus(): { enabled: boolean; watchedFolders: string[] } {
		return {
			enabled: this.enabled,
			watchedFolders: Array.from(this.watchers.keys())
		};
	}

	async refresh(): Promise<void> {
		await this.shutdown();
		await this.initialize();
	}
}

export const libraryWatcherService = LibraryWatcherService.getInstance();
