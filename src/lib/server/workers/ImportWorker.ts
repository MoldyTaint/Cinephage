/**
 * ImportWorker
 * Tracks an import operation from start to completion.
 * Used for monitoring and debugging import activity.
 */

import { TaskWorker } from './TaskWorker.js';
import type { WorkerType, ImportWorkerMetadata } from './types.js';

/**
 * Options for creating an ImportWorker.
 */
export interface ImportWorkerOptions {
	queueItemId: string;
	mediaType: 'movie' | 'episode';
	title: string;
	totalFiles?: number;
}

/**
 * ImportWorker tracks a single import operation.
 * It doesn't perform the import itself - that's handled by ImportService.
 * This worker tracks the operation for monitoring, logging, and debugging.
 */
export class ImportWorker extends TaskWorker<ImportWorkerMetadata> {
	readonly type: WorkerType = 'import';

	private resolvePromise?: Promise<void>;
	private resolveResolve?: () => void;
	private resolveReject?: (error: Error) => void;

	constructor(options: ImportWorkerOptions) {
		super({
			queueItemId: options.queueItemId,
			mediaType: options.mediaType,
			title: options.title,
			sourcePath: undefined,
			destinationPath: undefined,
			filesProcessed: 0,
			totalFiles: options.totalFiles || 0
		});


		// Create a promise that resolves when the import ends
		this.resolvePromise = new Promise((resolve, reject) => {
			this.resolveResolve = resolve;
			this.resolveReject = reject;
		});

		// Prevent unhandled rejection crash if fail() is called before execute() awaits
		this.resolvePromise.catch(() => { });
	}

	/**
	 * Set the source path being imported from.
	 */
	setSourcePath(path: string): void {
		this.updateMetadata({ sourcePath: path });
		this.log('info', `Import source: ${path}`);
	}

	/**
	 * Set the destination path being imported to.
	 */
	setDestinationPath(path: string): void {
		this.updateMetadata({ destinationPath: path });
		this.log('info', `Import destination: ${path}`);
	}

	/**
	 * Set the total number of files to import.
	 */
	setTotalFiles(count: number): void {
		this.updateMetadata({ totalFiles: count });
		this.log('info', `Found ${count} files to import`);
	}

	/**
	 * Record a file being processed.
	 */
	fileProcessed(filename: string, success: boolean, error?: string): void {
		const newCount = this._metadata.filesProcessed + 1;
		this.updateMetadata({ filesProcessed: newCount });

		if (this._metadata.totalFiles > 0) {
			this.setProgress((newCount / this._metadata.totalFiles) * 100);
		}

		if (success) {
			this.log('info', `Imported: ${filename}`);
		} else {
			this.log('warn', `Failed to import: ${filename}`, { error });
		}
	}

	/**
	 * Record a hardlink/copy operation.
	 */
	fileTransferred(filename: string, method: 'hardlink' | 'copy'): void {
		this.log('debug', `${method === 'hardlink' ? 'Hardlinked' : 'Copied'}: ${filename}`);
	}

	/**
	 * Record an upgrade (replacing existing file).
	 */
	upgrade(oldFile: string, newFile: string): void {
		this.log('info', `Upgrade: replacing ${oldFile} with ${newFile}`);
	}

	/**
	 * Mark the import as complete.
	 */
	complete(summary: { imported: number; failed: number; totalSize: number }): void {
		if (!this.isActive) return;

		this.log('info', `Import completed`, {
			imported: summary.imported,
			failed: summary.failed,
			totalSizeMB: (summary.totalSize / 1024 / 1024).toFixed(2)
		});

		this.resolveResolve?.();
	}

	/**
	 * Mark the import as failed.
	 */
	fail(error: string): void {
		if (!this.isActive) return;

		this.log('error', `Import failed: ${error}`);
		this.resolveReject?.(new Error(error));
	}

	/**
	 * Execute the worker - waits for complete() or fail() to be called.
	 */
	protected async execute(): Promise<void> {
		await this.resolvePromise;
	}

	/**
	 * Get a summary of the import operation.
	 */
	getSummary(): {
		queueItemId: string;
		title: string;
		mediaType: 'movie' | 'episode';
		sourcePath?: string;
		destinationPath?: string;
		filesProcessed: number;
		totalFiles: number;
		duration: number;
	} {
		const duration = this._startedAt
			? (this._completedAt || new Date()).getTime() - this._startedAt.getTime()
			: 0;

		return {
			queueItemId: this._metadata.queueItemId,
			title: this._metadata.title,
			mediaType: this._metadata.mediaType,
			sourcePath: this._metadata.sourcePath,
			destinationPath: this._metadata.destinationPath,
			filesProcessed: this._metadata.filesProcessed,
			totalFiles: this._metadata.totalFiles,
			duration
		};
	}
}
