import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IndexerHttp } from './IndexerHttp';
import {
	getRateLimitRegistry,
	getHostRateLimiter,
	resetHostRateLimiter,
	resetRateLimitRegistry
} from '../ratelimit';

describe('IndexerHttp', () => {
	beforeEach(() => {
		resetRateLimitRegistry();
		resetHostRateLimiter();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('aborts while waiting for rate limits before issuing the request', async () => {
		const client = new IndexerHttp({
			indexerId: 'test-indexer',
			indexerName: 'Test Indexer',
			baseUrl: 'https://example.com',
			rateLimit: { requests: 1, periodMs: 1000, burst: 0 },
			defaultTimeout: 1000
		});

		const limiter = getRateLimitRegistry().get('test-indexer');
		limiter.recordRequest();

		getHostRateLimiter().setHostConfig('example.com', {
			requests: 100,
			periodMs: 1000,
			burst: 0
		});

		const fetchSpy = vi.spyOn(globalThis, 'fetch');
		const controller = new AbortController();

		const requestPromise = client.get('https://example.com/stream', {
			signal: controller.signal
		});
		const rejection = expect(requestPromise).rejects.toThrow('Aborted');

		controller.abort();
		await vi.runAllTimersAsync();

		await rejection;
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});
