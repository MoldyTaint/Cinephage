/**
 * Worker System
 * Export all worker-related types, classes, and utilities.
 */

// Types
export type {
	WorkerType,
	WorkerStatus,
	WorkerLogEntry,
	WorkerState,
	WorkerManagerConfig,
	WorkerEvent,
	StreamWorkerMetadata,
	ImportWorkerMetadata,
	ScanWorkerMetadata,
	MonitoringWorkerMetadata,
	SearchWorkerMetadata,
	SubtitleSearchWorkerMetadata,
	PortalScanWorkerMetadata,
	ChannelSyncWorkerMetadata
} from './types.js';

export { DEFAULT_WORKER_CONFIG, workerTypeToLogCategory } from './types.js';

// Base class
export { TaskWorker } from './TaskWorker.js';

// Manager
export { workerManager, ConcurrencyLimitError } from './WorkerManager.js';

// Worker implementations
export { StreamWorker, streamWorkerRegistry, type StreamWorkerOptions } from './StreamWorker.js';
export { ImportWorker, type ImportWorkerOptions } from './ImportWorker.js';
export { SearchWorker, type SearchWorkerOptions, type SearchResult } from './SearchWorker.js';
export { SubtitleSearchWorker, type SubtitleSearchWorkerOptions } from './SubtitleSearchWorker.js';
export { PortalScanWorker, type PortalScanOptions } from './PortalScanWorker.js';
export { ChannelSyncWorker, type ChannelSyncWorkerOptions } from './ChannelSyncWorker.js';
