/**
 * XPrime Provider
 *
 * Requires turnstile token for access.
 *
 * Pattern: Get turnstile token → Fetch encrypted → Decrypt via /dec-xprime
 */

import { logger } from '$lib/logging';
import { BaseProvider } from './base';
import type { ProviderConfig, SearchParams, StreamResult } from './types';

const streamLog = { logCategory: 'streams' as const };

// ============================================================================
// Configuration
// ============================================================================

const XPRIME_SERVERS = ['primebox', 'nova', 'filmbox'];

// ============================================================================
// Response Types
// ============================================================================

interface XPrimeDecryptedResponse {
	stream?: string;
	url?: string;
	file?: string;
	sources?: Array<{
		file: string;
		type?: string;
	}>;
}

// ============================================================================
// Provider Implementation
// ============================================================================

export class XPrimeProvider extends BaseProvider {
	readonly config: ProviderConfig = {
		id: 'xprime',
		name: 'XPrime',
		priority: 30,
		enabledByDefault: false, // Disabled: 0% success rate, always returns 403/404
		supportsMovies: true,
		supportsTv: true,
		supportsAnime: false,
		supportsAsianDrama: false,
		requiresProxy: true,
		referer: 'https://xprime.tv/',
		timeout: 15000,
		requirements: {
			imdbId: true,
			title: true,
			year: true
		}
	};

	protected async doExtract(params: SearchParams): Promise<StreamResult[]> {
		// Get turnstile token
		const token = await this.encDec.getXPrimeToken();

		const results: StreamResult[] = [];

		// Try each server
		for (const server of XPRIME_SERVERS) {
			try {
				const stream = await this.extractFromServer(server, params, token);
				if (stream) {
					results.push(stream);
					break; // One successful stream is enough
				}
			} catch (error) {
				logger.debug('XPrime server failed', {
					server,
					error: error instanceof Error ? error.message : String(error),
					...streamLog
				});
			}
		}

		return results;
	}

	private async extractFromServer(
		server: string,
		params: SearchParams,
		token: string
	): Promise<StreamResult | null> {
		// Build URL
		const queryParams = new URLSearchParams({
			name: params.title ?? '',
			year: params.year?.toString() ?? '',
			id: params.tmdbId,
			imdb: params.imdbId ?? '',
			turnstile: token
		});

		if (params.type === 'tv' && params.season !== undefined && params.episode !== undefined) {
			queryParams.set('season', params.season.toString());
			queryParams.set('episode', params.episode.toString());
		}

		const url = `https://backend.xprime.tv/${server}?${queryParams.toString()}`;

		// Fetch encrypted response
		const encrypted = await this.fetchGet<string>(url, {
			headers: {
				Origin: 'https://xprime.tv'
			},
			responseType: 'text'
		});

		if (!encrypted || encrypted.length < 10) {
			return null;
		}

		// Decrypt via enc-dec API
		const decrypted = await this.encDec.decrypt<XPrimeDecryptedResponse>('xprime', {
			text: encrypted
		});

		// Extract stream URL
		const streamUrl =
			decrypted.stream || decrypted.url || decrypted.file || decrypted.sources?.[0]?.file;

		if (!this.isValidStreamUrl(streamUrl)) {
			return null;
		}

		return this.createStreamResult(streamUrl, {
			quality: 'Auto',
			title: `XPrime - ${server}`,
			server
		});
	}
}
