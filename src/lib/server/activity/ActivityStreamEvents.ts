import { EventEmitter } from 'node:events';

export type ActivityRefreshAction =
	| 'purge_all'
	| 'purge_older_than_retention'
	| 'delete_selected'
	| 'media_move';

export interface ActivityRefreshPayload {
	action: ActivityRefreshAction;
	timestamp: string;
}

class ActivityStreamEvents extends EventEmitter {
	emitRefresh(payload: ActivityRefreshPayload): void {
		this.emit('activity:refresh', payload);
	}
}

export const activityStreamEvents = new ActivityStreamEvents();
