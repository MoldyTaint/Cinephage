/**
 * Shared types for Server-Sent Events (SSE)
 */

/**
 * Base SSE event structure
 */
export interface SSEEvent<T = unknown> {
	event: string;
	data: T;
	timestamp: string;
}

/**
 * Standard SSE connection events
 */
export interface SSEConnectedEvent {
	timestamp: string;
}

export interface SSEHeartbeatEvent {
	timestamp: string;
}

/**
 * SSE connection status
 */
export type SSEConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

/**
 * SSE configuration options
 */
export interface SSEConfig {
	/** URL for the SSE endpoint */
	url: string;
	/** Initial reconnection delay in ms (default: 1000) */
	initialReconnectDelay?: number;
	/** Maximum reconnection delay in ms (default: 30000) */
	maxReconnectDelay?: number;
	/** Heartbeat interval in ms (default: 30000) */
	heartbeatInterval?: number;
}

/**
 * SSE handler map - maps event names to their data types
 */
export type SSEHandlerMap<T extends Record<string, unknown>> = {
	[K in keyof T]?: (data: T[K]) => void;
};

/**
 * Server-side SSE send function type
 */
export type SSESendFunction = (event: string, data: unknown) => void;

/**
 * Server-side SSE cleanup function type
 */
export type SSECleanupFunction = () => void;

/**
 * Server-side SSE handler setup function type
 */
export type SSESetupFunction = (send: SSESendFunction) => SSECleanupFunction;
