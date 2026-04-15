/**
 * Subscene.com Provider Implementation
 *
 * Subscene is a large subtitle database with community contributions.
 * Uses HTML scraping since there's no public API.
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
import { TooManyRequests, ServiceUnavailable } from '../../errors/ProviderErrors';

const BASE_URL = 'https://subscene.com';

/** Subscene language mapping */
const SUBSCENE_LANGUAGES: Record<string, string> = {
	en: 'english',
	es: 'spanish',
	fr: 'french',
	de: 'german',
	it: 'italian',
	pt: 'portuguese',
	nl: 'dutch',
	pl: 'polish',
	ru: 'russian',
	ar: 'arabic',
	he: 'hebrew',
	tr: 'turkish',
	el: 'greek',
	hu: 'hungarian',
	ro: 'romanian',
	cs: 'czech',
	sv: 'swedish',
	da: 'danish',
	fi: 'finnish',
	no: 'norwegian',
	ja: 'japanese',
	ko: 'korean',
	zh: 'chinese',
	vi: 'vietnamese',
	th: 'thai',
	id: 'indonesian',
	ms: 'malay',
	fa: 'farsi_persian',
	hi: 'hindi',
	bn: 'bengali',
	uk: 'ukrainian',
	bg: 'bulgarian',
	hr: 'croatian',
	sr: 'serbian',
	sk: 'slovak',
	sl: 'slovenian'
};

/** Reverse mapping for parsing */
const LANGUAGE_REVERSE: Record<string, string> = Object.entries(SUBSCENE_LANGUAGES).reduce(
	(acc, [iso, name]) => {
		acc[name.toLowerCase()] = iso;
		return acc;
	},
	{} as Record<string, string>
);

export class SubsceneProvider extends BaseSubtitleProvider {
	get implementation(): string {
		return 'subscene';
	}

	get supportedLanguages(): LanguageCode[] {
		return Object.keys(SUBSCENE_LANGUAGES);
	}

	get supportsHashSearch(): boolean {
		return false;
	}

