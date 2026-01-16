/**
 * CamoufoxSolver Tests
 *
 * Tests for challenge solving logic with mocked browser.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { BrowserContext, Page, Cookie, Response } from 'playwright-core';
import type { ManagedBrowser } from './CamoufoxManager';
import type { ChallengeDetectionResult } from '../types';

// Create mock manager before mocking
const mockManager = {
	createBrowserForDomain: vi.fn(),
	closeBrowser: vi.fn(),
	extractCookies: vi.fn(),
	addCookies: vi.fn()
};

// Mock CamoufoxManager
vi.mock('./CamoufoxManager', () => ({
	getCamoufoxManager: vi.fn(() => mockManager)
}));

// Mock ChallengeDetector
vi.mock('../detection/ChallengeDetector', () => ({
	detectChallengeFromPage: vi.fn()
}));

// Mock logger
vi.mock('$lib/logging', () => ({
	logger: {
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	}
}));

// Import after mocking
const { solveChallenge, testForChallenge } = await import('./CamoufoxSolver');
const { detectChallengeFromPage } = await import('../detection/ChallengeDetector');

/**
 * Create a mock Page
 */
function createMockPage(): Page {
	const mockContext = {
		cookies: vi.fn().mockResolvedValue([])
	} as unknown as BrowserContext;

	return {
		goto: vi.fn(),
		title: vi.fn().mockResolvedValue('Normal Page'),
		content: vi.fn().mockResolvedValue('<html></html>'),
		url: vi.fn().mockReturnValue('https://example.com'),
		evaluate: vi.fn().mockResolvedValue('Mozilla/5.0 (Test)'),
		context: vi.fn().mockReturnValue(mockContext),
		$: vi.fn().mockResolvedValue(null)
	} as unknown as Page;
}

/**
 * Create a mock Response
 */
function createMockResponse(status = 200): Response {
	return {
		status: vi.fn().mockReturnValue(status)
	} as unknown as Response;
}

/**
 * Create a mock ManagedBrowser
 */
function createMockManagedBrowser(): ManagedBrowser {
	const page = createMockPage();
	return {
		browser: { close: vi.fn() },
		context: page.context(),
		page,
		createdAt: new Date()
	} as unknown as ManagedBrowser;
}

