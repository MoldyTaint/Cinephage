import type { RequestHandler } from '@sveltejs/kit';
import type { SSESendFunction, SSESetupFunction } from '$lib/types/sse';

/**
 * Creates a standard SSE Response with proper headers and lifecycle management
 *
 * @param setup - Function that receives a send function and returns a cleanup function
 * @param options - Optional configuration
 * @returns SvelteKit Response with SSE stream
 *
 * @example
 * export const GET: RequestHandler = async ({ request }) => {
 *   return createSSEStream((send) => {
 *     // Send initial data
 *     send('connected', { timestamp: new Date().toISOString() });
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
		start(controller) {
			const encoder = new TextEncoder();
			let cleanedUp = false;
			let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
			let userCleanup: () => void = () => {};

			/**
			 * Send an SSE event
			 */
			const send: SSESendFunction = (event, data) => {
				try {
					controller.enqueue(encoder.encode(`event: ${event}\n`));
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
				} catch {
					// Connection closed, clean up listeners/timers immediately
					cleanup();
				}
			};

			const cleanup = () => {
				if (cleanedUp) return;
				cleanedUp = true;
				if (heartbeatInterval) {
					clearInterval(heartbeatInterval);
				}
				userCleanup();
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

			// Set up event handlers and get cleanup function
			userCleanup = setup(send);

			// ReadableStream.start() return value is ignored; use cancel() for cleanup
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
