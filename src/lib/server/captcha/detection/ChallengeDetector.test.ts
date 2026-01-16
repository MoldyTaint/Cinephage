/**
 * Challenge Detector Tests
 *
 * Tests for the centralized challenge detection logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Page, Response } from 'playwright-core';
import {
	detectChallengeFromResponse,
	detectChallengeFromPage,
	isChallengeLikely,
	getChallengeDescription
} from './ChallengeDetector';

/**
 * Create a mock Playwright Response
 */
function createMockResponse(status: number, headers: Record<string, string>): Response {
	return {
		status: () => status,
		headers: () => headers
	} as unknown as Response;
}

/**
 * Create a mock Playwright Page
 */
function createMockPage(options: {
	title?: string;
	content?: string;
	selectors?: Record<string, boolean>;
}): Page {
	const { title = '', content = '', selectors = {} } = options;

	return {
		title: vi.fn().mockResolvedValue(title),
		content: vi.fn().mockResolvedValue(content),
		$: vi.fn().mockImplementation((selector: string) => {
			if (selectors[selector]) {
				return Promise.resolve({} as unknown); // Element found
			}
			return Promise.resolve(null); // Element not found
		})
	} as unknown as Page;
}

describe('ChallengeDetector', () => {
	describe('detectChallengeFromResponse', () => {
		it('should detect Cloudflare from 403 + cf-ray header', async () => {
			const response = createMockResponse(403, { 'cf-ray': '12345' });
			const result = await detectChallengeFromResponse(response);

			expect(result.detected).toBe(true);
			expect(result.type).toBe('cloudflare');
			expect(result.confidence).toBe(0.9);
		});

		it('should detect Cloudflare from 503 + cf-ray header', async () => {
			const response = createMockResponse(503, { 'cf-ray': '12345' });
			const result = await detectChallengeFromResponse(response);

			expect(result.detected).toBe(true);
			expect(result.type).toBe('cloudflare');
			expect(result.confidence).toBe(0.85);
		});

		it('should detect Cloudflare from cf-mitigated header', async () => {
			const response = createMockResponse(403, { 'cf-mitigated': 'challenge' });
			const result = await detectChallengeFromResponse(response);

			expect(result.detected).toBe(true);
			expect(result.type).toBe('cloudflare');
		});

		it('should detect Cloudflare from cf-chl-bypass header', async () => {
			const response = createMockResponse(403, { 'cf-chl-bypass': '1' });
			const result = await detectChallengeFromResponse(response);

			expect(result.detected).toBe(true);
			expect(result.type).toBe('cloudflare');
		});

		it('should detect DDoS-Guard from x-ddos-protection header', async () => {
			const response = createMockResponse(200, { 'x-ddos-protection': '1' });
			const result = await detectChallengeFromResponse(response);

			expect(result.detected).toBe(true);
			expect(result.type).toBe('ddos_guard');
			expect(result.confidence).toBe(0.9);
		});

		it('should NOT detect challenge from normal 200 response', async () => {
			const response = createMockResponse(200, { 'content-type': 'text/html' });
			const result = await detectChallengeFromResponse(response);

			expect(result.detected).toBe(false);
			expect(result.type).toBe('unknown');
			expect(result.confidence).toBe(0);
		});

		it('should NOT detect challenge from 403 without CF headers', async () => {
			const response = createMockResponse(403, { server: 'nginx' });
			const result = await detectChallengeFromResponse(response);

			expect(result.detected).toBe(false);
		});

		it('should NOT detect challenge from 500 with CF headers', async () => {
			// Only 403 and 503 are challenge status codes
			const response = createMockResponse(500, { 'cf-ray': '12345' });
			const result = await detectChallengeFromResponse(response);

			expect(result.detected).toBe(false);
		});
	});

	describe('detectChallengeFromPage', () => {
		it('should detect Cloudflare from "Just a moment..." title', async () => {
			const page = createMockPage({ title: 'Just a moment...' });
			const result = await detectChallengeFromPage(page);

			expect(result.detected).toBe(true);
			expect(result.type).toBe('cloudflare');
			expect(result.confidence).toBe(0.95);
		});

		it('should detect Cloudflare from "Checking your browser" title', async () => {
			const page = createMockPage({ title: 'Checking your browser' });
			const result = await detectChallengeFromPage(page);

			expect(result.detected).toBe(true);
			expect(result.type).toBe('cloudflare');
		});

		it('should detect Cloudflare from "Attention Required!" title', async () => {
			const page = createMockPage({ title: 'Attention Required! | Cloudflare' });
			const result = await detectChallengeFromPage(page);

			expect(result.detected).toBe(true);
			expect(result.type).toBe('cloudflare');
		});

		it('should detect DDoS-Guard from title', async () => {
			const page = createMockPage({ title: 'DDoS-Guard' });
			const result = await detectChallengeFromPage(page);

			expect(result.detected).toBe(true);
			expect(result.type).toBe('ddos_guard');
			expect(result.confidence).toBe(0.95);
		});

		it('should detect Turnstile from .cf-turnstile selector', async () => {
			const page = createMockPage({
				title: 'Normal Page',
				selectors: { '.cf-turnstile': true }
			});
			const result = await detectChallengeFromPage(page);

			expect(result.detected).toBe(true);
			expect(result.type).toBe('cloudflare_turnstile');
			expect(result.confidence).toBe(0.95);
		});

		it('should detect Turnstile from data-sitekey selector', async () => {
			const page = createMockPage({
				title: 'Normal Page',
				selectors: { '[data-sitekey]': true }
			});
			const result = await detectChallengeFromPage(page);

			expect(result.detected).toBe(true);
			expect(result.type).toBe('cloudflare_turnstile');
		});

		it('should detect Turnstile from iframe src in content', async () => {
			const page = createMockPage({
				title: 'Normal Page',
				content: '<iframe src="challenges.cloudflare.com/turnstile/xyz"></iframe>'
			});
			const result = await detectChallengeFromPage(page);

			expect(result.detected).toBe(true);
			expect(result.type).toBe('cloudflare_turnstile');
			expect(result.confidence).toBe(0.9);
		});

		it('should detect managed challenge from #challenge-running selector', async () => {
			const page = createMockPage({
				title: 'Normal Page',
				selectors: { '#challenge-running': true }
			});
			const result = await detectChallengeFromPage(page);

			expect(result.detected).toBe(true);
			expect(result.type).toBe('cloudflare_managed');
			expect(result.confidence).toBe(0.9);
		});

		it('should detect managed challenge from #challenge-stage selector', async () => {
			const page = createMockPage({
				title: 'Normal Page',
				selectors: { '#challenge-stage': true }
			});
			const result = await detectChallengeFromPage(page);

			expect(result.detected).toBe(true);
			expect(result.type).toBe('cloudflare_managed');
		});

		it('should detect Cloudflare from body pattern "checking your browser"', async () => {
			const page = createMockPage({
				title: 'Normal Page',
				content: '<p>Please wait while we are checking your browser...</p>'
			});
			const result = await detectChallengeFromPage(page);

			expect(result.detected).toBe(true);
			expect(result.type).toBe('cloudflare');
			expect(result.confidence).toBe(0.7);
		});

		it('should detect Cloudflare from body pattern "Ray ID"', async () => {
			const page = createMockPage({
				title: 'Normal Page',
				content: '<p>Cloudflare Ray ID: abc123</p>'
			});
			const result = await detectChallengeFromPage(page);

			expect(result.detected).toBe(true);
			expect(result.type).toBe('cloudflare');
		});

		it('should detect DDoS-Guard from body pattern', async () => {
			const page = createMockPage({
				title: 'Normal Page',
				content: '<p>Protected by DDoS-Guard</p>'
			});
			const result = await detectChallengeFromPage(page);

			expect(result.detected).toBe(true);
			expect(result.type).toBe('ddos_guard');
			expect(result.confidence).toBe(0.8);
		});

		it('should NOT detect challenge from normal page', async () => {
			const page = createMockPage({
				title: 'My Website',
				content: '<h1>Welcome to my website</h1>'
			});
			const result = await detectChallengeFromPage(page);

			expect(result.detected).toBe(false);
			expect(result.type).toBe('unknown');
			expect(result.confidence).toBe(0);
		});

		it('should handle page.title() errors gracefully', async () => {
			const page = {
				title: vi.fn().mockRejectedValue(new Error('Page closed')),
				content: vi.fn().mockRejectedValue(new Error('Page closed')),
				$: vi.fn().mockRejectedValue(new Error('Page closed'))
			} as unknown as Page;

			const result = await detectChallengeFromPage(page);

			expect(result.detected).toBe(false);
			expect(result.type).toBe('unknown');
		});

		it('should handle selector errors gracefully', async () => {
			const page = createMockPage({ title: 'Normal Page' });
			// Override $ to throw
			(page.$ as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Selector error'));

			const result = await detectChallengeFromPage(page);

			// Should continue to other checks and eventually return false
			expect(result.detected).toBe(false);
		});
	});

	describe('isChallengeLikely', () => {
		it('should return true for 403 + cf-ray', () => {
			const result = isChallengeLikely(403, { 'cf-ray': '12345' });
			expect(result).toBe(true);
		});

		it('should return true for 503 + cf-ray', () => {
			const result = isChallengeLikely(503, { 'cf-ray': '12345' });
			expect(result).toBe(true);
		});

		it('should return true for 403 + cf-mitigated', () => {
			const result = isChallengeLikely(403, { 'cf-mitigated': 'challenge' });
			expect(result).toBe(true);
		});

		it('should return true for 503 + x-ddos-protection', () => {
			const result = isChallengeLikely(503, { 'x-ddos-protection': '1' });
			expect(result).toBe(true);
		});

		it('should return false for 200 response', () => {
			const result = isChallengeLikely(200, { 'cf-ray': '12345' });
			expect(result).toBe(false);
		});

		it('should return false for 404 response', () => {
			const result = isChallengeLikely(404, { 'cf-ray': '12345' });
			expect(result).toBe(false);
		});

		it('should return false for 403 without CF headers', () => {
			const result = isChallengeLikely(403, { server: 'nginx' });
			expect(result).toBe(false);
		});

		it('should return false for empty headers', () => {
			const result = isChallengeLikely(403, {});
			expect(result).toBe(false);
		});
	});

	describe('getChallengeDescription', () => {
		it('should return correct description for cloudflare', () => {
			expect(getChallengeDescription('cloudflare')).toBe('Cloudflare Browser Check');
		});

		it('should return correct description for cloudflare_turnstile', () => {
			expect(getChallengeDescription('cloudflare_turnstile')).toBe('Cloudflare Turnstile');
		});

		it('should return correct description for cloudflare_managed', () => {
			expect(getChallengeDescription('cloudflare_managed')).toBe('Cloudflare Managed Challenge');
		});

		it('should return correct description for ddos_guard', () => {
			expect(getChallengeDescription('ddos_guard')).toBe('DDoS-Guard Protection');
		});

		it('should return "Unknown Challenge" for unknown type', () => {
			expect(getChallengeDescription('unknown')).toBe('Unknown Challenge');
		});
	});
});