describe('CamoufoxSolver', () => {
	let mockManagedBrowser: ManagedBrowser;

	beforeEach(() => {
		vi.clearAllMocks();

		mockManagedBrowser = createMockManagedBrowser();
		mockManager.createBrowserForDomain.mockResolvedValue(mockManagedBrowser);
		mockManager.closeBrowser.mockResolvedValue(undefined);
		mockManager.extractCookies.mockResolvedValue([]);
		mockManager.addCookies.mockResolvedValue(undefined);

		// Default: no challenge detected
		(detectChallengeFromPage as ReturnType<typeof vi.fn>).mockResolvedValue({
			detected: false,
			type: 'unknown',
			confidence: 0
		} as ChallengeDetectionResult);
	});

	describe('solveChallenge', () => {
		it('should return success when no challenge detected', async () => {
			const mockResponse = createMockResponse(200);
			(mockManagedBrowser.page.goto as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

			const result = await solveChallenge(
				{ url: 'https://example.com' },
				{ headless: true, timeoutSeconds: 60 }
			);

			expect(result.success).toBe(true);
			expect(result.challengeType).toBe('unknown');
			expect(result.error).toBeUndefined();
		});

		it('should extract cookies on success', async () => {
			const testCookies: Cookie[] = [
				{
					name: 'session',
					value: 'abc123',
					domain: 'example.com',
					path: '/',
					expires: -1,
					httpOnly: false,
					secure: false,
					sameSite: 'Lax'
				}
			];

			mockManager.extractCookies.mockResolvedValue(testCookies);

			const mockResponse = createMockResponse(200);
			(mockManagedBrowser.page.goto as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

			const result = await solveChallenge(
				{ url: 'https://example.com' },
				{ headless: true, timeoutSeconds: 60 }
			);

			expect(result.cookies).toEqual(testCookies);
		});

		it('should extract user agent from page', async () => {
			const expectedUA =
				'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0';
			(mockManagedBrowser.page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue(expectedUA);

			const mockResponse = createMockResponse(200);
			(mockManagedBrowser.page.goto as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

			const result = await solveChallenge(
				{ url: 'https://example.com' },
				{ headless: true, timeoutSeconds: 60 }
			);

			expect(result.userAgent).toBe(expectedUA);
		});

		it('should return error when no response received', async () => {
			(mockManagedBrowser.page.goto as ReturnType<typeof vi.fn>).mockResolvedValue(null);

			const result = await solveChallenge(
				{ url: 'https://example.com' },
				{ headless: true, timeoutSeconds: 60 }
			);

			expect(result.success).toBe(false);
			expect(result.error).toBe('No response received');
		});

		it('should detect Cloudflare challenge and wait for completion', async () => {
			// Setup: challenge detected initially
			(detectChallengeFromPage as ReturnType<typeof vi.fn>).mockResolvedValue({
				detected: true,
				type: 'cloudflare',
				confidence: 0.95
			} as ChallengeDetectionResult);

			// Page starts with challenge title, then clears
			let titleCalls = 0;
			(mockManagedBrowser.page.title as ReturnType<typeof vi.fn>).mockImplementation(() => {
				titleCalls++;
				// First call returns challenge, subsequent calls return normal
				return Promise.resolve(titleCalls === 1 ? 'Just a moment...' : 'Normal Page');
			});

			const mockResponse = createMockResponse(503);
			(mockManagedBrowser.page.goto as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

			// Return cf_clearance cookie after challenge completes
			mockManager.extractCookies.mockResolvedValue([
				{
					name: 'cf_clearance',
					value: 'test123',
					domain: 'example.com',
					path: '/',
					expires: -1,
					httpOnly: true,
					secure: true,
					sameSite: 'None'
				}
			]);

			const result = await solveChallenge(
				{ url: 'https://example.com' },
				{ headless: true, timeoutSeconds: 60 }
			);

			expect(result.success).toBe(true);
			expect(result.challengeType).toBe('cloudflare');
		});

		it('should return error on timeout when challenge not solved', async () => {
			// Setup: challenge detected and never clears
			(detectChallengeFromPage as ReturnType<typeof vi.fn>).mockResolvedValue({
				detected: true,
				type: 'cloudflare',
				confidence: 0.95
			} as ChallengeDetectionResult);

			// Page always shows challenge title
			(mockManagedBrowser.page.title as ReturnType<typeof vi.fn>).mockResolvedValue(
				'Just a moment...'
			);

			// No cf_clearance cookie
			(mockManagedBrowser.page.context().cookies as ReturnType<typeof vi.fn>).mockResolvedValue([]);
			mockManager.extractCookies.mockResolvedValue([]);

			const mockResponse = createMockResponse(503);
			(mockManagedBrowser.page.goto as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

			const result = await solveChallenge(
				{ url: 'https://example.com' },
				{ headless: true, timeoutSeconds: 1 } // Very short timeout
			);

			expect(result.success).toBe(false);
			expect(result.error).toBe('Challenge not solved within timeout');
			expect(result.challengeType).toBe('cloudflare');
		});

		it('should succeed if cf_clearance cookie found even without title change', async () => {
			// Setup: challenge detected
			(detectChallengeFromPage as ReturnType<typeof vi.fn>).mockResolvedValue({
				detected: true,
				type: 'cloudflare',
				confidence: 0.95
			} as ChallengeDetectionResult);

			// Title shows challenge
			(mockManagedBrowser.page.title as ReturnType<typeof vi.fn>).mockResolvedValue(
				'Just a moment...'
			);

			// But cf_clearance cookie is present
			const cfCookie = {
				name: 'cf_clearance',
				value: 'test123',
				domain: 'example.com',
				path: '/',
				expires: -1,
				httpOnly: true,
				secure: true,
				sameSite: 'None' as const
			};
			(mockManagedBrowser.page.context().cookies as ReturnType<typeof vi.fn>).mockResolvedValue([
				cfCookie
			]);

			const mockResponse = createMockResponse(503);
			(mockManagedBrowser.page.goto as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

			const result = await solveChallenge(
				{ url: 'https://example.com' },
				{ headless: true, timeoutSeconds: 60 }
			);

			expect(result.success).toBe(true);
		});

		it('should add cookies from request', async () => {
			const requestCookies: Cookie[] = [
				{
					name: 'existing',
					value: 'cookie',
					domain: 'example.com',
					path: '/',
					expires: -1,
					httpOnly: false,
					secure: false,
					sameSite: 'Lax'
				}
			];

			const mockResponse = createMockResponse(200);
			(mockManagedBrowser.page.goto as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

			await solveChallenge(
				{ url: 'https://example.com', cookies: requestCookies },
				{ headless: true, timeoutSeconds: 60 }
			);

			expect(mockManager.addCookies).toHaveBeenCalledWith(
				mockManagedBrowser.context,
				requestCookies
			);
		});

		it('should pass proxy configuration', async () => {
			const mockResponse = createMockResponse(200);
			(mockManagedBrowser.page.goto as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

			await solveChallenge(
				{
					url: 'https://example.com',
					proxy: { url: 'http://proxy:8080', username: 'user', password: 'pass' }
				},
				{ headless: true, timeoutSeconds: 60 }
			);

			expect(mockManager.createBrowserForDomain).toHaveBeenCalledWith(
				'example.com',
				expect.objectContaining({
					proxy: { url: 'http://proxy:8080', username: 'user', password: 'pass' }
				})
			);
		});

		it('should always close browser in finally block', async () => {
			// Even when an error occurs
			(mockManagedBrowser.page.goto as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error('Navigation failed')
			);

			await solveChallenge({ url: 'https://example.com' }, { headless: true, timeoutSeconds: 60 });

			expect(mockManager.closeBrowser).toHaveBeenCalledWith(mockManagedBrowser);
		});

		it('should return error result on exception', async () => {
			(mockManagedBrowser.page.goto as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error('Navigation failed')
			);

			const result = await solveChallenge(
				{ url: 'https://example.com' },
				{ headless: true, timeoutSeconds: 60 }
			);

			expect(result.success).toBe(false);
			expect(result.error).toBe('Navigation failed');
		});

		it('should use request timeout when provided', async () => {
			const mockResponse = createMockResponse(200);
			(mockManagedBrowser.page.goto as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

			await solveChallenge(
				{ url: 'https://example.com', timeout: 30 }, // 30 seconds
				{ headless: true, timeoutSeconds: 60 }
			);

			expect(mockManagedBrowser.page.goto).toHaveBeenCalledWith(
				'https://example.com',
				expect.objectContaining({
					timeout: 30000 // Should be capped at timeout * 1000
				})
			);
		});

		it('should use fallback user agent on evaluate error', async () => {
			(mockManagedBrowser.page.evaluate as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error('Evaluate failed')
			);

			const mockResponse = createMockResponse(200);
			(mockManagedBrowser.page.goto as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

			const result = await solveChallenge(
				{ url: 'https://example.com' },
				{ headless: true, timeoutSeconds: 60 }
			);

			expect(result.userAgent).toContain('Firefox');
		});
	});

	describe('testForChallenge', () => {
		it('should return hasChallenge false for normal page', async () => {
			(detectChallengeFromPage as ReturnType<typeof vi.fn>).mockResolvedValue({
				detected: false,
				type: 'unknown',
				confidence: 0
			} as ChallengeDetectionResult);

			const mockResponse = createMockResponse(200);
			(mockManagedBrowser.page.goto as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

			const result = await testForChallenge('https://example.com', { headless: true });

			expect(result.hasChallenge).toBe(false);
			expect(result.type).toBe('unknown');
			expect(result.confidence).toBe(0);
		});

		it('should return hasChallenge true for Cloudflare page', async () => {
			(detectChallengeFromPage as ReturnType<typeof vi.fn>).mockResolvedValue({
				detected: true,
				type: 'cloudflare',
				confidence: 0.95
			} as ChallengeDetectionResult);

			const mockResponse = createMockResponse(503);
			(mockManagedBrowser.page.goto as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

			const result = await testForChallenge('https://example.com', { headless: true });

			expect(result.hasChallenge).toBe(true);
			expect(result.type).toBe('cloudflare');
			expect(result.confidence).toBe(0.95);
		});

		it('should return hasChallenge false when no response', async () => {
			(mockManagedBrowser.page.goto as ReturnType<typeof vi.fn>).mockResolvedValue(null);

			const result = await testForChallenge('https://example.com', { headless: true });

			expect(result.hasChallenge).toBe(false);
		});

		it('should return hasChallenge false on navigation error', async () => {
			(mockManagedBrowser.page.goto as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error('Timeout')
			);

			const result = await testForChallenge('https://example.com', { headless: true });

			expect(result.hasChallenge).toBe(false);
			expect(result.type).toBe('unknown');
		});

		it('should always close browser', async () => {
			(mockManagedBrowser.page.goto as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error('Error')
			);

			await testForChallenge('https://example.com', { headless: true });

			expect(mockManager.closeBrowser).toHaveBeenCalledWith(mockManagedBrowser);
		});
	});
});
