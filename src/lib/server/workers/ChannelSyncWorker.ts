/**
 * ChannelSyncWorker
 * Tracks a channel synchronization operation from start to completion.
 * Used for background channel syncing from Live TV providers.
 */

import { TaskWorker } from './TaskWorker.js';
import type { WorkerType, ChannelSyncWorkerMetadata } from './types.js';

/**
 * Options for creating a ChannelSyncWorker.
 */
export interface ChannelSyncWorkerOptions {
	accountId: string;
	accountName: string;
	providerType: string;
}

/**
 * ChannelSyncWorker tracks a channel sync operation.
 * It doesn't perform the sync itself - that's handled by the provider.
 * This worker tracks the operation for monitoring, logging, and debugging.
 */
export class ChannelSyncWorker extends TaskWorker<ChannelSyncWorkerMetadata> {
	readonly type: WorkerType = 'channel-sync';

	private resolvePromise?: Promise<void>;
	private resolveResolve?: () => void;
	private resolveReject?: (error: Error) => void;

	constructor(options: ChannelSyncWorkerOptions) {
		super({
			accountId: options.accountId,
			accountName: options.accountName,
			providerType: options.providerType,
			channelsSynced: 0,
			channelsAdded: 0,
			channelsUpdated: 0,
			channelsRemoved: 0,
			categoriesSynced: 0,
			error: undefined
		});

		// Create a promise that resolves when the sync ends
		this.resolvePromise = new Promise((resolve, reject) => {
			this.resolveResolve = resolve;
			this.resolveReject = reject;
		});

		// Prevent unhandled rejection crash if fail() is called before execute() awaits
		this.resolvePromise.catch(() => {});
	}

	/**
	 * The main execution method - called by WorkerManager.
	 * Override to return Promise<void> instead of Promise<Response>.
	 */
	async execute(): Promise<void> {
		this._startedAt = new Date();
		this._status = 'running';
		this.log(
			'info',
			`Starting channel sync for ${this._metadata.accountName} (${this._metadata.providerType})`
		);

		await this.resolvePromise;
	}

	/**
	 * Set the sync result and complete the worker.
	 */
	complete(result: {
		channelsSynced: number;
		channelsAdded: number;
		channelsUpdated: number;
		channelsRemoved: number;
		categoriesSynced: number;
	}): void {
		this.updateMetadata({
			channelsSynced: result.channelsSynced,
			channelsAdded: result.channelsAdded,
			channelsUpdated: result.channelsUpdated,
			channelsRemoved: result.channelsRemoved,
			categoriesSynced: result.categoriesSynced
		});
		this.setProgress(100);
		this._status = 'completed';
		this._completedAt = new Date();
		this.log('info', `Channel sync completed: ${result.channelsSynced} channels synced`, result);
		this.resolveResolve?.();
	}

	/**
	 * Record channels being synced.
	 */
	channelsFound(count: number): void {
		this.updateMetadata({ channelsSynced: count });
		this.log('info', `Found ${count} channels from provider`);
	}

	/**
	 * Record channels added.
	 */
	channelsAdded(count: number): void {
		const newCount = this._metadata.channelsAdded + count;
		this.updateMetadata({ channelsAdded: newCount });
		this.log('info', `Added ${count} new channels`);
	}

	/**
	 * Record channels updated.
	 */
	channelsUpdated(count: number): void {
		const newCount = this._metadata.channelsUpdated + count;
		this.updateMetadata({ channelsUpdated: newCount });
		this.log('info', `Updated ${count} existing channels`);
	}

	/**
	 * Record channels removed.
	 */
	channelsRemoved(count: number): void {
		const newCount = this._metadata.channelsRemoved + count;
		this.updateMetadata({ channelsRemoved: newCount });
		this.log('info', `Removed ${count} stale channels`);
	}

	/**
	 * Record categories synced.
	 */
	categoriesSynced(count: number): void {
		this.updateMetadata({ categoriesSynced: count });
		this.log('info', `Synced ${count} categories`);
	}

	/**
	 * Update progress based on channels processed.
	 */
	updateProgress(processed: number, total: number): void {
		if (total > 0) {
			this.setProgress((processed / total) * 100);
		}
	}

	/**
	 * Mark the sync as failed.
	 */
	fail(error: Error): void {
		this._status = 'failed';
		this._error = error;
		this._completedAt = new Date();
		this.updateMetadata({ error: error.message });
		this.log('error', `Channel sync failed: ${error.message}`);
		this.resolveReject?.(error);
	}
}
