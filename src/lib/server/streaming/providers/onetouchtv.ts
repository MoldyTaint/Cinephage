/**
 * OneTouchTV Provider
 *
 * Simple decrypt-only provider for TV shows.
 *
 * Pattern: Lookup content ID + slug → Fetch encrypted → Decrypt via /dec-onetouchtv
 */

import { logger } from '$lib/logging';
import { contentIdLookupService } from '../lookup';
import { BaseProvider } from './base';
import type { ProviderConfig, SearchParams, StreamResult } from './types';

const streamLog = { logCategory: 'streams' as const };

// ============================================================================
// Response Types
// ============================================================================

interface OneTouchTVDecryptedResponse {
	stream?: string;
	file?: string;
	url?: string;
	sources?: Array<{
		file: string;
		type?: string;
	}>;
}

// ============================================================================
// Provider Implementation
// ============================================================================

export class OneTouchTVProvider extends BaseProvider {
	readonly config: ProviderConfig = {
		id: 'onetouchtv',
		name: 'OneTouchTV',
		priority: 80,
		enabledByDefault: false, // Disabled: no TMDB lookup database available (site is JS-rendered)
		supportsMovies: false,
		supportsTv: false,
		supportsAnime: false,
		supportsAsianDrama: true, // Asian dramas only
		requiresProxy: true,
		referer: 'https://onetouchtv.me/',
		timeout: 15000,
		requirements: {
			imdbId: false,
			title: true,
			year: true
		}
	};

	protected async doExtract(params: SearchParams): Promise<StreamResult[]> {
		// OneTouchTV only supports TV shows
		if (params.type !== 'tv') {
			return [];
		}

		// Step 1: Look up OneTouchTV content ID and slug from TMDB metadata
		if (!params.title) {
			logger.debug('OneTouchTV extraction - no title provided', {
				tmdbId: params.tmdbId,
				...streamLog
			});
			return [];
		}

		const lookupResult = await contentIdLookupService.lookup('onetouchtv', {
			tmdbId: params.tmdbId,
			type: 'tv',
			title: params.title,
			year: params.year,
			season: params.season,
			episode: params.episode,
			alternativeTitles: params.alternativeTitles
		});

		if (!lookupResult.success || !lookupResult.contentId || !lookupResult.slug) {
			logger.debug('OneTouchTV content ID lookup failed', {
				tmdbId: params.tmdbId,
				title: params.title,
				error: lookupResult.error,
				...streamLog
			});
			return [];
		}

		logger.debug('OneTouchTV content ID resolved', {
			tmdbId: params.tmdbId,
			contentId: lookupResult.contentId,
			slug: lookupResult.slug,
			cached: lookupResult.cached,
			durationMs: lookupResult.durationMs,
			...streamLog
		});

		// Step 2: Extract streams using the resolved content ID and slug
		return this.extractWithContentId(lookupResult.contentId, lookupResult.slug, params);
	}

	/**
	 * Extract streams using OneTouchTV content ID and slug
	 */
	private async extractWithContentId(
		contentId: string,
		slug: string,
		params: SearchParams
	): Promise<StreamResult[]> {
		const episode = params.episode ?? 1;
		const url = `https://api3.devcorp.me/web/vod/${contentId}-${slug}/episode/${episode}`;

		// Fetch encrypted response
		const encrypted = await this.fetchGet<string>(url, { responseType: 'text' });

		if (!encrypted || encrypted.length < 10) {
			return [];
		}

		// Decrypt via enc-dec API
		const decrypted = await this.encDec.decrypt<OneTouchTVDecryptedResponse>('onetouchtv', {
			text: encrypted
		});

		// Extract stream URL
		const streamUrl =
			decrypted.stream || decrypted.file || decrypted.url || decrypted.sources?.[0]?.file;

		if (!this.isValidStreamUrl(streamUrl)) {
			return [];
		}

		return [
			this.createStreamResult(streamUrl, {
				quality: 'Auto',
				title: 'OneTouchTV Stream'
			})
		];
	}
}
