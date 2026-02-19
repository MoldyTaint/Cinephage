import { EventEmitter } from 'events';

export interface AccountCreatedEvent {
	accountId: string;
}

export interface AccountUpdatedEvent {
	accountId: string;
}

export interface AccountDeletedEvent {
	accountId: string;
}

export interface ChannelsSyncStartedEvent {
	accountId: string;
}

export interface ChannelsSyncCompletedEvent {
	accountId: string;
	result: unknown;
}

export interface ChannelsSyncFailedEvent {
	accountId: string;
	error: string;
}

export interface EpgSyncStartedEvent {
	accountId?: string;
}

export interface EpgSyncCompletedEvent {
	accountId?: string;
}

export interface EpgSyncFailedEvent {
	accountId?: string;
	error: string;
}

type LiveTvEventMap = {
	'account:created': (event: AccountCreatedEvent) => void;
	'account:updated': (event: AccountUpdatedEvent) => void;
	'account:deleted': (event: AccountDeletedEvent) => void;
	'channels:syncStarted': (event: ChannelsSyncStartedEvent) => void;
	'channels:syncCompleted': (event: ChannelsSyncCompletedEvent) => void;
	'channels:syncFailed': (event: ChannelsSyncFailedEvent) => void;
	'lineup:updated': () => void;
	'categories:updated': () => void;
	'epg:syncStarted': (event: EpgSyncStartedEvent) => void;
	'epg:syncCompleted': (event: EpgSyncCompletedEvent) => void;
	'epg:syncFailed': (event: EpgSyncFailedEvent) => void;
};

class LiveTvEvents extends EventEmitter {
	emitAccountCreated(accountId: string): void {
		this.emit('account:created', { accountId });
	}

	emitAccountUpdated(accountId: string): void {
		this.emit('account:updated', { accountId });
	}

	emitAccountDeleted(accountId: string): void {
		this.emit('account:deleted', { accountId });
	}

	onAccountCreated(handler: LiveTvEventMap['account:created']): void {
		this.on('account:created', handler);
	}

	offAccountCreated(handler: LiveTvEventMap['account:created']): void {
		this.off('account:created', handler);
	}

	onAccountUpdated(handler: LiveTvEventMap['account:updated']): void {
		this.on('account:updated', handler);
	}

	offAccountUpdated(handler: LiveTvEventMap['account:updated']): void {
		this.off('account:updated', handler);
	}

	onAccountDeleted(handler: LiveTvEventMap['account:deleted']): void {
		this.on('account:deleted', handler);
	}

	offAccountDeleted(handler: LiveTvEventMap['account:deleted']): void {
		this.off('account:deleted', handler);
	}

	emitChannelsSyncStarted(accountId: string): void {
		this.emit('channels:syncStarted', { accountId });
	}

	emitChannelsSyncCompleted(accountId: string, result: unknown): void {
		this.emit('channels:syncCompleted', { accountId, result });
	}

	emitChannelsSyncFailed(accountId: string, error: string): void {
		this.emit('channels:syncFailed', { accountId, error });
	}

	onChannelsSyncStarted(handler: LiveTvEventMap['channels:syncStarted']): void {
		this.on('channels:syncStarted', handler);
	}

	offChannelsSyncStarted(handler: LiveTvEventMap['channels:syncStarted']): void {
		this.off('channels:syncStarted', handler);
	}

	onChannelsSyncCompleted(handler: LiveTvEventMap['channels:syncCompleted']): void {
		this.on('channels:syncCompleted', handler);
	}

	offChannelsSyncCompleted(handler: LiveTvEventMap['channels:syncCompleted']): void {
		this.off('channels:syncCompleted', handler);
	}

	onChannelsSyncFailed(handler: LiveTvEventMap['channels:syncFailed']): void {
		this.on('channels:syncFailed', handler);
	}

	offChannelsSyncFailed(handler: LiveTvEventMap['channels:syncFailed']): void {
		this.off('channels:syncFailed', handler);
	}

	emitLineupUpdated(): void {
		this.emit('lineup:updated');
	}

	onLineupUpdated(handler: LiveTvEventMap['lineup:updated']): void {
		this.on('lineup:updated', handler);
	}

	offLineupUpdated(handler: LiveTvEventMap['lineup:updated']): void {
		this.off('lineup:updated', handler);
	}

	emitCategoriesUpdated(): void {
		this.emit('categories:updated');
	}

	onCategoriesUpdated(handler: LiveTvEventMap['categories:updated']): void {
		this.on('categories:updated', handler);
	}

	offCategoriesUpdated(handler: LiveTvEventMap['categories:updated']): void {
		this.off('categories:updated', handler);
	}

	emitEpgSyncStarted(accountId?: string): void {
		this.emit('epg:syncStarted', { accountId });
	}

	emitEpgSyncCompleted(accountId?: string): void {
		this.emit('epg:syncCompleted', { accountId });
	}

	emitEpgSyncFailed(accountId: string | undefined, error: string): void {
		this.emit('epg:syncFailed', { accountId, error });
	}

	onEpgSyncStarted(handler: LiveTvEventMap['epg:syncStarted']): void {
		this.on('epg:syncStarted', handler);
	}

	offEpgSyncStarted(handler: LiveTvEventMap['epg:syncStarted']): void {
		this.off('epg:syncStarted', handler);
	}

	onEpgSyncCompleted(handler: LiveTvEventMap['epg:syncCompleted']): void {
		this.on('epg:syncCompleted', handler);
	}

	offEpgSyncCompleted(handler: LiveTvEventMap['epg:syncCompleted']): void {
		this.off('epg:syncCompleted', handler);
	}

	onEpgSyncFailed(handler: LiveTvEventMap['epg:syncFailed']): void {
		this.on('epg:syncFailed', handler);
	}

	offEpgSyncFailed(handler: LiveTvEventMap['epg:syncFailed']): void {
		this.off('epg:syncFailed', handler);
	}
}

export const liveTvEvents = new LiveTvEvents();
