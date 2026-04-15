/**
 * YIFY Subtitles Provider Implementation
 *
 * YIFY Subtitles is a movie subtitle database (movies only, no TV shows).
 * Uses HTML scraping since there's no public API.
 * Site: https://yifysubtitles.ch (or .org)
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
import * as cheerio from 'cheerio';
import {
	TooManyRequests,
	ServiceUnavailable,
	ParseResponseError
} from '../../errors/ProviderErrors';
import { YIFY_LANGUAGES, YIFY_LANGUAGE_REVERSE } from './types';

const BASE_URL = 'https://yifysubtitles.ch';

export class YIFYSubtitlesProvider extends BaseSubtitleProvider {
	get implementation(): string {
		return 'yifysubtitles';
	}

	get supportedLanguages(): LanguageCode[] {
		return Object.keys(YIFY_LANGUAGES);
	}

	get supportsHashSearch(): boolean {
		return false;
	}

	/**
	 * YIFY only supports movies - check criteria
	 */
	canSearch(criteria: SubtitleSearchCriteria): boolean {
		// YIFY is movies only - reject TV searches
		if (criteria.season !== undefined || criteria.episode !== undefined) {
			return false;
		}
		return super.canSearch(criteria);
	}

	/**
	 * Search for subtitles on YIFY
	 */
	async search(
		criteria: SubtitleSearchCriteria,
		options?: ProviderSearchOptions
	): Promise<SubtitleSearchResult[]> {
		// Only movies supported
		if (criteria.season !== undefined) {
			return [];
		}

		try {
			const results: SubtitleSearchResult[] = [];

			// Build search URL using IMDB ID (most reliable)
			let searchUrl: string;
			if (criteria.imdbId) {
				searchUrl = `${BASE_URL}/movie-imdb/${criteria.imdbId}`;
			} else {
				// Fall back to title search
				const searchTitle = criteria.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
				searchUrl = `${BASE_URL}/movie/${searchTitle}`;
			}

			const response = await this.fetchWithTimeout(searchUrl, {
				timeout: options?.timeout || 15000,
				headers: {
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
					Accept: 'text/html'
				}
			});

			if (!response.ok) {
				if (response.status === 404) {
					// Movie not found - not an error
					logger.debug(
						{
							imdbId: criteria.imdbId,
							title: criteria.title
						},
						'[YIFY] Movie not found'
					);
					return results;
				}
				this.handleErrorResponse(response);
			}

			const html = await response.text();
			const subtitleItems = this.parseSubtitleList(html, criteria.languages);

			// Transform to our format
			for (const item of subtitleItems) {
				results.push({
					providerId: this.id,
					providerName: this.name,
					providerSubtitleId: item.downloadUrl,

					language: item.language,
					title: criteria.title,
					releaseName: item.releaseName,

					isForced: this.isForced(item.releaseName || ''),
					isHearingImpaired: item.isHi,
					format: 'srt',

					isHashMatch: false,
					matchScore: this.calculateScore(item),
					scoreBreakdown: {
						hashMatch: 0,
						titleMatch: 50,
						yearMatch: 20,
						releaseGroupMatch: item.releaseName ? 15 : 0,
						sourceMatch: 0,
						codecMatch: 0,
						hiPenalty: 0,
						forcedBonus: 0
					},

					rating: item.rating,
					uploader: item.uploader
				});
			}

			// Sort by rating
			results.sort((a, b) => (b.rating || 0) - (a.rating || 0));

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
			// Get the subtitle page to find the download link
			const subtitlePageUrl = result.providerSubtitleId.startsWith('http')
				? result.providerSubtitleId
				: `${BASE_URL}${result.providerSubtitleId}`;

			const pageResponse = await this.fetchWithTimeout(subtitlePageUrl, {
				timeout: 30000,
				headers: {
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
					Accept: 'text/html'
				}
			});

			if (!pageResponse.ok) {
				this.handleErrorResponse(pageResponse);
			}

			const html = await pageResponse.text();
			const $ = cheerio.load(html);

			// Find download button link
			const downloadLink =
				$('a.download-subtitle').attr('href') ||
				$('.btn-icon.download-subtitle').attr('href') ||
				$('a[href*="/subtitle/"]').attr('href');

			if (!downloadLink) {
				throw new ParseResponseError('yifysubtitles', 'Download link not found on page');
			}

			// YIFY download URLs are relative to subdomain
			const downloadUrl = downloadLink.startsWith('http')
				? downloadLink
				: `https://yifysubtitles.ch${downloadLink}`;

			// Download the file
			const downloadResponse = await this.fetchWithTimeout(downloadUrl, {
				timeout: 30000,
				headers: {
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
					Referer: subtitlePageUrl
				}
			});

			if (!downloadResponse.ok) {
				this.handleErrorResponse(downloadResponse);
			}

			return Buffer.from(await downloadResponse.arrayBuffer());
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
			const response = await this.fetchWithTimeout(BASE_URL, {
				timeout: 10000,
				headers: {
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
				}
			});

			if (!response.ok) {
				throw new Error(`Site returned ${response.status}`);
			}

			const responseTime = Date.now() - startTime;
			logger.info('[YIFY] Provider test successful');
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
	 * Handle HTTP error responses with typed exceptions
	 */
	private handleErrorResponse(response: Response): never {
		switch (response.status) {
			case 429: {
				const retryAfter = response.headers.get('retry-after');
				throw new TooManyRequests('yifysubtitles', retryAfter ? parseInt(retryAfter) : undefined);
			}
			case 500:
			case 502:
			case 503:
			case 504:
				throw new ServiceUnavailable('yifysubtitles');
			default:
				throw new Error(`Request failed: ${response.status}`);
		}
	}

	/**
	 * Parse subtitle list from movie page HTML
	 */
	private parseSubtitleList(
		html: string,
		requestedLanguages: LanguageCode[]
	): Array<{
		language: string;
		releaseName?: string;
		downloadUrl: string;
		isHi: boolean;
		rating?: number;
		uploader?: string;
	}> {
		const $ = cheerio.load(html);
		const items: Array<{
			language: string;
			releaseName?: string;
			downloadUrl: string;
			isHi: boolean;
			rating?: number;
			uploader?: string;
		}> = [];

		// Parse subtitle table rows
		$('table.other-subs tbody tr').each((_, row) => {
			const $row = $(row);

			// Get language from .sub-lang span inside .flag-cell
			const langSpan = $row.find('.flag-cell .sub-lang');
			const langText = langSpan.text().toLowerCase().trim();

			// Try to match language
			let isoLang: string | undefined;
			for (const [iso, name] of Object.entries(YIFY_LANGUAGES)) {
				if (langText === name || langText.includes(name) || name.includes(langText)) {
					isoLang = iso;
					break;
				}
			}

			// Also check reverse mapping
			if (!isoLang) {
				isoLang = YIFY_LANGUAGE_REVERSE[langText];
			}

			if (!isoLang || !requestedLanguages.includes(isoLang)) {
				return; // Skip this subtitle
			}

			// Get subtitle link and release name
			const subtitleLink = $row.find('a[href*="/subtitles/"]').attr('href');
			if (!subtitleLink) return;

			// Release name is the text after "subtitle" span
			const linkText = $row.find('a[href*="/subtitles/"]').text().trim();
			const releaseName = linkText.replace(/^subtitle\s*/i, '').trim() || undefined;

			// Check for HI (hearing impaired icon)
			const isHi =
				$row.find('.hi-icon, [title*="hearing"]').length > 0 ||
				$row.find('.other-cell').text().toLowerCase().includes('hi');

			// Get rating from .rating-cell
			const ratingText = $row.find('.rating-cell .label').text().trim();
			const ratingMatch = ratingText.match(/-?(\d+)/);
			const rating = ratingMatch ? parseInt(ratingMatch[0], 10) : undefined;

			// Get uploader from .uploader-cell
			const uploader = $row.find('.uploader-cell a').text().trim() || undefined;

			items.push({
				language: isoLang,
				releaseName,
				downloadUrl: subtitleLink,
				isHi,
				rating,
				uploader
			});
		});

		return items;
	}

	/**
	 * Calculate match score
	 */
	private calculateScore(item: { rating?: number; releaseName?: string }): number {
		let score = 50; // Base score for movie match (via IMDB)

		// Year match implied by IMDB search
		score += 20;

		// Release name bonus
		if (item.releaseName) {
			score += 15;
		}

		// Rating bonus (YIFY uses 1-5 or 1-10 scale)
		if (item.rating) {
			// Normalize to max 10 points
			const normalizedRating = item.rating > 5 ? item.rating : item.rating * 2;
			score += Math.min(normalizedRating, 10);
		}

		return Math.round(score);
	}
}
