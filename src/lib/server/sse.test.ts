import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSSEStream, createSSEHandler } from './sse';

describe('createSSEStream', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('should return Response with correct headers', async () => {
		const response = createSSEStream((_send) => {
			return () => {};
		});

		expect(response).toBeInstanceOf(Response);
		expect(response.headers.get('Content-Type')).toBe('text/event-stream');
		expect(response.headers.get('Cache-Control')).toBe('no-cache');
		expect(response.headers.get('Connection')).toBe('keep-alive');
	});

	it('should send initial connected event', async () => {
		const response = createSSEStream((_send) => {
			return () => {};
		});

		const reader = response.body!.getReader();
		const decoder = new TextDecoder();

		// Read both chunks (event line and data line)
		const chunks: string[] = [];
		for (let i = 0; i < 2; i++) {
			const { value } = await reader.read();
			if (value) {
				chunks.push(decoder.decode(value));
			}
		}

		const text = chunks.join('');
		expect(text).toContain('event: connected');
		expect(text).toContain('timestamp');
		expect(text).toMatch(/\d{4}-\d{2}-\d{2}T/); // ISO date format

		await reader.cancel();
	});

	it('should call setup function with send', async () => {
		const setup = vi.fn((send) => {
			send('test', { data: 'value' });
			return () => {};
		});

		const response = createSSEStream(setup);
		const reader = response.body!.getReader();
		const decoder = new TextDecoder();

		// Collect chunks for connected + test event (4 chunks total)
		const chunks: string[] = [];
		for (let i = 0; i < 4; i++) {
			const { value } = await reader.read();
			if (value) {
				chunks.push(decoder.decode(value));
			}
		}

		const text = chunks.join('');

		expect(setup).toHaveBeenCalled();
		expect(text).toContain('event: connected');
		expect(text).toContain('event: test');
		expect(text).toContain('"data":"value"');

		await reader.cancel();
	});

	it('should support async setup function', async () => {
		const setup = vi.fn(async (send) => {
			await Promise.resolve();
			send('async', { data: 'async-value' });
			return () => {};
		});

		const response = createSSEStream(setup);
		const reader = response.body!.getReader();
		const decoder = new TextDecoder();

		// Wait for async operations
		await vi.advanceTimersByTimeAsync(0);

		// Collect chunks
		const chunks: string[] = [];
		for (let i = 0; i < 4; i++) {
			const { value } = await reader.read();
			if (value) {
				chunks.push(decoder.decode(value));
			}
		}

		const text = chunks.join('');

		expect(text).toContain('event: async');
		expect(text).toContain('"data":"async-value"');

		await reader.cancel();
	});

	it('should call cleanup on cancel', async () => {
		const cleanup = vi.fn();
		const setup = vi.fn((_send) => {
			return cleanup;
		});

		const response = createSSEStream(setup);
		const reader = response.body!.getReader();

		// Read some data first
		await reader.read();

		// Cancel the stream
		await reader.cancel();

		expect(cleanup).toHaveBeenCalled();
	});

	it('should send custom events', async () => {
		const response = createSSEStream((send) => {
			send('custom-event', { foo: 'bar', number: 42 });
			return () => {};
		});

		const reader = response.body!.getReader();
		const decoder = new TextDecoder();

		// Collect chunks for connected + custom event (4 chunks total)
		const chunks: string[] = [];
		for (let i = 0; i < 4; i++) {
			const { value } = await reader.read();
			if (value) {
				chunks.push(decoder.decode(value));
			}
		}

		const text = chunks.join('');

		expect(text).toContain('event: custom-event');
		expect(text).toContain('"foo":"bar"');
		expect(text).toContain('"number":42');

		await reader.cancel();
	});

	it('should send heartbeat events', async () => {
		const response = createSSEStream(
			(_send) => {
				return () => {};
			},
			{ heartbeatInterval: 1000 }
		);

		const reader = response.body!.getReader();
		const decoder = new TextDecoder();

		// Read connected event (2 chunks)
		await reader.read();
		await reader.read();

		// Advance timers for heartbeat
		vi.advanceTimersByTime(1000);

		// Read heartbeat event (2 chunks)
		const chunks: string[] = [];
		for (let i = 0; i < 2; i++) {
			const { value } = await reader.read();
			if (value) {
				chunks.push(decoder.decode(value));
			}
		}

		const text = chunks.join('');

		expect(text).toContain('event: heartbeat');
		expect(text).toContain('timestamp');

		await reader.cancel();
	});
});

describe('createSSEHandler', () => {
	it('should return a RequestHandler', async () => {
		const handler = createSSEHandler((_send) => {
			return () => {};
		});

		expect(typeof handler).toBe('function');
	});

	it('should return Response when called', async () => {
		const handler = createSSEHandler((_send) => {
			return () => {};
		});

		const response = await handler(
			// @ts-expect-error handler ignores the request parameter in this test
			{}
		);

		expect(response).toBeInstanceOf(Response);
		expect(response.headers.get('Content-Type')).toBe('text/event-stream');
	});

	it('should pass options to createSSEStream', async () => {
		const handler = createSSEHandler(
			(_send) => {
				return () => {};
			},
			{ heartbeatInterval: 5000 }
		);

		const response = await handler(
			// @ts-expect-error handler ignores the request parameter in this test
			{}
		);
		expect(response).toBeInstanceOf(Response);
	});
});