	/**
	 * Search for subtitles on Subscene
	 */
	async search(
		criteria: SubtitleSearchCriteria,
		options?: ProviderSearchOptions
	): Promise<SubtitleSearchResult[]> {
		try {
			const results: SubtitleSearchResult[] = [];

			// Build search query
			const searchQuery = this.buildSearchQuery(criteria);
			if (!searchQuery) {
				return results;
			}

			// Search for the title
			const searchUrl = `${BASE_URL}/subtitles/searchbytitle?query=${encodeURIComponent(searchQuery)}`;
			const searchResponse = await this.fetchWithTimeout(searchUrl, {
				timeout: options?.timeout || 15000,
				headers: {
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
					Accept: 'text/html'
				}
			});

			if (!searchResponse.ok) {
				logger.warn({ status: searchResponse.status }, '[Subscene] Search request failed');
				if (searchResponse.status === 429) {
					const retryAfter = searchResponse.headers.get('retry-after');
					throw new TooManyRequests('subscene', retryAfter ? parseInt(retryAfter) : undefined);
				}
				if (searchResponse.status >= 500) {
					throw new ServiceUnavailable('subscene');
				}
				return results;
			}

			const searchHtml = await searchResponse.text();
			const titleUrls = this.parseTitleResults(searchHtml, criteria);

			if (titleUrls.length === 0) {
				return results;
			}

			// Get subtitles from the first matching title page
			const titleUrl = titleUrls[0];
			const subtitlePageResponse = await this.fetchWithTimeout(`${BASE_URL}${titleUrl}`, {
				timeout: options?.timeout || 15000,
				headers: {
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
					Accept: 'text/html'
				}
			});

			if (!subtitlePageResponse.ok) {
				return results;
			}

			const subtitleHtml = await subtitlePageResponse.text();
			const subtitleItems = this.parseSubtitleList(subtitleHtml, criteria.languages);

			// Transform to our format
			for (const item of subtitleItems) {
				results.push({
					providerId: this.id,
					providerName: this.name,
					providerSubtitleId: item.downloadUrl,

					language: item.language,
					title: item.title,
					releaseName: item.releaseName,

					isForced: this.isForced(item.releaseName || ''),
					isHearingImpaired: item.isHi,
					format: 'srt',

					isHashMatch: false,
					matchScore: this.calculateScore(item),

					downloadCount: item.downloads,
					rating: item.rating
				});
			}

			// Sort by downloads and limit
			results.sort((a, b) => (b.downloadCount || 0) - (a.downloadCount || 0));
			const maxResults = options?.maxResults || 25;

			this.logSearch(criteria, Math.min(results.length, maxResults));
			return results.slice(0, maxResults);
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
			const subtitlePageUrl = `${BASE_URL}${result.providerSubtitleId}`;
			const pageResponse = await this.fetchWithTimeout(subtitlePageUrl, {
				timeout: 30000,
				headers: {
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
					Accept: 'text/html'
				}
			});

			if (!pageResponse.ok) {
				if (pageResponse.status === 429) {
					const retryAfter = pageResponse.headers.get('retry-after');
					throw new TooManyRequests('subscene', retryAfter ? parseInt(retryAfter) : undefined);
				}
				if (pageResponse.status >= 500) {
					throw new ServiceUnavailable('subscene');
				}
				throw new Error(`Failed to load subtitle page: ${pageResponse.status}`);
			}

			const html = await pageResponse.text();
			const $ = cheerio.load(html);

			// Find download button link
			const downloadLink = $('#downloadButton').attr('href');
			if (!downloadLink) {
				throw new Error('Download link not found on page');
			}

			// Download the file
			const downloadUrl = `${BASE_URL}${downloadLink}`;
			const downloadResponse = await this.fetchWithTimeout(downloadUrl, {
				timeout: 30000,
				headers: {
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
					Referer: subtitlePageUrl
				}
			});

			if (!downloadResponse.ok) {
				if (downloadResponse.status === 429) {
					const retryAfter = downloadResponse.headers.get('retry-after');
					throw new TooManyRequests('subscene', retryAfter ? parseInt(retryAfter) : undefined);
				}
				if (downloadResponse.status >= 500) {
					throw new ServiceUnavailable('subscene');
				}
				throw new Error(`Download failed: ${downloadResponse.status}`);
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
			logger.info('[Subscene] Provider test successful');
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
	 * Build search query from criteria
	 */
	private buildSearchQuery(criteria: SubtitleSearchCriteria): string {
		let query = criteria.seriesTitle || criteria.title;

		// Add year for movies
		if (criteria.year && !criteria.season) {
			query += ` ${criteria.year}`;
		}

		return query;
	}

	/**
	 * Parse title search results
	 */
	private parseTitleResults(html: string, criteria: SubtitleSearchCriteria): string[] {
		const $ = cheerio.load(html);
		const urls: string[] = [];

		// Look for exact or close matches
		$('.search-result ul li div.title a').each((_, el) => {
			const href = $(el).attr('href');
			const text = $(el).text().toLowerCase();

			if (href) {
				// Basic matching - contains title
				const searchTitle = (criteria.seriesTitle || criteria.title).toLowerCase();
				if (text.includes(searchTitle.split(' ')[0])) {
					urls.push(href);
				}
			}
		});

		return urls;
	}

	/**
	 * Parse subtitle list from title page
	 */
	private parseSubtitleList(
		html: string,
		requestedLanguages: LanguageCode[]
	): Array<{
		language: string;
		title: string;
		releaseName?: string;
		downloadUrl: string;
		isHi: boolean;
		downloads?: number;
		rating?: number;
	}> {
		const $ = cheerio.load(html);
		const items: Array<{
			language: string;
			title: string;
			releaseName?: string;
			downloadUrl: string;
			isHi: boolean;
			downloads?: number;
			rating?: number;
		}> = [];

		$('table tbody tr').each((_, row) => {
			const $row = $(row);

			// Get language
			const langSpan = $row.find('td.a1 span[class]').first();
			const langClass = langSpan.attr('class') || '';
			const langName = langClass.replace(/[-_]/g, ' ').toLowerCase().trim();

			// Check if this language is requested
			const isoLang = LANGUAGE_REVERSE[langName];
			if (!isoLang || !requestedLanguages.includes(isoLang)) {
				return; // Skip this subtitle
			}

			// Get title and release name
			const titleLink = $row.find('td.a1 a').first();
			const href = titleLink.attr('href');
			const spans = titleLink.find('span');
			const releaseName = spans.last().text().trim();

			if (!href) return;

			// Check for HI
			const isHi = $row.find('td.a41').length > 0;

			// Get download count if available
			const commentText = $row.find('td.a6').text();
			const downloadsMatch = commentText.match(/(\d+)/);
			const downloads = downloadsMatch ? parseInt(downloadsMatch[1], 10) : undefined;

			items.push({
				language: isoLang,
				title: releaseName || titleLink.text().trim(),
				releaseName,
				downloadUrl: href,
				isHi,
				downloads
			});
		});

		return items;
	}

	/**
	 * Calculate match score
	 */
	private calculateScore(item: {
		downloads?: number;
		rating?: number;
		releaseName?: string;
	}): number {
		let score = 50; // Base score

		// Release name bonus
		if (item.releaseName) {
			score += 15;
		}

		// Popularity bonus
		if (item.downloads) {
			score += Math.min(item.downloads / 100, 15);
		}

		// Rating bonus
		if (item.rating) {
			score += Math.min(item.rating * 2, 10);
		}

		return Math.round(score);
	}
}
