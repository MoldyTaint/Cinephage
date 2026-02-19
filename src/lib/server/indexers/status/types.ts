/**
 * Status and health tracking types.
 */

/** Indexer health status */
export type HealthStatus = 'healthy' | 'warning' | 'failing' | 'disabled';

/** Single failure record */
export interface FailureRecord {
	timestamp: Date;
	message: string;
	requestUrl?: string;
}

/** Indexer status snapshot */
export interface IndexerStatus {
	indexerId: string;

	/** Whether the indexer is enabled by user */
	isEnabled: boolean;

	/** Whether the indexer is disabled due to failures */
	isDisabled: boolean;

	/** When the indexer was auto-disabled */
	disabledAt?: Date;

	/** When the indexer can be retried */
	disabledUntil?: Date;

	/** Overall health assessment */
	health: HealthStatus;

	/** Consecutive failure count */
	consecutiveFailures: number;

	/** Last N failures for debugging */
	recentFailures: FailureRecord[];

	/** Last successful request */
	lastSuccess?: Date;

	/** Last failed request */
	lastFailure?: Date;

	/** Total request count (since startup) */
	totalRequests: number;

	/** Total failure count (since startup) */
	totalFailures: number;

	/** Average response time (ms) */
	avgResponseTime?: number;

	/** Priority (from config) */
	priority: number;
}

/** Status tracker configuration */
export interface StatusTrackerConfig {
	/** Failures before auto-disable */
	failuresBeforeDisable: number;
	/** Maximum recent failures to keep */
	maxRecentFailures: number;
	/** Base backoff time (ms) */
	baseBackoffMs: number;
	/** Maximum backoff time (ms) */
	maxBackoffMs: number;
	/** Backoff multiplier */
	backoffMultiplier: number;
}

/** Default configuration */
export const DEFAULT_STATUS_CONFIG: StatusTrackerConfig = {
	failuresBeforeDisable: 3,
	maxRecentFailures: 10,
	baseBackoffMs: 5_000, // 5 seconds
	maxBackoffMs: 60_000, // 1 minute
	backoffMultiplier: 2
};

/** Create a default status for a new indexer */
export function createDefaultStatus(
	indexerId: string,
	enabled: boolean = true,
	priority: number = 25
): IndexerStatus {
	return {
		indexerId,
		isEnabled: enabled,
		isDisabled: false,
		health: 'healthy',
		consecutiveFailures: 0,
		recentFailures: [],
		totalRequests: 0,
		totalFailures: 0,
		priority
	};
}
