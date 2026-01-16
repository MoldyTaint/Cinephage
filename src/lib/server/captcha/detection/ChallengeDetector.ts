/**
 * Challenge Detector
 *
 * Detects anti-bot challenges from HTTP responses and page content.
 * Focuses on challenges that Camoufox can bypass: Cloudflare (JS challenge, Turnstile, managed)
 * and DDoS-Guard.
 */

import type { Page, Response } from 'playwright-core';
import type { ChallengeDetectionResult, ChallengeType } from '../types';

/**
 * Cloudflare challenge indicators in HTTP headers
 */
const CLOUDFLARE_HEADERS = ['cf-ray', 'cf-mitigated', 'cf-chl-bypass'];

/**
 * Cloudflare challenge page patterns
 */
const CLOUDFLARE_PATTERNS = {
	titles: [
		'Just a moment...',
		'Attention Required! | Cloudflare',
		'Please Wait... | Cloudflare',
		'Checking your browser',
		'Access denied',
		'Security check'
	],
	bodyPatterns: [
		/checking your browser/i,
		/cloudflare/i,
		/please wait/i,
		/enable javascript and cookies/i,
		/ray id/i,
		/please turn javascript on/i,
		/cf-browser-verification/i,
		/challenge-platform/i
	],
	selectors: [
		'#cf-spinner-please-wait',
		'#challenge-running',
		'#challenge-stage',
		'.cf-browser-verification',
		'#cf-wrapper',
		'#challenge-form',
		'[data-ray]'
	]
};

/**
 * Turnstile widget patterns
 */
const TURNSTILE_PATTERNS = {
	selectors: [
		'[data-sitekey]',
		'.cf-turnstile',
		'iframe[src*="challenges.cloudflare.com"]',
		'iframe[src*="turnstile"]',
		'#cf-turnstile-response',
		'input[name="cf-turnstile-response"]'
	],
	iframeSrc: [
		'challenges.cloudflare.com/turnstile',
		'challenges.cloudflare.com/cdn-cgi/challenge-platform'
	]
};

/**
 * DDoS-Guard patterns
 */
const DDOS_GUARD_PATTERNS = {
	titles: ['DDoS-Guard'],
	bodyPatterns: [/ddos-guard/i, /checking your browser before accessing/i],
	headers: ['x-ddos-protection']
};

/**
 * Detect challenge type from a Playwright response
 */
export async function detectChallengeFromResponse(
	response: Response
): Promise<ChallengeDetectionResult> {
	const status = response.status();
	const headers = response.headers();

	// Check for Cloudflare headers
	const hasCloudflareHeaders = CLOUDFLARE_HEADERS.some((h) => headers[h] !== undefined);

	// 403 with CF headers often indicates a challenge
	if (status === 403 && hasCloudflareHeaders) {
		return {
			detected: true,
			type: 'cloudflare',
			confidence: 0.9
		};
	}

	// 503 is often used for challenge pages
	if (status === 503 && hasCloudflareHeaders) {
		return {
			detected: true,
			type: 'cloudflare',
			confidence: 0.85
		};
	}

	// Check for DDoS-Guard headers
	if (DDOS_GUARD_PATTERNS.headers.some((h) => headers[h] !== undefined)) {
		return {
			detected: true,
			type: 'ddos_guard',
			confidence: 0.9
		};
	}

	return { detected: false, type: 'unknown', confidence: 0 };
}

/**
 * Detect challenge type from page content
 */
export async function detectChallengeFromPage(page: Page): Promise<ChallengeDetectionResult> {
	try {
		const title = await page.title();
		const content = await page.content();

		// Check page title for Cloudflare patterns
		for (const pattern of CLOUDFLARE_PATTERNS.titles) {
			if (title.includes(pattern)) {
				return {
					detected: true,
					type: 'cloudflare',
					confidence: 0.95
				};
			}
		}

		// Check for DDoS-Guard title
		for (const pattern of DDOS_GUARD_PATTERNS.titles) {
			if (title.includes(pattern)) {
				return {
					detected: true,
					type: 'ddos_guard',
					confidence: 0.95
				};
			}
		}

		// Check for Turnstile widget (more specific than general Cloudflare)
		for (const selector of TURNSTILE_PATTERNS.selectors) {
			try {
				const element = await page.$(selector);
				if (element) {
					return {
						detected: true,
						type: 'cloudflare_turnstile',
						confidence: 0.95
					};
				}
			} catch {
				// Selector not found, continue
			}
		}

		// Check for Turnstile iframe
		for (const src of TURNSTILE_PATTERNS.iframeSrc) {
			if (content.includes(src)) {
				return {
					detected: true,
					type: 'cloudflare_turnstile',
					confidence: 0.9
				};
			}
		}

		// Check for general Cloudflare challenge selectors
		for (const selector of CLOUDFLARE_PATTERNS.selectors) {
			try {
				const element = await page.$(selector);
				if (element) {
					return {
						detected: true,
						type: 'cloudflare_managed',
						confidence: 0.9
					};
				}
			} catch {
				// Continue
			}
		}

		// Check body patterns for Cloudflare
		for (const pattern of CLOUDFLARE_PATTERNS.bodyPatterns) {
			if (pattern.test(content)) {
				return {
					detected: true,
					type: 'cloudflare',
					confidence: 0.7
				};
			}
		}

		// Check for DDoS-Guard body patterns
		for (const pattern of DDOS_GUARD_PATTERNS.bodyPatterns) {
			if (pattern.test(content)) {
				return {
					detected: true,
					type: 'ddos_guard',
					confidence: 0.8
				};
			}
		}

		return { detected: false, type: 'unknown', confidence: 0 };
	} catch {
		// If we can't analyze the page, assume no challenge
		return { detected: false, type: 'unknown', confidence: 0 };
	}
}

/**
 * Quick check if response headers indicate a challenge
 */
export function isChallengeLikely(status: number, headers: Record<string, string>): boolean {
	// Challenge pages typically return 403 or 503
	if (status !== 403 && status !== 503) {
		return false;
	}

	// Check for Cloudflare headers
	return (
		CLOUDFLARE_HEADERS.some((h) => headers[h] !== undefined) ||
		DDOS_GUARD_PATTERNS.headers.some((h) => headers[h] !== undefined)
	);
}

/**
 * Get human-readable description of a challenge type
 */
export function getChallengeDescription(type: ChallengeType): string {
	switch (type) {
		case 'cloudflare':
			return 'Cloudflare Browser Check';
		case 'cloudflare_turnstile':
			return 'Cloudflare Turnstile';
		case 'cloudflare_managed':
			return 'Cloudflare Managed Challenge';
		case 'ddos_guard':
			return 'DDoS-Guard Protection';
		default:
			return 'Unknown Challenge';
	}
}
