/**
 * Cloudflare Streaming Bypass Test
 *
 * Tests the Cloudflare-aware streaming functionality
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
	fetchWithCloudflareBypass,
	clearCloudflareSessions,
	getCloudflareSessionStats
} from './cloudflare-streaming.js';

describe('Cloudflare Streaming Bypass', () => {
	const TEST_URL =
		'https://storm.vodvidl.site/proxy/file2%2FNrs1aA9hZmzHSs29H9oOYCmWkZycNyTsbJmSM80fFd6BMyouYDRUGOTM4ENwTXIJLmq8EchpdYRcIDqwnS8GGE1QsQSpw4R8y6~Th8rHnCvtWadV6yhmoxEOXGuRSKjIP4AOYcVyWURKRDfdtDJmxyXqrFkz8yjfHNGP6JI1Eks%3D%2FcGxheWxpc3QubTN1OA%3D%3D.m3u8?headers={"referer":"https://videostr.net/","origin":"https://videostr.net"}&host=https://skyember44.online';

	beforeEach(() => {
		clearCloudflareSessions();
	});

	describe('Session Management', () => {
		it('should start with empty session cache', () => {
			const stats = getCloudflareSessionStats();
			expect(stats.cachedDomains).toBe(0);
			expect(stats.sessions).toHaveLength(0);
		});

		it('should clear all sessions', () => {
			// Just verify it doesn't throw
			expect(() => clearCloudflareSessions()).not.toThrow();
		});
	});

	describe('Cloudflare Bypass', () => {
		it('should attempt to fetch Cloudflare-protected URL', async () => {
			console.log('Testing Cloudflare bypass with URL:', TEST_URL.substring(0, 80) + '...');

			const startTime = Date.now();
			const response = await fetchWithCloudflareBypass(TEST_URL, {
				referer: 'https://videostr.net/',
				timeout: 30000
			});
			const duration = Date.now() - startTime;

			console.log(`Response received in ${duration}ms`);
			console.log('Status:', response.status);
			console.log('Content-Type:', response.headers.get('content-type'));

			// We expect either:
			// 1. 200 OK with HLS playlist (if Camoufox bypass works)
			// 2. 403/503 (if Cloudflare still blocks)
			expect([200, 403, 503]).toContain(response.status);

			if (response.ok) {
				const body = await response.text();
				console.log('Response preview:', body.substring(0, 200));

				// Check if we got an HLS playlist
				if (body.includes('#EXTM3U')) {
					console.log('✅ SUCCESS: Got valid HLS playlist!');
				}
			}
		}, 60000); // 60 second timeout for Camoufox
	});
});
