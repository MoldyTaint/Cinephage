/**
 * YFlix Provider (also works with 1Movies)
 *
 * Multi-step extraction similar to AnimeKai.
 *
 * Pattern (with episode ID from database):
 *   Lookup content ID + episode ID -> Encrypt -> Fetch servers -> Parse HTML -> Encrypt -> Fetch embed -> Decrypt
 *
 * Pattern (without episode ID - legacy):
 *   Lookup content ID -> Encrypt -> Fetch episodes -> Parse HTML -> Encrypt -> Fetch servers -> Parse HTML -> Encrypt -> Fetch embed -> Decrypt
 *
 * Using the database episode ID saves one API call!
 */

import { logger } from '$lib/logging';
import { contentIdLookupService } from '../lookup';
import type { LookupMediaType } from '../lookup/types';
import { BaseProvider } from './base';
import type { ProviderConfig, SearchParams, StreamResult } from './types';

const streamLog = { logCategory: 'streams' as const };

// ============================================================================
// Constants
// ============================================================================

const YFLIX_AJAX = 'https://yflix.to/ajax';

// ============================================================================
// Response Types
// ============================================================================

interface YFlixApiResponse {
	result: string;
	status?: boolean;
}

interface YFlixDecryptedResult {
	url?: string;
	file?: string;
	stream?: string;
}

type ParsedHtml = Record<string, Record<string, Record<string, string>>>;

// ============================================================================
// Provider Implementation
// ============================================================================

export class YFlixProvider extends BaseProvider {
	readonly config: ProviderConfig = {
		id: 'yflix',
		name: 'YFlix',
		priority: 60,
		enabledByDefault: true, // Content ID lookup works reliably
		supportsMovies: true,
		supportsTv: true,
		supportsAnime: false,
		supportsAsianDrama: false,
		requiresProxy: true,
		referer: 'https://yflix.to/',
		timeout: 20000
	};

	protected async doExtract(params: SearchParams): Promise<StreamResult[]> {
		// Step 1: Look up YFlix content ID from TMDB metadata
		if (!params.title) {
			logger.debug('YFlix extraction - no title provided', {
				tmdbId: params.tmdbId,
				...streamLog
			});
			return [];
		}

		const lookupResult = await contentIdLookupService.lookup('yflix', {
			tmdbId: params.tmdbId,
			type: params.type as LookupMediaType,
			title: params.title,
			year: params.year,
			season: params.season,
			episode: params.episode,
			alternativeTitles: params.alternativeTitles
		});

		if (!lookupResult.success || !lookupResult.contentId) {
			logger.debug('YFlix content ID lookup failed', {
				tmdbId: params.tmdbId,
				title: params.title,
				error: lookupResult.error,
				...streamLog
			});
			return [];
		}

		logger.debug('YFlix content ID resolved', {
			tmdbId: params.tmdbId,
			contentId: lookupResult.contentId,
			episodeId: lookupResult.episodeId,
			cached: lookupResult.cached,
			durationMs: lookupResult.durationMs,
			...streamLog
		});

		// Step 2: Extract streams using the resolved content ID
		// If we have an episode ID from the database, we can skip fetching the episodes list!
		if (lookupResult.episodeId) {
			return this.extractWithEpisodeId(lookupResult.episodeId);
		}

		return this.extractWithContentId(lookupResult.contentId, params);
	}

	/**
	 * Extract streams using pre-fetched episode ID (skips one API call!)
	 */
	private async extractWithEpisodeId(episodeId: string): Promise<StreamResult[]> {
		logger.debug('YFlix using database episode ID (optimized path)', {
			episodeId,
			...streamLog
		});

		// Step 1: Get servers list (skip episodes list fetch!)
		const encEid = await this.encDec.encrypt('movies-flix', episodeId);
		const serversResp = await this.fetchGet<YFlixApiResponse>(
			`${YFLIX_AJAX}/links/list?eid=${episodeId}&_=${encEid}`
		);

		// Step 2: Parse HTML to get server ID
		const servers = await this.encDec.parseHtml<ParsedHtml>(serversResp.result);

		// Get first available server
		const lid = servers['default']?.['1']?.lid;

		if (!lid) {
			logger.debug('No server ID found in YFlix', streamLog);
			return [];
		}

		// Step 3: Get embed
		const encLid = await this.encDec.encrypt('movies-flix', lid);
		const embedResp = await this.fetchGet<YFlixApiResponse>(
			`${YFLIX_AJAX}/links/view?id=${lid}&_=${encLid}`
		);

		// Step 4: Decrypt - result can be string OR object with url field
		const decrypted = await this.encDec.decrypt<string | YFlixDecryptedResult>('movies-flix', {
			text: embedResp.result
		});

		// Extract stream URL from response
		let streamUrl: string | undefined;
		if (typeof decrypted === 'string') {
			streamUrl = decrypted;
		} else if (decrypted && typeof decrypted === 'object') {
			streamUrl = decrypted.url || decrypted.stream || decrypted.file;
		}

		if (!streamUrl || !this.isValidStreamUrl(streamUrl)) {
			logger.debug('YFlix no valid stream URL in decrypted response', {
				type: typeof decrypted,
				...streamLog
			});
			return [];
		}

		// Check if this is a hoster embed URL that needs resolution
		if (this.isEmbedUrl(streamUrl)) {
			logger.debug('YFlix got hoster embed URL, resolving...', {
				embedUrl: streamUrl,
				...streamLog
			});
			return this.resolveEmbedUrl(streamUrl);
		}

		return [
			{
				url: streamUrl,
				quality: 'Auto',
				title: 'YFlix Stream',
				streamType: 'hls',
				referer: this.config.referer
			}
		];
	}

	/**
	 * Extract streams using YFlix content ID (legacy path - requires episode list fetch)
	 */
	private async extractWithContentId(
		contentId: string,
		params: SearchParams
	): Promise<StreamResult[]> {
		// Step 1: Get episodes list
		const encId = await this.encDec.encrypt('movies-flix', contentId);
		const episodesResp = await this.fetchGet<YFlixApiResponse>(
			`${YFLIX_AJAX}/episodes/list?id=${contentId}&_=${encId}`
		);

		// Step 2: Parse HTML to get episode ID
		const episodes = await this.encDec.parseHtml<ParsedHtml>(episodesResp.result);

		// For TV: navigate to specific episode
		// For movies: use first entry
		const season = params.season?.toString() ?? '1';
		const episode = params.episode?.toString() ?? '1';
		const eid = episodes[season]?.[episode]?.eid;

		if (!eid) {
			logger.debug('No episode ID found in YFlix', streamLog);
			return [];
		}

		// Use the optimized path from here
		return this.extractWithEpisodeId(eid);
	}
}
