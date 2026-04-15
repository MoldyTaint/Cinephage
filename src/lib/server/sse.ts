import type { RequestHandler } from '@sveltejs/kit';

/**
 * Server-side SSE types
 */

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
 * Supports both sync and async setup functions
 */
export type SSESetupFunction = (
	send: SSESendFunction
) => SSECleanupFunction | Promise<SSECleanupFunction>;

export type SSEOperationFunction = (context: {
	send: SSESendFunction;
	signal: AbortSignal;
	close: () => void;
	isAborted: () => boolean;
}) => void | Promise<void>;

/**
 * SSE connected event payload
 */
export interface SSEConnectedEvent {
	timestamp: string;
}

/**
 * SSE heartbeat event payload
 */
export interface SSEHeartbeatEvent {
	timestamp: string;
}

/**
 * Creates a standard SSE Response with proper headers and lifecycle management
 *
 * @param setup - Function that receives a send function and returns a cleanup function.
 *   Can be async to allow initial data fetching before registering event handlers.
 * @param options - Optional configuration
 * @returns SvelteKit Response with SSE stream
 *
 * @example
 * export const GET: RequestHandler = async ({ request }) => {
 *   return createSSEStream(async (send) => {
 *     // Send initial data (async operation)
 *     const data = await fetchInitialData();
 *     send('initial', data);
 *
 *     // Set up event listeners
 *     const handler = (data) => send('update', data);
 *     eventEmitter.on('event', handler);
 *
 *     // Return cleanup function
 *     return () => {
 *       eventEmitter.off('event', handler);
 *     };
 *   });
 * };
 */
export function createSSEStream(
	setup: SSESetupFunction,
	options: {
		heartbeatInterval?: number;
	} = {}
): Response {
	const heartbeatIntervalMs = options.heartbeatInterval ?? 30000;
	let cleanupStream: (() => void) | null = null;

	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();
			let cleanedUp = false;
			let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
			let userCleanup: SSECleanupFunction | null = null;

			/**
			 * Send an SSE event
			 */
			const send: SSESendFunction = (event, data) => {
				try {
					controller.enqueue(encoder.encode(`event: ${event}\n`));
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
				} catch {
					// Connection closed, clean up listeners/timers immediately.
					// Must include user cleanup to avoid leaked endpoint listeners.
					cleanup();
				}
			};

			const cleanup = () => {
				if (cleanedUp) return;
				cleanedUp = true;
				if (heartbeatInterval) {
					clearInterval(heartbeatInterval);
				}
				if (userCleanup) {
					userCleanup();
					userCleanup = null;
				}
				cleanupStream = null;
				try {
					controller.close();
				} catch {
					// Already closed
				}
			};

			// Send initial connection event
			send('connected', { timestamp: new Date().toISOString() });

			// Set up heartbeat
			heartbeatInterval = setInterval(() => {
				send('heartbeat', { timestamp: new Date().toISOString() });
			}, heartbeatIntervalMs);

			try {
				// Set up event handlers and get cleanup function
				// Supports both sync and async setup functions
				userCleanup = await Promise.resolve(setup(send));
			} catch (error) {
				cleanup();
				throw error;
			}

			// ReadableStream.start() return value is ignored; use cancel() for cleanup.
			cleanupStream = cleanup;
		},
		cancel() {
			cleanupStream?.();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
}

/**
 * Creates a RequestHandler that returns an SSE stream
 *
 * @param setup - Function that receives a send function and returns a cleanup function
 * @param options - Optional configuration
 * @returns SvelteKit RequestHandler
 *
 * @example
 * export const GET = createSSEHandler((send) => {
 *   const handler = (data) => send('update', data);
 *   emitter.on('event', handler);
 *   return () => emitter.off('event', handler);
 * });
 */
export function createSSEHandler(
	setup: SSESetupFunction,
	options?: {
		heartbeatInterval?: number;
	}
): RequestHandler {
	return async () => {
		return createSSEStream(setup, options);
	};
}

export function createSSEOperationStream(
	request: Request,
	operation: SSEOperationFunction,
	options: {
		heartbeatInterval?: number;
	} = {}
): Response {
	const heartbeatIntervalMs = options.heartbeatInterval ?? 30000;

	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();
			let cleanedUp = false;
			let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

			const cleanup = () => {
				if (cleanedUp) return;
				cleanedUp = true;
				if (heartbeatInterval) {
					clearInterval(heartbeatInterval);
				}
				try {
					controller.close();
				} catch {
					// Already closed
				}
			};

			const send: SSESendFunction = (event, data) => {
				if (cleanedUp) return;
				try {
					controller.enqueue(encoder.encode(`event: ${event}\n`));
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
				} catch {
					cleanup();
				}
			};

			request.signal.addEventListener('abort', cleanup, { once: true });

			send('connected', { timestamp: new Date().toISOString() });

			heartbeatInterval = setInterval(() => {
				send('heartbeat', { timestamp: new Date().toISOString() });
			}, heartbeatIntervalMs);

			try {
				await Promise.resolve(
					operation({
						send,
						signal: request.signal,
						close: cleanup,
						isAborted: () => request.signal.aborted || cleanedUp
					})
				);
			} finally {
				cleanup();
			}
		},
		cancel() {
			// Abort handling closes the stream.
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
}
