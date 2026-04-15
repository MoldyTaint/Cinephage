/**
 * createSSE - Svelte-native Server-Sent Events hook
 *
 * A fully reactive SSE connection manager using Svelte 5 runes.
 * Automatically handles lifecycle, cleanup, reconnection, and tab visibility.
 *
 * @example
 * const sse = createSSE('/api/stream', {
 *   'event:name': (data) => handleEvent(data)
 * });
 *
 * {#if sse.isConnected}
 *   <span>Connected</span>
 * {/if}
 */

import { browser } from '$app/environment';
import { afterNavigate, beforeNavigate } from '$app/navigation';
import type {
	SSEHandlers,
	SSEOptions,
	SSEState,
	SSEStatus,
	SSEError,
	SSEConnectedEvent,
	SSEHeartbeatEvent
} from './types.js';
import { DEFAULT_SSE_OPTIONS } from './types.js';
import { classifyError, createSSEError } from './errors.js';

/**
 * Calculate exponential backoff delay
 */
function getBackoffDelay(attempt: number, baseDelay: number, maxDelay: number): number {
	return Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
}

/**
 * Create a reactive SSE connection
 *
 * @param url - SSE endpoint URL
 * @param handlers - Event handlers map
 * @param options - Configuration options
 * @returns Reactive SSE state object
 */
