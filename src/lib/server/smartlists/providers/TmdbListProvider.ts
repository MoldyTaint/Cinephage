/**
 * TMDb List Provider
 *
 * Fetches movies from a specific TMDb list by ID
 * Uses the TMDb /list/{list_id} endpoint
 */
import { logger } from '$lib/logging';
import { tmdb } from '$lib/server/tmdb.js';
import type { ExternalListProvider, ExternalListItem, ExternalListResult } from './types.js';

export interface TmdbListConfig {
	/** TMDb list ID */
	listId: string;
	/** Maximum pages to fetch (default: 5) */
	maxPages?: number;
}

interface TmdbListItem {
	id: number;
	media_type: 'movie' | 'tv';
	title?: string; // For movies
	name?: string; // For TV shows
	original_title?: string;
	original_name?: string;
	overview: string;
	poster_path: string | null;
	backdrop_path: string | null;
	release_date?: string; // For movies
	first_air_date?: string; // For TV shows
	vote_average: number;
	vote_count: number;
	popularity: number;
	genre_ids: number[];
	original_language: string;
	adult: boolean;
}

interface TmdbListResponse {
	id: number;
	name: string;
	description: string;
	poster_path: string | null;
	item_count: number;
	items: TmdbListItem[];
}

export class TmdbListProvider implements ExternalListProvider {
	readonly type = 'tmdb-list';
	readonly name = 'TMDb List';

	validateConfig(config: unknown): boolean {
		if (typeof config !== 'object' || config === null) {
			return false;
		}
		const cfg = config as Partial<TmdbListConfig>;
		// List ID should be a numeric string
		return typeof cfg.listId === 'string' && /^\d+$/.test(cfg.listId);
	}

	async fetchItems(config: unknown, mediaType: 'movie' | 'tv' | ''): Promise<ExternalListResult> {
		const cfg = config as TmdbListConfig;
		const items: ExternalListItem[] = [];

		logger.info('[TmdbListProvider] Starting TMDb list fetch', {
			listId: cfg.listId,
			mediaType
		});

		try {
			// TMDb list API doesn't have pagination in the same way as discover
			// It returns all items in one request (up to a limit)
			// We'll fetch the list and filter by media type if specified (empty string = show all)
			const response = (await tmdb.fetch(`/list/${cfg.listId}`, {}, true)) as TmdbListResponse;

			if (!response.items || response.items.length === 0) {
				logger.info('[TmdbListProvider] List is empty', { listId: cfg.listId });
				return {
					items: [],
					totalCount: 0,
					failedCount: 0
				};
			}

			logger.info('[TmdbListProvider] Fetched list', {
				listId: cfg.listId,
				listName: response.name,
				itemCount: response.items.length
			});

			for (const item of response.items) {
				// Filter by media type if specified (skip filter if mediaType is empty string)
				if (mediaType && item.media_type && item.media_type !== mediaType) {
					continue;
				}

				const parsedItem = this.parseItem(item);
				if (parsedItem) {
					items.push(parsedItem);
				}
			}

			logger.info('[TmdbListProvider] Completed TMDb list fetch', {
				listId: cfg.listId,
				totalItems: items.length,
				filteredFrom: response.items.length
			});

			return {
				items,
				totalCount: items.length,
				failedCount: 0
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			logger.error('[TmdbListProvider] Failed to fetch TMDb list', {
				error: errorMessage,
				listId: cfg.listId
			});

			return {
				items,
				totalCount: items.length,
				failedCount: 0,
				error: errorMessage
			};
		}
	}

	private parseItem(item: TmdbListItem): ExternalListItem | null {
		// Extract year from release_date or first_air_date
		let year: number | undefined;
		const dateField = item.release_date || item.first_air_date;
		if (dateField) {
			const yearMatch = dateField.match(/^(\d{4})/);
			if (yearMatch) {
				year = parseInt(yearMatch[1], 10);
			}
		}

		// Use title for movies, name for TV shows
		const title = item.title || item.name;
		if (!title) {
			logger.debug('[TmdbListProvider] Item missing title', { id: item.id });
			return null;
		}

		return {
			tmdbId: item.id,
			title,
			year,
			overview: item.overview,
			posterPath: item.poster_path,
			voteAverage: item.vote_average,
			voteCount: item.vote_count,
			genreIds: item.genre_ids,
			originalLanguage: item.original_language
		};
	}
}
