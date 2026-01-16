/**
 * Cloudflare-aware fetch utility.
 *
 * Provides a simple fetch function that automatically falls back to
 * browser-based fetching when Cloudflare protection is detected.
 *
 * This can be used by components that don't have access to IndexerHttp
 * (like AuthManager, DownloadHandler) but still need Cloudflare bypass.
 */

import { isCloudflareProtected } from './CloudflareDetection';
import { captchaSolverSettingsService, getCaptchaSolver } from '$lib/server/captcha';
import { logger } from '$lib/logging';

export interface CloudflareFetchOptions {
	method?: 'GET' | 'POST';
	headers?: Record<string, string>;
	body?: string;
	timeout?: number;
	/** If true, skip browser fallback and just return the CF-protected response */
	skipBrowserFallback?: boolean;
}

export interface CloudflareFetchResult {
	body: string;
	status: number;
	headers: Headers;
	url: string;
	/** True if the response came from browser fetch */
	usedBrowser: boolean;
}

/**
 * Fetch a URL with automatic Cloudflare bypass.
 *
 * First attempts a normal fetch. If Cloudflare is detected and the
 * captcha solver is available, falls back to browser-based fetching.
 */
export async function cloudflareFetch(
	url: string,
	options: CloudflareFetchOptions = {}
): Promise<CloudflareFetchResult> {
	const {
		method = 'GET',
		headers = {},
		body,
		timeout = 30000,
		skipBrowserFallback = false
	} = options;

	// Try normal fetch first
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeout);

	try {
		const response = await fetch(url, {
			method,
			headers,
			body,
			signal: controller.signal,
			redirect: 'follow'
		});

		const responseBody = await response.text();

		// Check for Cloudflare
		if (isCloudflareProtected(response.status, response.headers, responseBody)) {
			if (skipBrowserFallback) {
				return {
					body: responseBody,
					status: response.status,
					headers: response.headers,
					url: response.url,
					usedBrowser: false
				};
			}

			// Try browser fallback
			const solver = getCaptchaSolver();
			const captchaEnabled = captchaSolverSettingsService.isEnabled();
			if (!captchaEnabled) {
				logger.info('[cloudflareFetch] Cloudflare detected, captcha solver disabled', {
					url
				});
			} else if (solver.isAvailable()) {
				const host = new URL(url).hostname;
				logger.info('[cloudflareFetch] Cloudflare detected, using browser fallback', {
					url,
					host
				});

				const browserResult = await solver.fetch({
					url,
					method,
					body,
					timeout: Math.ceil(timeout / 1000)
				});

				if (browserResult.success) {
					logger.info('[cloudflareFetch] Browser fetch succeeded', {
						url,
						status: browserResult.status,
						bodyLength: browserResult.body.length
					});

					const responseHeaders = new Headers();
					if (browserResult.headers) {
						for (const [key, value] of Object.entries(browserResult.headers)) {
							if (value !== undefined) {
								responseHeaders.set(key, value);
							}
						}
					}

					return {
						body: browserResult.body,
						status: browserResult.status,
						headers: responseHeaders,
						url: browserResult.url,
						usedBrowser: true
					};
				}

				logger.warn('[cloudflareFetch] Browser fetch failed', {
					url,
					error: browserResult.error
				});
			}
		}

		// Return normal response
		return {
			body: responseBody,
			status: response.status,
			headers: response.headers,
			url: response.url,
			usedBrowser: false
		};
	} finally {
		clearTimeout(timeoutId);
	}
}
