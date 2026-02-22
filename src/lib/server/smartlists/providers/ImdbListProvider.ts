/**
 * IMDb List Provider
 *
 * Scrapes IMDb lists (e.g., https://www.imdb.com/list/ls060044601/)
 * Uses JSON-LD structured data embedded in the page.
 */
import { logger } from '$lib/logging';
import type { ExternalListProvider, ExternalListItem, ExternalListResult } from './types.js';

export interface ImdbListConfig {
	/** IMDb list ID (e.g., 'ls060044601') */
	listId: string;
	/** Optional media type filter */
	mediaType?: 'movie' | 'tv' | '';
	/** Maximum pages to fetch (default: 5) */
	maxPages?: number;
}

interface ImdbJsonLdItem {
	'@type': 'ListItem';
	position?: number;
	item: {
		'@type': 'Movie' | 'TVSeries' | 'TVEpisode';
		url: string;
		name: string;
		description?: string;
		image?: string;
		aggregateRating?: {
			'@type': 'AggregateRating';
			ratingValue: number;
			ratingCount: number;
		};
		genre?: string | string[];
		duration?: string; // ISO 8601 format (PT1H31M)
		contentRating?: string;
	};
}

interface ImdbJsonLd {
	'@context'?: string;
	'@type': 'ItemList';
	name?: string;
	description?: string;
	itemListElement: ImdbJsonLdItem[];
}

export class ImdbListProvider implements ExternalListProvider {
	readonly type = 'imdb-list';
	readonly name = 'IMDb List';

	// Rate limiting: 1 request per second to be respectful while maintaining reasonable speed
	private lastRequestTime = 0;
	private readonly minRequestInterval = 1000; // 1 second

	private normalizeListId(listId: string): string | null {
		const trimmed = listId.trim();
		if (!trimmed) return null;

		const directMatch = trimmed.match(/^(ls\d+)$/i);
		if (directMatch) {
			return directMatch[1].toLowerCase();
		}

		const urlMatch = trimmed.match(/\/list\/(ls\d+)/i);
		if (urlMatch) {
			return urlMatch[1].toLowerCase();
		}

		return null;
	}

	validateConfig(config: unknown): boolean {
		if (typeof config !== 'object' || config === null) {
			return false;
		}
		const cfg = config as Partial<ImdbListConfig>;
		return typeof cfg.listId === 'string' && this.normalizeListId(cfg.listId) !== null;
	}

