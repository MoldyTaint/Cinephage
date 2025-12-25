/**
 * KissKH Provider
 *
 * Specialized provider for Asian dramas (Korean, Japanese, Chinese, etc.)
 *
 * Pattern: Lookup episode ID -> Encrypt -> Fetch video data
 */

import { logger } from '$lib/logging';
import { contentIdLookupService } from '../lookup';
import { BaseProvider } from './base';
import type { ProviderConfig, SearchParams, StreamResult } from './types';

const streamLog = { logCategory: 'streams' as const };

// ============================================================================
// Response Types
// ============================================================================

interface KissKHVideoResponse {
	Video?: string;
	thirdParty?: boolean;
}

// ============================================================================
// Provider Implementation
// ============================================================================

export class KissKHProvider extends BaseProvider {
	readonly config: ProviderConfig = {
		id: 'kisskh',
		name: 'KissKH',
		priority: 100,
		enabledByDefault: false, // Requires content ID lookup - enable when needed
		supportsMovies: false,
		supportsTv: true,
		supportsAnime: false,
		supportsAsianDrama: true,
		requiresProxy: true,
		referer: 'https://kisskh.do/',
		timeout: 15000,
		requirements: {
			imdbId: false,
			title: true,
			year: true
		}
	};

	canHandle(params: SearchParams): boolean {
		// Only handle TV shows (Asian dramas)
		return params.type === 'tv' && this.config.supportsAsianDrama;
	}

	protected async doExtract(params: SearchParams): Promise<StreamResult[]> {
		// Step 1: Look up KissKH episode ID from TMDB metadata
		if (!params.title) {
			logger.debug('KissKH extraction - no title provided', {
				tmdbId: params.tmdbId,
				...streamLog
			});
			return [];
		}

		const lookupResult = await contentIdLookupService.lookup('kisskh', {
			tmdbId: params.tmdbId,
			type: 'tv',
			title: params.title,
			year: params.year,
			season: params.season,
			episode: params.episode,
			alternativeTitles: params.alternativeTitles
		});

		if (!lookupResult.success || !lookupResult.episodeId) {
			logger.debug('KissKH episode ID lookup failed', {
				tmdbId: params.tmdbId,
				title: params.title,
				error: lookupResult.error,
				...streamLog
			});
			return [];
		}

		logger.debug('KissKH episode ID resolved', {
			tmdbId: params.tmdbId,
			dramaId: lookupResult.contentId,
			episodeId: lookupResult.episodeId,
			cached: lookupResult.cached,
			durationMs: lookupResult.durationMs,
			...streamLog
		});

		// Step 2: Extract streams using the resolved episode ID
		return this.extractWithContentId(lookupResult.episodeId);
	}

	/**
	 * Extract streams using KissKH episode ID
	 */
	private async extractWithContentId(contentId: string): Promise<StreamResult[]> {
		// Step 1: Get video key and fetch video data
		const vidKey = await this.encDec.encryptKissKH({
			text: contentId,
			type: 'vid'
		});

		const videoUrl = `https://kisskh.do/api/DramaList/Episode/${contentId}.png?err=false&ts=&time=&kkey=${vidKey}`;
		const videoResponse = await this.fetchGet<KissKHVideoResponse>(videoUrl);

		if (!videoResponse.Video) {
			logger.debug('No video URL in KissKH response', streamLog);
			return [];
		}

		return [
			this.createStreamResult(videoResponse.Video, {
				quality: 'Auto',
				title: 'KissKH Stream'
			})
		];
	}
}
