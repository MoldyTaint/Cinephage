/**
 * Gestdown Provider Implementation
 *
 * Gestdown is a TV subtitle database that uses TVDB IDs.
 * Features: JSON API, TV shows only, good European language coverage.
 * API: https://api.gestdown.info
 */

import { BaseSubtitleProvider } from '../BaseProvider';
import type {
	SubtitleSearchCriteria,
	SubtitleSearchResult,
	ProviderSearchOptions,
	LanguageCode
} from '../../types';
import { createChildLogger } from '$lib/logging';

const logger = createChildLogger({ logDomain: 'subtitles' as const });
import { TooManyRequests, ServiceUnavailable } from '../../errors/ProviderErrors';
import {
	GESTDOWN_LANGUAGES,
	GESTDOWN_LANGUAGE_REVERSE,
	type GestdownShowResponse,
	type GestdownSubtitleResponse,
	type GestdownSubtitle,
	type GestdownShow
} from './types';

const API_BASE_URL = 'https://api.gestdown.info';

export class GestdownProvider extends BaseSubtitleProvider {
	get implementation(): string {
		return 'gestdown';
	}

	get supportedLanguages(): LanguageCode[] {
		return Object.keys(GESTDOWN_LANGUAGES);
	}

	get supportsHashSearch(): boolean {
		return false;
	}

	/**
	 * Gestdown only supports TV shows - check criteria
	 */
	canSearch(criteria: SubtitleSearchCriteria): boolean {
		// Gestdown is TV only - require season info
		if (criteria.season === undefined) {
			return false;
		}
		return super.canSearch(criteria);
	}

	/**
	 * Search for subtitles on Gestdown
	 */
	async search(
		criteria: SubtitleSearchCriteria,
		options?: ProviderSearchOptions
	): Promise<SubtitleSearchResult[]> {
		// Only TV shows supported
		if (criteria.season === undefined) {
			return [];
		}

		try {
			const results: SubtitleSearchResult[] = [];

			// First, find the show
			const show = await this.findShow(criteria, options?.timeout);
			if (!show) {
				logger.debug(
					{
						title: criteria.seriesTitle || criteria.title
					},
					'[Gestdown] Show not found'
				);
				return results;
			}

			// Search for subtitles by season/episode
			const subtitles = await this.searchSubtitles(
				show.id,
				criteria.season,
				criteria.episode,
				options?.timeout
			);

			// Filter by requested languages and transform
			for (const sub of subtitles) {
				// Map Gestdown language to ISO code
				const isoLang =
					GESTDOWN_LANGUAGE_REVERSE[sub.language.toLowerCase()] ||
					this.normalizeLanguage(sub.language);

				// Check if this language was requested
				if (!criteria.languages.includes(isoLang)) {
					continue;
				}

				const episodeLabel = criteria.episode
					? `S${criteria.season.toString().padStart(2, '0')}E${criteria.episode.toString().padStart(2, '0')}`
					: `Season ${criteria.season}`;

				results.push({
					providerId: this.id,
					providerName: this.name,
					providerSubtitleId: sub.downloadUri,

					language: isoLang,
					title: `${criteria.seriesTitle || criteria.title} ${episodeLabel}`,
					releaseName: sub.hd ? 'HD' : undefined,

					isForced: false,
					isHearingImpaired: sub.hearingImpaired || false,
					format: 'srt',

					isHashMatch: false,
					matchScore: this.calculateScore(sub),
					scoreBreakdown: {
						hashMatch: 0,
						titleMatch: 50,
						yearMatch: 0,
						releaseGroupMatch: 0,
						sourceMatch: sub.hd ? 10 : 0,
						codecMatch: 0,
						hiPenalty: 0,
						forcedBonus: 0
					},

					downloadCount: sub.downloadCount,
					uploader: sub.contributor
				});
			}

			// Sort by download count
			results.sort((a, b) => (b.downloadCount || 0) - (a.downloadCount || 0));

			// Limit results
			const maxResults = options?.maxResults || 25;
			const limited = results.slice(0, maxResults);

			this.logSearch(criteria, limited.length);
			return limited;
		} catch (error) {
			this.logError('search', error);
			throw error;
		}
	}

