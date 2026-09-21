import { describe, expect, it } from 'vitest';
import { RateLimiter } from './mixins.js';

/** Drain the initial token bucket so pacing behavior is observable. */
async function drain(limiter: RateLimiter, maxTokens: number): Promise<void> {
	for (let i = 0; i < maxTokens; i++) {
		await limiter.acquire();
	}
}

describe('RateLimiter concurrency', () => {
	it('spreads concurrent acquisitions instead of running them all at once', async () => {
		// 600 rpm => one token every 100ms; bucket starts full.
		const limiter = new RateLimiter(600);
		await drain(limiter, 600);

		const startedAt = Date.now();
		await Promise.all([limiter.acquire(), limiter.acquire(), limiter.acquire()]);
		const elapsed = Date.now() - startedAt;

		// The next two acquisitions must wait for refills instead of all three
		// racing through the token count at once (the pre-fix behavior).
		expect(elapsed).toBeGreaterThanOrEqual(150);
	});
});
