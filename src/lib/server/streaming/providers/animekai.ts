/**
 * AnimeKai Provider
 *
 * Multi-step extraction for anime content.
 *
 * Pattern: AniList resolve → Lookup content ID → Encrypt → Fetch episodes → Parse HTML → Encrypt → Fetch servers → Parse HTML → Encrypt → Fetch embed → Decrypt
 */

import { logger } from '$lib/logging';
import { anilistResolver } from '../anilist';
import { contentIdLookupService } from '../lookup';
import { BaseProvider } from './base';
import type { ProviderConfig, SearchParams, StreamResult } from './types';

const streamLog = { logCategory: 'streams' as const };

// ============================================================================
// Constants
// ============================================================================

const ANIMEKAI_AJAX = 'https://animekai.to/ajax';

// ============================================================================
// Response Types
// ============================================================================

interface AnimeKaiApiResponse {
	result: string;
	status?: boolean;
}

/**
 * AnimeKai decrypted embed response
 * Contains the stream URL and skip times
 */
interface AnimeKaiDecryptedEmbed {
	url: string;
	skip?: {
		intro?: [number, number];
		outro?: [number, number];
	};
}

type ParsedHtml = Record<string, Record<string, Record<string, string>>>;

// ============================================================================
// Provider Implementation
// ============================================================================

export class AnimeKaiProvider extends BaseProvider {
	readonly config: ProviderConfig = {
		id: 'animekai',
		name: 'AnimeKai',
		priority: 90,
		enabledByDefault: true, // Enabled for anime with dub/sub support
		supportsMovies: false, // Anime only
		supportsTv: false, // Set to false as it's anime-specific
		supportsAnime: true,
		supportsAsianDrama: false,
		requiresProxy: true,
		referer: 'https://animekai.to/',
		timeout: 20000,
		requirements: {
			imdbId: false,
			title: true,
			year: true,
			alternativeTitles: true,
			malId: true,
			anilistId: true
		}
	};

	canHandle(_params: SearchParams): boolean {
		// Only handle if explicitly marked as anime
		return this.config.supportsAnime;
	}

	protected async doExtract(params: SearchParams): Promise<StreamResult[]> {
		// Step 1: Look up AnimeKai content ID from TMDB metadata
		if (!params.title) {
			logger.debug('AnimeKai extraction - no title provided', {
				tmdbId: params.tmdbId,
				...streamLog
			});
			return [];
		}

		// Step 1a: Resolve MAL/AniList IDs via AniList API if not already present
		let malId = params.malId;
		let anilistId = params.anilistId;

		if (!malId && !anilistId) {
			logger.debug('AnimeKai resolving IDs via AniList', {
				title: params.title,
				year: params.year,
				...streamLog
			});

			const resolved = await anilistResolver.resolve(params.title, params.year);

			if (resolved.success) {
				malId = resolved.malId ?? undefined;
				anilistId = resolved.anilistId ?? undefined;

				logger.debug('AnimeKai resolved AniList IDs', {
					title: params.title,
					matchedTitle: resolved.matchedTitle,
					malId,
					anilistId,
					confidence: resolved.confidence.toFixed(2),
					cached: resolved.cached,
					...streamLog
				});
			} else {
				logger.debug('AnimeKai AniList resolution failed, falling back to title search', {
					title: params.title,
					error: resolved.error,
					...streamLog
				});
			}
		}

		// Step 1b: Look up content ID (now with resolved IDs if available)
		const lookupResult = await contentIdLookupService.lookup('animekai', {
			tmdbId: params.tmdbId,
			type: 'anime',
			title: params.title,
			year: params.year,
			season: params.season,
			episode: params.episode,
			alternativeTitles: params.alternativeTitles,
			malId,
			anilistId
		});

		if (!lookupResult.success || !lookupResult.contentId) {
			logger.debug('AnimeKai content ID lookup failed', {
				tmdbId: params.tmdbId,
				title: params.title,
				error: lookupResult.error,
				...streamLog
			});
			return [];
		}

		logger.debug('AnimeKai content ID resolved', {
			tmdbId: params.tmdbId,
			contentId: lookupResult.contentId,
			cached: lookupResult.cached,
			durationMs: lookupResult.durationMs,
			...streamLog
		});

		// Step 2: Extract streams using the resolved content ID
		return this.extractWithContentId(lookupResult.contentId, params);
	}

