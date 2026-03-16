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
}

class EpgSyncState {
	private syncingAll = false;
	private readonly syncingAccountIds = new Set<string>();

	tryStartAll(): boolean {
		if (this.syncingAll || this.syncingAccountIds.size > 0) {
			return false;
		}
		this.syncingAll = true;
		return true;
	}

	finishAll(): void {
		this.syncingAll = false;
	}

	tryStartAccount(accountId: string): boolean {
		if (this.syncingAll || this.syncingAccountIds.has(accountId)) {
			return false;
		}
		this.syncingAccountIds.add(accountId);
		return true;
	}

	finishAccount(accountId: string): void {
		this.syncingAccountIds.delete(accountId);
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
			syncingAccountIds: Array.from(this.syncingAccountIds)
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
