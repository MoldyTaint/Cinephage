/**
 * Camoufox Challenge Solver
 *
 * Challenge solving logic using Camoufox anti-detect browser.
 * Camoufox handles stealth and fingerprinting internally at the C++ level.
 */

import type { Page } from 'playwright-core';
import { logger } from '$lib/logging';
import type {
	ChallengeType,
	SolveResult,
	SolveRequest,
	BrowserFetchRequest,
	BrowserFetchResult
} from '../types';
import { getCamoufoxManager, type ManagedBrowser } from './CamoufoxManager';
import { detectChallengeFromPage } from '../detection/ChallengeDetector';

/**
 * Challenge title patterns that indicate an ongoing challenge.
 * Used to detect when challenge is still active vs completed.
 */
const CHALLENGE_TITLE_PATTERNS = ['Just a moment', 'Checking', 'Please wait', 'DDoS-Guard'];

/**
 * Wait for Cloudflare challenge to complete.
 * Returns true if challenge was bypassed.
 */
async function waitForChallengeComplete(page: Page, timeout = 30000): Promise<boolean> {
	const startTime = Date.now();

	while (Date.now() - startTime < timeout) {
		try {
			// Check page title - if it's not a challenge page, we're done
			const title = await page.title();
			const isChallengeTitle = CHALLENGE_TITLE_PATTERNS.some((pattern) => title.includes(pattern));

			if (!isChallengeTitle) {
				return true;
			}

			// Check for cf_clearance cookie
			const cookies = await page.context().cookies();
			if (cookies.some((c) => c.name === 'cf_clearance')) {
				logger.debug('[CamoufoxSolver] Got cf_clearance cookie');
				// Wait a bit for page to load after cookie is set
				await new Promise((r) => setTimeout(r, 1000));
				return true;
			}
		} catch {
			// Navigation can destroy execution context - this is expected during challenge completion
			// Wait briefly and check if we now have the clearance cookie
			await new Promise((r) => setTimeout(r, 500));
			try {
				const cookies = await page.context().cookies();
				if (cookies.some((c) => c.name === 'cf_clearance')) {
					logger.debug('[CamoufoxSolver] Got cf_clearance cookie after navigation');
					return true;
				}
			} catch {
				// Context still unstable, continue waiting
			}
		}

		// Wait before next check
		await new Promise((r) => setTimeout(r, 500));
	}

	return false;
}

/**
 * Solve a challenge for the given URL using Camoufox
 */
export async function solveChallenge(
	request: SolveRequest,
	config: { headless: boolean; timeoutSeconds: number }
): Promise<SolveResult> {
	const startTime = Date.now();
	const camoufoxManager = getCamoufoxManager();
	let managed: ManagedBrowser | null = null;

	try {
		// Extract domain from URL
		const url = new URL(request.url);
		const domain = url.hostname;

		// Create browser
		managed = await camoufoxManager.createBrowserForDomain(domain, {
			headless: config.headless,
			proxy: request.proxy
		});

		const { page, context } = managed;
		const timeout = (request.timeout || config.timeoutSeconds) * 1000;

		// Add any provided cookies
		if (request.cookies && request.cookies.length > 0) {
			await camoufoxManager.addCookies(context, request.cookies);
		}

		// Navigate to the URL
		logger.debug('[CamoufoxSolver] Navigating to URL', { url: request.url });

		const response = await page.goto(request.url, {
			timeout: Math.min(timeout, 30000),
			waitUntil: 'domcontentloaded'
		});

		if (!response) {
			return createErrorResult('No response received', startTime);
		}

		// Check for challenge using the centralized detector
		const detectionResult = await detectChallengeFromPage(page);
		const { detected, type: challengeType } = detectionResult;

		// Get the actual user agent from the page
		const userAgent = await page
			.evaluate(() => navigator.userAgent)
			.catch(
				() => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0'
			);

		// If no challenge detected, we're done
		if (!detected) {
			logger.debug('[CamoufoxSolver] No challenge detected');
			const cookies = await camoufoxManager.extractCookies(context, [request.url]);
			return {
				success: true,
				cookies,
				userAgent,
				solveTimeMs: Date.now() - startTime,
				challengeType: 'unknown',
				response: {
					url: page.url(),
					status: response.status()
				}
			};
		}

		logger.debug('[CamoufoxSolver] Challenge detected', {
			type: challengeType,
			confidence: detectionResult.confidence
		});

		// Wait for challenge to complete
		// Camoufox + humanize handles most of this automatically
		const solved = await waitForChallengeComplete(page, timeout - (Date.now() - startTime));

		if (solved) {
			// Get final cookies
			const cookies = await camoufoxManager.extractCookies(context);

			logger.info('[CamoufoxSolver] Challenge solved', {
				type: challengeType,
				timeMs: Date.now() - startTime
			});

			return {
				success: true,
				cookies,
				userAgent,
				solveTimeMs: Date.now() - startTime,
				challengeType,
				response: {
					url: page.url(),
					status: 200
				}
			};
		}

		// Check if we got cookies anyway
		const finalCookies = await camoufoxManager.extractCookies(context, [request.url]);
		const hasClearance = finalCookies.some((c) => c.name === 'cf_clearance');

		if (hasClearance) {
			return {
				success: true,
				cookies: finalCookies,
				userAgent,
				solveTimeMs: Date.now() - startTime,
				challengeType
			};
		}

		return createErrorResult('Challenge not solved within timeout', startTime, challengeType);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error('[CamoufoxSolver] Error solving challenge', { error: errorMessage });
		return createErrorResult(errorMessage, startTime);
	} finally {
		// Always close the browser
		if (managed) {
			await camoufoxManager.closeBrowser(managed);
		}
	}
}