	/**
	 * Extract streams using AnimeKai content ID
	 */
	private async extractWithContentId(
		contentId: string,
		params: SearchParams
	): Promise<StreamResult[]> {
		// Step 1: Get episodes list
		const encId = await this.encDec.encrypt('kai', contentId);
		const episodesResp = await this.fetchGet<AnimeKaiApiResponse>(
			`${ANIMEKAI_AJAX}/episodes/list?ani_id=${contentId}&_=${encId}`
		);

		// Step 2: Parse HTML to get episode token
		const episodes = await this.encDec.parseHtml<ParsedHtml>(episodesResp.result);

		// Navigate to specific episode
		const season = params.season?.toString() ?? '1';
		const episode = params.episode?.toString() ?? '1';
		const token = episodes[season]?.[episode]?.token;

		if (!token) {
			logger.debug('No episode token found in AnimeKai', streamLog);
			return [];
		}

		// Step 3: Get servers list
		const encToken = await this.encDec.encrypt('kai', token);
		const serversResp = await this.fetchGet<AnimeKaiApiResponse>(
			`${ANIMEKAI_AJAX}/links/list?token=${token}&_=${encToken}`
		);

		// Step 4: Parse HTML to get server ID
		const servers = await this.encDec.parseHtml<ParsedHtml>(serversResp.result);

		// Determine dub/sub preference based on user's language settings
		// If user prefers English (en), try dub first; otherwise prefer sub (original Japanese)
		const prefersDub = params.preferredLanguages?.includes('en');
		const lid = prefersDub
			? servers['dub']?.['1']?.lid || servers['sub']?.['1']?.lid
			: servers['sub']?.['1']?.lid || servers['dub']?.['1']?.lid;

		// Track which type we're using for logging
		const isDub = prefersDub
			? !!servers['dub']?.['1']?.lid
			: !servers['sub']?.['1']?.lid && !!servers['dub']?.['1']?.lid;

		if (!lid) {
			logger.debug('No server ID found in AnimeKai', streamLog);
			return [];
		}

		// Step 5: Get embed
		const encLid = await this.encDec.encrypt('kai', lid);
		const embedResp = await this.fetchGet<AnimeKaiApiResponse>(
			`${ANIMEKAI_AJAX}/links/view?id=${lid}&_=${encLid}`
		);

		// Step 6: Decrypt - returns object with url and skip times
		const decrypted = await this.encDec.decrypt<AnimeKaiDecryptedEmbed>('kai', {
			text: embedResp.result
		});

		// Extract URL from decrypted object
		const streamUrl = typeof decrypted === 'string' ? decrypted : decrypted?.url;

		if (!streamUrl || !this.isValidStreamUrl(streamUrl)) {
			logger.debug('AnimeKai invalid stream URL', {
				decryptedType: typeof decrypted,
				hasUrl: !!decrypted?.url,
				...streamLog
			});
			return [];
		}

		const language = isDub ? 'Dub' : 'Sub';
		const audioLang = isDub ? 'en' : 'ja';

		// Check if this is an embed URL that needs resolution (e.g., megaup, rapidshare)
		if (this.isEmbedUrl(streamUrl)) {
			logger.debug('AnimeKai resolving embed URL', { streamUrl, ...streamLog });

			const resolved = await this.resolveEmbedUrl(streamUrl);

			if (resolved.length > 0) {
				// Add language info to resolved streams
				return resolved.map((stream) => ({
					...stream,
					title: `AnimeKai Stream (${language})`,
					language: audioLang
				}));
			}

			// If embed resolution failed, fall through to return embed URL directly
			logger.debug('AnimeKai embed resolution failed, returning embed URL', {
				streamUrl,
				...streamLog
			});
		}

		// Return as direct stream (or unresolved embed for debugging)
		return [
			this.createStreamResult(streamUrl, {
				quality: 'Auto',
				title: `AnimeKai Stream (${language})`,
				language: audioLang
			})
		];
	}
}
