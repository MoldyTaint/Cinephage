import type { RequestEvent } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';

import { checkApiRateLimit } from './rate-limit.js';

function createEvent(
	pathname: string,
	options: {
		authenticatedUser?: boolean;
		apiKey?: boolean;
		userAgent?: string;
	} = {}
): RequestEvent {
	const request = new Request(`http://localhost${pathname}`, {
		headers: {
			'user-agent': options.userAgent ?? 'vitest-agent'
		}
	});

	return {
		request,
		url: new URL(request.url),
		locals: {
			correlationId: 'test-correlation-id',
			user: options.authenticatedUser
				? ({
						id: 'test-user',
						name: null,
						email: 'admin@example.com',
						emailVerified: 1,
						image: null,
						username: 'admin',
						displayUsername: 'admin',
						role: 'admin',
						language: 'en',
						banned: 0,
						banReason: null,
						banExpires: null,
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString()
					} as App.Locals['user'])
				: null,
			session: null,
			apiKey: options.apiKey ? 'test-api-key' : null,
			apiKeyPermissions: null
		},
		getClientAddress: () => '127.0.0.1'
	} as unknown as RequestEvent;
}

describe('checkApiRateLimit', () => {
	it('bypasses shared API limits for authenticated internal requests', () => {
		const userAgent = `auth-user-${Date.now()}`;
		for (let i = 0; i < 150; i++) {
			const response = checkApiRateLimit(
				createEvent('/api/activity', {
					authenticatedUser: true,
					userAgent
				})
			);
			expect(response).toBeNull();
		}
	});

	it('continues to rate limit unauthenticated API requests', () => {
		const userAgent = `unauth-user-${Date.now()}`;
		let blockedResponse: Response | null = null;

		for (let i = 0; i < 101; i++) {
			blockedResponse = checkApiRateLimit(createEvent('/api/library/movies', { userAgent }));
		}

		expect(blockedResponse).not.toBeNull();
		expect(blockedResponse?.status).toBe(429);
	});

	it('keeps auth endpoint protection even when a user session exists', () => {
		const userAgent = `auth-route-${Date.now()}`;
		let blockedResponse: Response | null = null;

		for (let i = 0; i < 6; i++) {
			blockedResponse = checkApiRateLimit(
				createEvent('/api/auth/sign-in/email', {
					authenticatedUser: true,
					userAgent
				})
			);
		}

		expect(blockedResponse).not.toBeNull();
		expect(blockedResponse?.status).toBe(429);
	});

	it('bypasses shared limiter for validated streaming api-key traffic', () => {
		const userAgent = `streaming-api-key-${Date.now()}`;

		for (let i = 0; i < 80; i++) {
			const response = checkApiRateLimit(
				createEvent('/api/streaming/session/movie/123/master.m3u8', {
					apiKey: true,
					userAgent
				})
			);
			expect(response).toBeNull();
		}
	});
});
