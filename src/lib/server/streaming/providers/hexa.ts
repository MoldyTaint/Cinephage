/**
 * Hexa Provider
 *
 * Requires random API key in header for encryption.
 *
 * Pattern: Generate random key → Fetch with X-Api-Key header → Decrypt with key
 */

import { logger } from '$lib/logging';
import { BaseProvider } from './base';
import type { ProviderConfig, SearchParams, StreamResult } from './types';

const streamLog = { logCategory: 'streams' as const };

// ============================================================================
// Response Types
// ============================================================================

interface HexaDecryptedResponse {
	stream?: string;
	file?: string;
	url?: string;
	sources?: Array<{
		url?: string;
		file?: string;
		server?: string;
		type?: string;
	}>;
}

// ============================================================================
// Provider Implementation
// ============================================================================

export class HexaProvider extends BaseProvider {
	readonly config: ProviderConfig = {
		id: 'hexa',
		name: 'Hexa',
		priority: 50,
		enabledByDefault: true,
		supportsMovies: true,
		supportsTv: true,
		supportsAnime: false,
		supportsAsianDrama: false,
		requiresProxy: true,
		referer: 'https://hexa.su/',
		timeout: 15000
	};

	protected async doExtract(params: SearchParams): Promise<StreamResult[]> {
		// Generate random 32-byte hex key
		const key = this.generateRandomHexKey(32);

		// Build URL based on content type
		let url: string;
		if (params.type === 'movie') {
			url = `https://themoviedb.hexa.su/api/tmdb/movie/${params.tmdbId}/images`;
		} else {
			if (params.season === undefined || params.episode === undefined) {
				logger.debug('Hexa requires season and episode for TV shows', streamLog);
				return [];
			}
			url = `https://themoviedb.hexa.su/api/tmdb/tv/${params.tmdbId}/season/${params.season}/episode/${params.episode}/images`;
		}

		// Fetch with API key header
		const encrypted = await this.fetchGet<string>(url, {
			headers: {
				'X-Api-Key': key,
				Accept: 'plain/text'
			},
			responseType: 'text'
		});

		if (!encrypted || encrypted.length < 10) {
			logger.debug('No encrypted data from Hexa', streamLog);
			return [];
		}

		// Decrypt with the key we generated
		const decrypted = await this.encDec.decryptHexa<HexaDecryptedResponse>({
			text: encrypted,
			key: key
		});

		// Extract stream URL (API returns sources[].url, not sources[].file)
		const streamUrl =
			decrypted.stream ||
			decrypted.file ||
			decrypted.url ||
			decrypted.sources?.[0]?.url ||
			decrypted.sources?.[0]?.file;

		if (!this.isValidStreamUrl(streamUrl)) {
			logger.debug('No valid stream URL in Hexa response', streamLog);
			return [];
		}

		return [
			this.createStreamResult(streamUrl, {
				quality: 'Auto',
				title: 'Hexa Stream',
				language: 'en', // Hexa sources English-language content
				referer: '' // Hexa CDN rejects requests with referer headers
			})
		];
	}

	private generateRandomHexKey(bytes: number): string {
		const array = new Uint8Array(bytes);
		crypto.getRandomValues(array);
		return Array.from(array)
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('');
	}
}
