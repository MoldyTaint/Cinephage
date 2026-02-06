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

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();

			/**
			 * Send an SSE event
			 */
			const send: SSESendFunction = (event, data) => {
				try {
					controller.enqueue(encoder.encode(`event: ${event}\n`));
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
				} catch {
					// Connection closed, will be cleaned up by abort handler
				}
			};

			// Send initial connection event
			send('connected', { timestamp: new Date().toISOString() });

			// Set up heartbeat
			const heartbeatInterval = setInterval(() => {
				try {
					send('heartbeat', { timestamp: new Date().toISOString() });
				} catch {
					clearInterval(heartbeatInterval);
				}
			}, heartbeatIntervalMs);

			// Set up event handlers and get cleanup function
			const userCleanup = setup(send);

			// Store cleanup for abort handling
			const cleanup = () => {
				clearInterval(heartbeatInterval);
				userCleanup();
				try {
					controller.close();
				} catch {
					// Already closed
				}
			};

			// Note: We return the cleanup function for the stream close
			// The abort signal is handled by SvelteKit's request
			return cleanup;
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