	/**
	 * Download a subtitle file
	 */
	async download(result: SubtitleSearchResult): Promise<Buffer> {
		try {
			const downloadUrl = result.providerSubtitleId.startsWith('http')
				? result.providerSubtitleId
				: `${API_BASE_URL}${result.providerSubtitleId}`;

			const response = await this.fetchWithTimeout(downloadUrl, {
				timeout: 30000,
				headers: {
					'User-Agent': 'Cinephage/1.0',
					Accept: '*/*'
				}
			});

			if (!response.ok) {
				this.handleErrorResponse(response);
			}

			return Buffer.from(await response.arrayBuffer());
		} catch (error) {
			this.logError('download', error);
			throw error;
		}
	}

	/**
	 * Test provider connectivity
	 */
	async test(): Promise<{ success: boolean; message: string; responseTime: number }> {
		const startTime = Date.now();
		try {
			// Simple show search to test API
			const response = await this.fetchWithTimeout(`${API_BASE_URL}/shows/search/test`, {
				timeout: 10000,
				headers: {
					Accept: 'application/json',
					'User-Agent': 'Cinephage/1.0'
				}
			});

			if (!response.ok && response.status !== 404) {
				throw new Error(`API returned ${response.status}`);
			}

			const responseTime = Date.now() - startTime;
			logger.info('[Gestdown] Provider test successful');
			return { success: true, message: 'Connection successful', responseTime };
		} catch (error) {
			const responseTime = Date.now() - startTime;
			this.logError('test', error);
			return {
				success: false,
				message: error instanceof Error ? error.message : 'Unknown error',
				responseTime
			};
		}
	}

	/**
	 * Find a show by title or TVDB ID
	 */
	private async findShow(
		criteria: SubtitleSearchCriteria,
		timeout?: number
	): Promise<GestdownShow | null> {
		const showTitle = criteria.seriesTitle || criteria.title;

		// Search for the show
		const searchUrl = `${API_BASE_URL}/shows/search/${encodeURIComponent(showTitle)}`;
		const response = await this.fetchWithTimeout(searchUrl, {
			timeout: timeout || 15000,
			headers: {
				Accept: 'application/json',
				'User-Agent': 'Cinephage/1.0'
			}
		});

		if (!response.ok) {
			if (response.status === 404) {
				return null;
			}
			this.handleErrorResponse(response);
		}

		const data: GestdownShowResponse = await response.json();
		const shows = data.shows || [];

		if (shows.length === 0) {
			return null;
		}

		// If we have a TVDB ID, try to match it
		// (Note: criteria doesn't have tvdbId, but some series records do)
		// For now, return the first match
		const bestMatch = shows[0];

		logger.debug(
			{
				searchTitle: showTitle,
				matchedShow: bestMatch.name,
				showId: bestMatch.id
			},
			'[Gestdown] Found show'
		);

		return bestMatch;
	}

	/**
	 * Search for subtitles by show ID and episode
	 */
	private async searchSubtitles(
		showId: string,
		season: number,
		episode?: number,
		timeout?: number
	): Promise<GestdownSubtitle[]> {
		// Build search URL
		let searchUrl: string;
		if (episode !== undefined) {
			searchUrl = `${API_BASE_URL}/subtitles/get/${showId}/${season}/${episode}`;
		} else {
			// Season pack search
			searchUrl = `${API_BASE_URL}/subtitles/get/${showId}/${season}`;
		}

		const response = await this.fetchWithTimeout(searchUrl, {
			timeout: timeout || 15000,
			headers: {
				Accept: 'application/json',
				'User-Agent': 'Cinephage/1.0'
			}
		});

		if (!response.ok) {
			if (response.status === 404) {
				return [];
			}
			this.handleErrorResponse(response);
		}

		const data: GestdownSubtitleResponse = await response.json();
		return data.subtitles || data.matchingSubtitles || [];
	}

	/**
	 * Handle HTTP error responses with typed exceptions
	 */
	private handleErrorResponse(response: Response): never {
		switch (response.status) {
			case 429: {
				const retryAfter = response.headers.get('retry-after');
				throw new TooManyRequests('gestdown', retryAfter ? parseInt(retryAfter) : undefined);
			}
			case 500:
			case 502:
			case 503:
			case 504:
				throw new ServiceUnavailable('gestdown');
			default:
				throw new Error(`API request failed: ${response.status}`);
		}
	}

	/**
	 * Calculate match score
	 */
	private calculateScore(sub: GestdownSubtitle): number {
		let score = 50; // Base score for show/episode match

		// Completed subtitle bonus
		if (sub.completed) {
			score += 20;
		}

		// HD bonus
		if (sub.hd) {
			score += 10;
		}

		// Popularity bonus (capped)
		if (sub.downloadCount) {
			score += Math.min(sub.downloadCount / 100, 15);
		}

		return Math.round(score);
	}
}
