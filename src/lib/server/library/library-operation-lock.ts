/**
 * Library Operation Lock
 *
 * In-process mutual exclusion between long-running library filesystem
 * operations (bulk renames, folder reorganizes, root-folder moves) and
 * library scans. A scan running while folders are being renamed sees a
 * half-renamed state and, because the scan diff is path-based, hard-deletes
 * the rows for moved files (jellyfin/jellyfin#16883 failure class).
 *
 * Rename/move operations acquire the lock; DiskScanService refuses to start
 * while it is held; the library watcher re-queues events instead of scanning.
 */
export class LibraryOperationLock {
	private currentHolder: string | null = null;
	private waiters: Array<() => void> = [];

	get isLocked(): boolean {
		return this.currentHolder !== null;
	}

	get holder(): string | null {
		return this.currentHolder;
	}

	get pendingCount(): number {
		return this.waiters.length;
	}

	async acquire(operation: string): Promise<() => void> {
		while (this.currentHolder !== null) {
			await new Promise<void>((resolve) => this.waiters.push(resolve));
		}
		this.currentHolder = operation;
		let released = false;
		return () => {
			if (released) return;
			released = true;
			this.currentHolder = null;
			const next = this.waiters.shift();
			if (next) next();
		};
	}

	async withLock<T>(operation: string, fn: () => Promise<T>): Promise<T> {
		const release = await this.acquire(operation);
		try {
			return await fn();
		} finally {
			release();
		}
	}
}

export const libraryOperationLock = new LibraryOperationLock();
