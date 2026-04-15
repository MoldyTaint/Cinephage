/**
 * SSE Event Types Index
 *
 * Export all event type definitions for SSE endpoints
 */

// Activity events
export type {
	ActivityNewEvent,
	ActivityUpdatedEvent,
	ActivityProgressEvent,
	ActivityStreamEvents
} from './activity-events.js';

// LiveTV Channel events
export type {
	NowNextEntry,
	LivetvInitialEvent,
	LineupUpdatedEvent,
	CategoriesUpdatedEvent,
	EpgNowNextEvent,
	ChannelsSyncStartedEvent,
	ChannelsSyncCompletedEvent,
	ChannelsSyncFailedEvent,
	ChannelStreamEvents
} from './livetv-channel-events.js';

// LiveTV Account events
export type {
	AccountsInitialEvent,
	AccountCreatedEvent,
	AccountUpdatedEvent,
	AccountDeletedEvent,
	AccountStreamEvents
} from './livetv-account-events.js';

// LiveTV EPG events
export type {
	EpgInitialEvent,
	EpgSyncStartedEvent,
	EpgSyncCompletedEvent,
	EpgSyncFailedEvent,
	EpgStreamEvents
} from './livetv-epg-events.js';
