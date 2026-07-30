import { EventEmitter } from 'node:events';

class StorageEvents extends EventEmitter {
	emitInsightDismissed(payload: { insightId: string; dismissedAt: string }): void {
		this.emit('storage:insight-dismissed', payload);
	}

	emitInsightUndismissed(payload: { insightId: string }): void {
		this.emit('storage:insight-undismissed', payload);
	}

	emitInsightsUpdated(payload: { triggeredBy: string; timestamp: string }): void {
		this.emit('storage:insights-updated', payload);
	}
}

export const storageEvents = new StorageEvents();