	async fetchItems(config: unknown, mediaType: 'movie' | 'tv' | ''): Promise<ExternalListResult> {
		const cfg = config as ImdbListConfig;
		const items: ExternalListItem[] = [];
		const normalizedListId = this.normalizeListId(cfg.listId);
		if (!normalizedListId) {
			return {
				items,
				totalCount: 0,
				failedCount: 0,
				error: 'Invalid IMDb list ID format'
			};
		}
		const seenIds = new Set<string>(); // Track seen IMDb IDs to avoid duplicates
		let totalListCount: number | undefined; // Total items in list from __NEXT_DATA__
		let page = 1;
		const maxPages = cfg.maxPages ?? 100; // Safety limit

		// Use config mediaType if provided, otherwise use the parameter
		// If neither is set (empty string), show all content types
		const filterMediaType = cfg.mediaType ?? mediaType;

		logger.info('[ImdbListProvider] Starting IMDb list scrape', {
			listId: normalizedListId,
			mediaType: filterMediaType,
			maxPages
		});

		try {
			while (page <= maxPages) {
				// Check if we've collected all items
				if (totalListCount !== undefined && items.length >= totalListCount) {
					logger.info('[ImdbListProvider] All items collected', {
						collected: items.length,
						total: totalListCount
					});
					break;
				}

				const result = await this.fetchPage(normalizedListId, page, filterMediaType);

				if (result.items.length === 0) {
					logger.debug('[ImdbListProvider] Empty page', { page, listId: normalizedListId });
					break; // Stop on empty page
				}

				// On first page, get the total count from __NEXT_DATA__
				if (page === 1 && result.totalCount) {
					totalListCount = result.totalCount;
					logger.info('[ImdbListProvider] Found total list count', {
						total: totalListCount,
						listId: normalizedListId
					});
				}

				// Add unique items only
				let newItems = 0;
				let duplicates = 0;
				let skippedNoId = 0;
				for (const item of result.items) {
					if (!item.imdbId) {
						skippedNoId++;
						logger.debug('[ImdbListProvider] Skipping item without IMDb ID', {
							title: item.title,
							listId: normalizedListId
						});
						continue;
					}

					if (!seenIds.has(item.imdbId)) {
						seenIds.add(item.imdbId);
						items.push(item);
						newItems++;
					} else {
						duplicates++;
					}
				}

				logger.debug('[ImdbListProvider] Fetched page', {
					page,
					newItems,
					duplicates,
					skippedNoId,
					totalCollected: items.length,
					listId: normalizedListId
				});

				// If page had only duplicates, we've reached the end
				if (newItems === 0 && duplicates > 0) {
					logger.info('[ImdbListProvider] Page contained only duplicates, stopping', {
						page,
						duplicates,
						listId: normalizedListId
					});
					break;
				}

				page++;
			}

			logger.info('[ImdbListProvider] Completed IMDb list scrape', {
				listId: normalizedListId,
				totalItems: items.length,
				expectedTotal: totalListCount,
				pagesScanned: page
			});

			return {
				items,
				totalCount: items.length,
				failedCount: 0
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			logger.error('[ImdbListProvider] Failed to scrape IMDb list', {
				error: errorMessage,
				listId: normalizedListId
			});

			return {
				items,
				totalCount: items.length,
				failedCount: 0,
				error: errorMessage
			};
		}
	}

	private async fetchPage(
		listId: string,
		page: number,
		mediaType: 'movie' | 'tv' | ''
	): Promise<{ items: ExternalListItem[]; totalCount?: number }> {
		const url = `https://www.imdb.com/list/${listId}/?page=${page}`;

		// Rate limiting
		await this.applyRateLimit();

		logger.info('[ImdbListProvider] Fetching page', { url, page, listId });

		const startTime = Date.now();
		const response = await fetch(url, {
			headers: {
				Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
				'Accept-Language': 'en-US,en;q=0.5',
				DNT: '1',
				Connection: 'keep-alive',
				'Upgrade-Insecure-Requests': '1',
				'Sec-Fetch-Dest': 'document',
				'Sec-Fetch-Mode': 'navigate',
				'Sec-Fetch-Site': 'none',
				'Sec-Fetch-User': '?1',
				'Cache-Control': 'max-age=0',
				// Use a browser-like User-Agent
				'User-Agent':
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
			},
			signal: AbortSignal.timeout(45000) // 45 second timeout
		});

		const fetchTime = Date.now() - startTime;
		logger.info('[ImdbListProvider] Page fetched', {
			url,
			status: response.status,
			fetchTimeMs: fetchTime
		});

		if (!response.ok) {
			if (response.status === 404) {
				logger.debug('[ImdbListProvider] Page not found (404)', { page, listId });
				return { items: [] }; // End of list
			}
			if (response.status === 403 || response.status === 429) {
				logger.error('[ImdbListProvider] Rate limited or blocked', {
					status: response.status,
					listId
				});
				throw new Error(
					`IMDb rate limited or blocked (HTTP ${response.status}). Please try again later.`
				);
			}
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const html = await response.text();
		const items = this.parseHtml(html, mediaType);
		const totalCount = this.extractTotalCount(html);

		return { items, totalCount };
	}

	/**
	 * Extract total item count from __NEXT_DATA__ script
	 */
	private extractTotalCount(html: string): number | undefined {
		try {
			// Look for __NEXT_DATA__ script
			const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
			if (!nextDataMatch) {
				return undefined;
			}

			const nextData = JSON.parse(nextDataMatch[1]);

			// Navigate to the list data - path may vary
			const listData =
				nextData?.props?.pageProps?.titleListItemSearch ||
				nextData?.props?.pageProps?.listData ||
				nextData?.props?.pageProps?.data?.titleListItemSearch;

			if (listData?.total) {
				logger.debug('[ImdbListProvider] Extracted total count', { total: listData.total });
				return listData.total;
			}
		} catch (error) {
			logger.debug('[ImdbListProvider] Failed to extract total count', {
				error: error instanceof Error ? error.message : String(error)
			});
		}

		return undefined;
	}

	private async applyRateLimit(): Promise<void> {
		const now = Date.now();
		const timeSinceLastRequest = now - this.lastRequestTime;

		if (timeSinceLastRequest < this.minRequestInterval) {
			const delay = this.minRequestInterval - timeSinceLastRequest;
			logger.debug('[ImdbListProvider] Rate limiting - waiting', { delayMs: delay });
			await new Promise((resolve) => setTimeout(resolve, delay));
		}

		this.lastRequestTime = Date.now();
	}

	private parseHtml(html: string, mediaType: 'movie' | 'tv' | ''): ExternalListItem[] {
		const items: ExternalListItem[] = [];

		// Find all JSON-LD script tags more efficiently
		// Look for script tags and check their content for ItemList
		const scriptRegex = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi;
		let scriptMatch;

		while ((scriptMatch = scriptRegex.exec(html)) !== null) {
			try {
				const jsonContent = scriptMatch[1];

				// Quick check if this contains ItemList before parsing
				if (!jsonContent.includes('"@type"') || !jsonContent.includes('"ItemList"')) {
					continue;
				}

				const data = JSON.parse(jsonContent) as ImdbJsonLd;

				if (
					data['@type'] !== 'ItemList' ||
					!data.itemListElement ||
					!Array.isArray(data.itemListElement)
				) {
					continue;
				}

				logger.debug('[ImdbListProvider] Found ItemList with', {
					itemCount: data.itemListElement.length
				});

				for (const listItem of data.itemListElement) {
					try {
						const item = this.parseListItem(listItem, mediaType);
						if (item) {
							items.push(item);
						}
					} catch (error) {
						logger.warn('[ImdbListProvider] Failed to parse list item', {
							error: error instanceof Error ? error.message : String(error),
							item: listItem.item?.name
						});
					}
				}
			} catch (_error) {
				// Silently skip invalid JSON
				logger.debug('[ImdbListProvider] Failed to parse JSON-LD script');
			}
		}

		logger.debug('[ImdbListProvider] Parsed items from page', { count: items.length });
		return items;
	}

	private parseListItem(
		listItem: ImdbJsonLdItem,
		mediaType: 'movie' | 'tv' | ''
	): ExternalListItem | null {
		const item = listItem.item;

		// Extract IMDb ID from URL
		const imdbIdMatch = item.url.match(/\/title\/(tt\d+)\//);
		if (!imdbIdMatch) {
			logger.debug('[ImdbListProvider] Could not extract IMDb ID from URL', { url: item.url });
			return null;
		}
		const imdbId = imdbIdMatch[1];

		// Determine media type from @type
		const itemMediaType = this.getMediaType(item['@type']);

		// Filter by requested media type if specified
		if (mediaType && itemMediaType && itemMediaType !== mediaType) {
			logger.debug('[ImdbListProvider] Filtering item by media type', {
				title: item.name,
				imdbId,
				itemType: itemMediaType,
				requestedType: mediaType,
				itemTypeRaw: item['@type']
			});
			return null; // Skip items that don't match requested type
		}

		// Parse year from description if available (often contains year)
		let year: number | undefined;
		if (item.description) {
			const yearMatch = item.description.match(/\b(19\d{2}|20\d{2})\b/);
			if (yearMatch) {
				year = parseInt(yearMatch[1], 10);
			}
		}

		return {
			imdbId,
			title: item.name,
			year,
			overview: item.description,
			posterPath: item.image || null,
			voteAverage: item.aggregateRating?.ratingValue,
			voteCount: item.aggregateRating?.ratingCount,
			originalLanguage: undefined // Not available in IMDb JSON-LD
		};
	}

	private getMediaType(type: string): 'movie' | 'tv' | null {
		switch (type) {
			case 'Movie':
				return 'movie';
			case 'TVSeries':
			case 'TVEpisode':
				return 'tv';
			default:
				return null;
		}
	}

	/**
	 * Parse ISO 8601 duration to minutes
	 * e.g., "PT1H31M" → 91
	 * e.g., "PT45M" → 45
	 * e.g., "PT2H" → 120
	 */
	private parseDuration(duration: string): number | undefined {
		const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
		if (!match) return undefined;

		const hours = parseInt(match[1] || '0', 10);
		const minutes = parseInt(match[2] || '0', 10);

		return hours * 60 + minutes;
	}
}