export function createSSE<T = Record<string, unknown>>(
	url: string | (() => string),
	handlers: SSEHandlers<T>,
	options: SSEOptions = {}
): SSEState {
	// Merge with defaults
	const config = { ...DEFAULT_SSE_OPTIONS, ...options };
	const getUrl = typeof url === 'function' ? url : () => url;

	// Reactive state using Svelte 5 runes
	let status = $state<SSEStatus>('idle');
	let error = $state<SSEError | null>(null);
	let reconnectCount = $state(0);
	let isPaused = $state(false);
	let maxRetriesExceeded = $state(false);

	// Internal state (not reactive)
	let eventSource: EventSource | null = null;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	let isManuallyClosed = false;
	let lastUrl = getUrl();
	let lastServerActivity = Date.now();

	// Store event listener references for cleanup
	const activeListeners: Array<{ event: string; handler: (e: MessageEvent) => void }> = [];

	/**
	 * Debug logging
	 */
	function debug(...args: unknown[]): void {
		if (config.debug) {
			void args;
		}
	}

	/**
	 * Update status and sync with connection pool
	 */
	function setStatus(newStatus: SSEStatus): void {
		status = newStatus;
	}

	function markServerActivity(): void {
		lastServerActivity = Date.now();
	}

	function scheduleReconnect(): void {
		if (isManuallyClosed || isPaused) {
			return;
		}

		if (reconnectCount < config.maxRetries) {
			setStatus('error');

			const delay = getBackoffDelay(reconnectCount, config.baseDelay, config.maxDelay);
			debug(`Reconnecting in ${delay}ms (attempt ${reconnectCount + 1})`);

			reconnectTimer = setTimeout(() => {
				reconnectCount++;
				connect();
			}, delay);
			return;
		}

		debug('Max retries reached, giving up');
		setStatus('error');
		maxRetriesExceeded = true;
	}

	/**
	 * Watch heartbeats/messages and recover stale connections.
	 */
	function setupHeartbeat(): void {
		if (heartbeatTimer) {
			clearInterval(heartbeatTimer);
		}

		const staleAfterMs = config.heartbeatInterval * 2 + 5000;
		const checkIntervalMs = Math.max(5000, Math.min(config.heartbeatInterval, 15000));
		heartbeatTimer = setInterval(() => {
			if (!eventSource || eventSource.readyState !== EventSource.OPEN) {
				return;
			}

			const elapsedMs = Date.now() - lastServerActivity;
			if (elapsedMs <= staleAfterMs) {
				return;
			}

			const elapsedSeconds = Math.floor(elapsedMs / 1000);
			const timeoutError = createSSEError('timeout', `No SSE activity for ${elapsedSeconds}s`);
			error = timeoutError;
			debug('Heartbeat timeout detected, reconnecting', { elapsedMs, staleAfterMs });
			handlers.error?.(timeoutError);
			closeConnection();
			scheduleReconnect();
		}, checkIntervalMs);
	}

	/**
	 * Clear all timers
	 */
	function clearTimers(): void {
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}
		if (heartbeatTimer) {
			clearInterval(heartbeatTimer);
			heartbeatTimer = null;
		}
	}

	/**
	 * Close current connection
	 */
	function closeConnection(nextStatus: SSEStatus = 'closed'): void {
		clearTimers();

		if (eventSource) {
			// Remove all event listeners before closing
			for (const { event, handler } of activeListeners) {
				// Cast handler to EventListener for removeEventListener
				eventSource.removeEventListener(event, handler as EventListener);
			}
			activeListeners.length = 0;
			eventSource.onerror = null;

			eventSource.close();
			eventSource = null;
		}

		setStatus(nextStatus);
	}

	/**
	 * Attempt to connect
	 */
	function connect(nextUrl = getUrl()): void {
		if (!browser || isManuallyClosed || isPaused) {
			return;
		}

		if (!nextUrl) {
			debug('Skipping SSE connection because URL is empty');
			closeConnection('closed');
			return;
		}

		// Check if already connected
		if (eventSource?.readyState === EventSource.OPEN) {
			debug('Already connected');
			return;
		}

		// Close existing connection
		closeConnection();

		setStatus('connecting');
		debug('Connecting to:', nextUrl);

		try {
			// Create new connection
			eventSource = new EventSource(nextUrl);

			// Handle connection open
			const onOpen = () => {
				debug('Connection opened');
				setStatus('connected');
				reconnectCount = 0;
				error = null;
				markServerActivity();
				setupHeartbeat();
			};
			eventSource.addEventListener('open', onOpen);
			activeListeners.push({ event: 'open', handler: onOpen });

			// Handle connected event (custom)
			const onConnected = (e: MessageEvent) => {
				markServerActivity();
				try {
					const data = JSON.parse(e.data) as SSEConnectedEvent;
					debug('Connected event:', data);
					handlers.connected?.(data);
				} catch (err) {
					debug('Failed to parse connected event:', err);
				}
			};
			eventSource.addEventListener('connected', onConnected);
			activeListeners.push({ event: 'connected', handler: onConnected });

			// Handle heartbeat
			const onHeartbeat = (e: MessageEvent) => {
				markServerActivity();
				try {
					const data = JSON.parse(e.data) as SSEHeartbeatEvent;
					handlers.heartbeat?.(data);
				} catch {
					// Ignore parse errors for heartbeat
				}
			};
			eventSource.addEventListener('heartbeat', onHeartbeat);
			activeListeners.push({ event: 'heartbeat', handler: onHeartbeat });

			// Wire up custom event handlers
			for (const [eventName, handler] of Object.entries(handlers)) {
				if (eventName === 'connected' || eventName === 'heartbeat' || eventName === 'error') {
					continue;
				}

				const listener = (e: MessageEvent) => {
					markServerActivity();
					try {
						const data = JSON.parse(e.data);
						debug(`Event: ${eventName}`, data);
						handler?.(data);
					} catch (err) {
						debug(`Failed to parse event "${eventName}":`, err);
					}
				};
				eventSource.addEventListener(eventName, listener);
				activeListeners.push({ event: eventName, handler: listener });
			}

			// Handle errors
			eventSource.onerror = (e) => {
				if (isManuallyClosed) return;

				const { type, message } = classifyError(e);
				const nextError = createSSEError(type, message);
				error = nextError;

				debug('Connection error:', type, message);

				handlers.error?.(nextError);

				// Close current connection
				closeConnection();

				scheduleReconnect();
			};
		} catch (err) {
			debug('Failed to create EventSource:', err);
			const message = err instanceof Error ? err.message : 'Unknown error';
			const nextError = createSSEError('client', message);
			error = nextError;
			setStatus('error');
			handlers.error?.(nextError);
			scheduleReconnect();
		}
	}

	/**
	 * Manual close function
	 */
	function close(): void {
		debug('Manual close called');
		isManuallyClosed = true;
		closeConnection('closed');
	}

	/**
	 * Manual reconnect function
	 */
	function reconnect(): void {
		debug('Manual reconnect called');
		isManuallyClosed = false;
		reconnectCount = 0;
		maxRetriesExceeded = false;
		connect();
	}

	// Main connection lifecycle using SvelteKit navigation hooks
	// Connect AFTER navigation completes so query/tab navigation can recover if needed.
	afterNavigate(() => {
		if (!browser) return;
		connect();
	});

	// Only force-close on full page unload; in-app navigation should not disable reconnect.
	beforeNavigate((navigation) => {
		if (navigation.willUnload) {
			closeConnection('closed');
		}
	});

	// Cleanup on component destroy (for non-navigation scenarios)
	$effect(() => {
		return () => {
			debug('Cleaning up connection');
			closeConnection('closed');
		};
	});

	// Watch for URL changes (for reactive URLs)
	$effect(() => {
		const resolvedUrl = getUrl();
		if (resolvedUrl !== lastUrl) {
			debug('URL changed, reconnecting');
			lastUrl = resolvedUrl;
			reconnectCount = 0;
			isManuallyClosed = false;
			connect(resolvedUrl);
		}
	});

	// Tab visibility handling
	$effect(() => {
		if (!browser || !config.pauseOnHidden) return;

		function handleVisibilityChange(): void {
			if (document.hidden) {
				debug('Tab hidden, pausing connection');
				isPaused = true;
				closeConnection('paused');
			} else if (config.reconnectOnVisible) {
				debug('Tab visible, resuming connection');
				isPaused = false;
				connect();
			}
		}

		document.addEventListener('visibilitychange', handleVisibilityChange);

		return () => {
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		};
	});

	// Network status handling
	$effect(() => {
		if (!browser) return;

		function handleOnline(): void {
			debug('Network online');
			if (status === 'offline') {
				connect();
			}
		}

		function handleOffline(): void {
			debug('Network offline');
			closeConnection('offline');
		}

		window.addEventListener('online', handleOnline);
		window.addEventListener('offline', handleOffline);

		return () => {
			window.removeEventListener('online', handleOnline);
			window.removeEventListener('offline', handleOffline);
		};
	});

	// Return reactive state object (Svelte-compatible)
	return {
		get status() {
			return status;
		},
		get error() {
			return error;
		},
		get isConnected() {
			return status === 'connected';
		},
		get isPaused() {
			return isPaused;
		},
		get reconnectCount() {
			return reconnectCount;
		},
		get maxRetriesExceeded() {
			return maxRetriesExceeded;
		},
		close,
		reconnect
	};
}

/**
 * Create a reactive SSE connection with dynamic URL
 *
 * Automatically reconnects when the URL changes.
 *
 * @example
 * const sse = createDynamicSSE(
 *   () => `/api/stream?id=${movieId}`,
 *   { 'event': handler }
 * );
 */
export function createDynamicSSE<T = Record<string, unknown>>(
	getUrl: () => string,
	handlers: SSEHandlers<T>,
	options: SSEOptions = {}
): SSEState {
	return createSSE(getUrl, handlers, options);
}
