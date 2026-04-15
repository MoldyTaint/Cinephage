/**
 * In-memory sync state for manual/background EPG sync requests.
 *
 * Used to:
 * - Prevent duplicate sync triggers for the same account.
 * - Expose active account sync IDs to status/SSE endpoints.
 */

export interface EpgSyncStateSnapshot {
	syncingAll: boolean;
	syncingAccountIds: string[];
	cancelRequestedAll: boolean;
	cancelRequestedAccountIds: string[];
}

class EpgSyncState {
	private syncingAll = false;
	private readonly syncingAccountIds = new Set<string>();
	private cancelRequestedAll = false;
	private readonly cancelRequestedAccountIds = new Set<string>();

	tryStartAll(): boolean {
		if (this.syncingAll || this.syncingAccountIds.size > 0) {
			return false;
		}
		this.syncingAll = true;
		this.cancelRequestedAll = false;
		this.cancelRequestedAccountIds.clear();
		return true;
	}

	finishAll(): void {
		this.syncingAll = false;
		this.cancelRequestedAll = false;
		this.cancelRequestedAccountIds.clear();
	}

	tryStartAccount(accountId: string): boolean {
		if (this.syncingAll || this.syncingAccountIds.has(accountId)) {
			return false;
		}
		this.syncingAccountIds.add(accountId);
		this.cancelRequestedAccountIds.delete(accountId);
		return true;
	}

	finishAccount(accountId: string): void {
		this.syncingAccountIds.delete(accountId);
		this.cancelRequestedAccountIds.delete(accountId);
		if (this.syncingAccountIds.size === 0) {
			this.cancelRequestedAll = false;
		}
	}

	requestCancelAll(): boolean {
		if (!this.syncingAll && this.syncingAccountIds.size === 0) {
			return false;
		}
		this.cancelRequestedAll = true;
		return true;
	}

	requestCancelAccount(accountId: string): boolean {
		if (!this.syncingAll && !this.syncingAccountIds.has(accountId)) {
			return false;
		}
		this.cancelRequestedAccountIds.add(accountId);
		return true;
	}

	isCancelRequestedAll(): boolean {
		return this.cancelRequestedAll;
	}

	isCancelRequestedForAccount(accountId: string): boolean {
		return this.cancelRequestedAll || this.cancelRequestedAccountIds.has(accountId);
	}

	isSyncingAll(): boolean {
		return this.syncingAll;
	}

	isAccountSyncing(accountId: string): boolean {
		return this.syncingAccountIds.has(accountId);
	}

	getSnapshot(): EpgSyncStateSnapshot {
		return {
			syncingAll: this.syncingAll,
			syncingAccountIds: Array.from(this.syncingAccountIds),
			cancelRequestedAll: this.cancelRequestedAll,
			cancelRequestedAccountIds: Array.from(this.cancelRequestedAccountIds)
		};
	}
}

let epgSyncStateInstance: EpgSyncState | null = null;

export function getEpgSyncState(): EpgSyncState {
	if (!epgSyncStateInstance) {
		epgSyncStateInstance = new EpgSyncState();
	}
	return epgSyncStateInstance;
}