/**
 * Create an error result
 */
function createErrorResult(
	error: string,
	startTime: number,
	challengeType: ChallengeType = 'unknown'
): SolveResult {
	return {
		success: false,
		cookies: [],
		userAgent: '',
		solveTimeMs: Date.now() - startTime,
		challengeType,
		error
	};
}

/**
 * Test if a URL has a challenge without solving
 */
export async function testForChallenge(
	url: string,
	config: { headless: boolean }
): Promise<{ hasChallenge: boolean; type: ChallengeType; confidence: number }> {
	const camoufoxManager = getCamoufoxManager();
	let managed: ManagedBrowser | null = null;

	try {
		const domain = new URL(url).hostname;
		managed = await camoufoxManager.createBrowserForDomain(domain, {
			headless: config.headless
		});

		const response = await managed.page.goto(url, {
			timeout: 15000,
			waitUntil: 'domcontentloaded'
		});

		if (!response) {
			return { hasChallenge: false, type: 'unknown', confidence: 0 };
		}

		// Use centralized detector
		const result = await detectChallengeFromPage(managed.page);
		return {
			hasChallenge: result.detected,
			type: result.type,
			confidence: result.confidence
		};
	} catch (error) {
		logger.warn('[CamoufoxSolver] Error testing for challenge', {
			url,
			error: error instanceof Error ? error.message : String(error)
		});
		return { hasChallenge: false, type: 'unknown', confidence: 0 };
	} finally {
		if (managed) {
			await camoufoxManager.closeBrowser(managed);
		}
	}
}

/**
 * Fetch a page through Camoufox browser.
 * This bypasses TLS/JA3 fingerprinting issues that prevent Node.js fetch
 * from accessing Cloudflare-protected sites even with valid cookies.
 */
export async function browserFetch(
	request: BrowserFetchRequest,
	config: { headless: boolean; timeoutSeconds: number }
): Promise<BrowserFetchResult> {
	const startTime = Date.now();
	const camoufoxManager = getCamoufoxManager();
	let managed: ManagedBrowser | null = null;

	try {
		const domain = new URL(request.url).hostname;
		const timeout = (request.timeout || config.timeoutSeconds) * 1000;

		managed = await camoufoxManager.createBrowserForDomain(domain, {
			headless: config.headless,
			proxy: request.proxy
		});

		const { page } = managed;

		// For POST requests, we need to intercept and modify the request
		if (request.method === 'POST' && request.body) {
			await page.route('**/*', async (route, req) => {
				if (req.url() === request.url && req.method() === 'GET') {
					// Convert initial GET to POST
					await route.continue({
						method: 'POST',
						postData: request.body,
						headers: {
							...req.headers(),
							'Content-Type': request.contentType || 'application/x-www-form-urlencoded'
						}
					});
				} else {
					await route.continue();
				}
			});
		}

		// Navigate to the URL
		const response = await page.goto(request.url, {
			timeout: Math.min(timeout, 30000),
			waitUntil: 'domcontentloaded'
		});

		if (!response) {
			return {
				success: false,
				body: '',
				url: request.url,
				status: 0,
				headers: {},
				cookies: [],
				userAgent: '',
				error: 'No response received',
				timeMs: Date.now() - startTime
			};
		}

		// Always wait for challenge completion - Cloudflare challenges may auto-solve
		// via Camoufox's humanize feature without explicit detection
		logger.debug('[CamoufoxSolver] Waiting for any challenge to complete');
		await waitForChallengeComplete(page, timeout - (Date.now() - startTime));

		// Get the page content
		const body = await page.content();
		const finalUrl = page.url();

		logger.debug('[CamoufoxSolver] Browser fetch completed', {
			url: request.url,
			finalUrl,
			bodyLength: body.length,
			timeMs: Date.now() - startTime
		});

		const userAgent = await page
			.evaluate(() => navigator.userAgent)
			.catch(
				() => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0'
			);

		const cookies = await camoufoxManager.extractCookies(managed.context, [finalUrl]);
		const headers = response.headers();

		// Return 200 status - the initial response status may have been 403/503
		// but after solving the challenge we have successful content
		return {
			success: true,
			body,
			url: finalUrl,
			status: 200,
			headers,
			cookies,
			userAgent,
			timeMs: Date.now() - startTime
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error('[CamoufoxSolver] Browser fetch error', { error: errorMessage });
		return {
			success: false,
			body: '',
			url: request.url,
			status: 0,
			headers: {},
			cookies: [],
			userAgent: '',
			error: errorMessage,
			timeMs: Date.now() - startTime
		};
	} finally {
		if (managed) {
			await camoufoxManager.closeBrowser(managed);
		}
	}
}
