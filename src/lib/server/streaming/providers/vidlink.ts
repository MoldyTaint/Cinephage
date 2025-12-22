/**
 * Vidlink Provider
 *
 * Simple pattern: Encrypt TMDB ID → Use in URL → Get JSON response (no decrypt needed)
 *
 * Pattern: Encrypt ID → Fetch with encrypted ID → Parse JSON response
 */

import { logger } from '$lib/logging';
import { BaseProvider } from './base';
import type { ProviderConfig, SearchParams, StreamResult } from './types';

const streamLog = { logCategory: 'streams' as const };

// ============================================================================
// Response Types
// ============================================================================

interface VidlinkStreamResponse {
	stream?: {
		playlist: string;
	};
	status?: boolean;
}

// ============================================================================
// Provider Implementation
// ============================================================================

export class VidlinkProvider extends BaseProvider {
	readonly config: ProviderConfig = {
		id: 'vidlink',
		name: 'Vidlink',
		priority: 5, // Higher than Videasy to try first (faster)
		enabledByDefault: true,
		supportsMovies: true,
		supportsTv: true,
		supportsAnime: false,
		supportsAsianDrama: false,
		requiresProxy: true,
		referer: 'https://vidlink.pro/',
		timeout: 15000
	};

	protected async doExtract(params: SearchParams): Promise<StreamResult[]> {
		// Encrypt TMDB ID
		const encryptedId = await this.encDec.encrypt('vidlink', params.tmdbId);

		// Build URL based on content type
		let url: string;
		if (params.type === 'movie') {
			url = `https://vidlink.pro/api/b/movie/${encryptedId}`;
		} else {
			if (params.season === undefined || params.episode === undefined) {
				logger.debug('Vidlink requires season and episode for TV shows', streamLog);
				return [];
			}
			url = `https://vidlink.pro/api/b/tv/${encryptedId}/${params.season}/${params.episode}`;
		}

		// Fetch response (JSON, no decryption needed)
		const response = await this.fetchGet<VidlinkStreamResponse>(url, {
			headers: {
				Referer: this.config.referer
			}
		});

		if (!response.stream?.playlist) {
			logger.debug('No playlist in Vidlink response', streamLog);
			return [];
		}

		return [
			this.createStreamResult(response.stream.playlist, {
				quality: 'Auto',
				title: 'Vidlink Stream',
				language: 'en' // Vidlink sources English-language content
			})
		];
	}
}
