import type {
	SSEConfig,
	SSEConnectionStatus,
	SSEHandlerMap,
	SSEConnectedEvent,
	SSEHeartbeatEvent
} from '$lib/types/sse';

/**
 * Default SSE configuration values
 */
const DEFAULT_CONFIG: Required<Pick<SSEConfig, 'initialReconnectDelay' | 'maxReconnectDelay'>> = {
	initialReconnectDelay: 1000,
	maxReconnectDelay: 30000
};

/**
 * Creates a reactive SSE connection using Svelte 5 runes
 *
 * @param url - URL for the SSE endpoint
 * @param handlers - Map of event names to handler functions
 * @param options - Optional configuration overrides
 * @returns Reactive SSE state and control functions
 *
 * @example
 * const { status, reconnectAttempts, isConnected, close } = createSSE(
 *   '/api/activity/stream',
 *   {
 *     'activity:new': (data) => console.log('New activity:', data),
 *     'activity:updated': (data) => console.log('Updated:', data)
 *   }
 * );
 */
export function createSSE<T extends Record<string, unknown>>(
	url: string,
	handlers: SSEHandlerMap<T>,
	options: Partial<Omit<SSEConfig, 'url'>> = {}
): {
	/** Current connection status */
	readonly status: SSEConnectionStatus;
	/** Number of reconnection attempts */
	readonly reconnectAttempts: number;
	/** Whether currently connected */
	readonly isConnected: boolean;
	/** Close the connection manually */
	close: () => void;
} {
	// Reactive state
	let status = $state<SSEConnectionStatus>('connecting');
	let reconnectAttempts = $state(0);

	// Private state (not exposed)
	let eventSource: EventSource | null = null;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	let isManuallyClosed = false;

	const initialDelay = options.initialReconnectDelay ?? DEFAULT_CONFIG.initialReconnectDelay;
	const maxDelay = options.maxReconnectDelay ?? DEFAULT_CONFIG.maxReconnectDelay;

	/**
	 * Calculate reconnection delay with exponential backoff
	 */
	function getReconnectDelay(): number {
		const delay = Math.min(initialDelay * Math.pow(2, reconnectAttempts), maxDelay);
		return delay;
	}

	/**
	 * Connect to the SSE endpoint
	 */
	function connect(): void {
		if (isManuallyClosed) return;

		status = 'connecting';

		try {
			eventSource = new EventSource(url);

			// Handle connection open
			eventSource.addEventListener('connected', (_e: MessageEvent) => {
				const event = _e as MessageEvent<string>;
				const data = JSON.parse(event.data) as SSEConnectedEvent;
				status = 'connected';
				reconnectAttempts = 0;
				handlers.connected?.(data as T['connected']);
			});

			// Set up heartbeat handler
			eventSource.addEventListener('heartbeat', (_e: MessageEvent) => {
				const event = _e as MessageEvent<string>;
				const data = JSON.parse(event.data) as SSEHeartbeatEvent;
				handlers.heartbeat?.(data as T['heartbeat']);
			});

			// Wire up custom event handlers
			for (const [eventName, handler] of Object.entries(handlers)) {
				if (eventName === 'connected' || eventName === 'heartbeat') continue;

				eventSource.addEventListener(eventName, (_e: MessageEvent) => {
					const event = _e as MessageEvent<string>;
					try {
						const data = JSON.parse(event.data);
						handler?.(data);
					} catch (error) {
						console.error(`[SSE] Failed to parse event "${eventName}":`, error);
					}
				});
			}

			// Handle errors and reconnection
			eventSource.onerror = () => {
				if (isManuallyClosed) return;

				status = 'error';

				// Close current connection
				if (eventSource) {
					eventSource.close();
					eventSource = null;
				}

				// Schedule reconnection with exponential backoff
				const delay = getReconnectDelay();
				reconnectTimer = setTimeout(() => {
					reconnectAttempts++;
					connect();
				}, delay);
			};
		} catch (error) {
			console.error('[SSE] Failed to connect:', error);
			status = 'error';

			// Schedule reconnection
			const delay = getReconnectDelay();
			reconnectTimer = setTimeout(() => {
				reconnectAttempts++;
				connect();
			}, delay);
		}
	}

	/**
	 * Close the connection manually
	 */
	function close(): void {
		isManuallyClosed = true;

		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}

		if (eventSource) {
			eventSource.close();
			eventSource = null;
		}

		status = 'disconnected';
	}

	// Auto-connect on initialization
	connect();

	// Cleanup on component destruction
	$effect(() => {
		return () => {
			close();
		};
	});

	// Expose reactive state
	return {
		get status() {
			return status;
		},
		get reconnectAttempts() {
			return reconnectAttempts;
		},
		get isConnected() {
			return status === 'connected';
		},
		close
	};
}

/**
 * Creates a reactive SSE connection that supports dynamic URL changes
 *
 * @param getUrl - Function that returns the current URL (reactive)
 * @param handlers - Map of event names to handler functions
 * @param options - Optional configuration overrides
 * @returns Reactive SSE state and control functions
 *
 * @example
 * const { status, isConnected } = createDynamicSSE(
 *   () => `/api/activity/stream?filter=${$state.snapshot(filter)}`,
 *   {
 *     'activity:new': (data) => console.log('New:', data)
 *   }
 * );
 */
export function createDynamicSSE<T extends Record<string, unknown>>(
	getUrl: () => string,
	handlers: SSEHandlerMap<T>,
	options: Partial<Omit<SSEConfig, 'url'>> = {}
): {
	/** Current connection status */
	readonly status: SSEConnectionStatus;
	/** Number of reconnection attempts */
	readonly reconnectAttempts: number;
	/** Whether currently connected */
	readonly isConnected: boolean;
	/** Close the connection manually */
	close: () => void;
	/** Reconnect with current URL */
	reconnect: () => void;
} {
	let currentUrl = $state(getUrl());
	let sseInstance = createSSE<T>(currentUrl, handlers, options);

	// Watch for URL changes
	$effect(() => {
		const newUrl = getUrl();
		if (newUrl !== currentUrl) {
			currentUrl = newUrl;
			sseInstance.close();
			sseInstance = createSSE<T>(newUrl, handlers, options);
		}
	});

	return {
		get status() {
			return sseInstance.status;
		},
		get reconnectAttempts() {
			return sseInstance.reconnectAttempts;
		},
		get isConnected() {
			return sseInstance.isConnected;
		},
		close: () => sseInstance.close(),
		reconnect: () => {
			sseInstance.close();
			sseInstance = createSSE<T>(currentUrl, handlers, options);
		}
	};
}

export { createSSE as default } from './sse.svelte';
