/**
 * Smart List Service
 *
 * Core service for managing TMDB-based smart lists.
 * Handles CRUD operations, refresh logic, and library integration.
 */

import { db } from '$lib/server/db/index.js';
import {
	smartLists,
	smartListItems,
	smartListRefreshHistory,
	movies,
	series,
	seasons,
	episodes,
	type SmartListFilters,
	type SmartListRecord,
	type SmartListItemRecord
} from '$lib/server/db/schema.js';
import { eq, and, desc, asc, sql, lt } from 'drizzle-orm';
import { tmdb, type DiscoverParams, type DiscoverItem } from '$lib/server/tmdb.js';
import { logger } from '$lib/logging';
import {
	validateRootFolder,
	getEffectiveScoringProfileId,
	getLanguageProfileId,
	fetchMovieDetails,
	fetchMovieExternalIds,
	fetchSeriesDetails,
	fetchSeriesExternalIds,
	triggerMovieSearch,
	triggerSeriesSearch
} from '$lib/server/library/LibraryAddService.js';
import { namingService, type MediaNamingInfo } from '$lib/server/library/naming/NamingService.js';
import type {
	CreateSmartListInput,
	UpdateSmartListInput,
	RefreshResult,
	ItemQueryOptions,
	BulkAddResult
} from './types.js';
import { providerRegistry } from './providers/ProviderRegistry.js';
import { externalIdResolver } from './ExternalIdResolver.js';
import { presetService } from './presets/PresetService.js';
import type { ExternalListItem } from './providers/types.js';

export class SmartListService {
	private static instance: SmartListService | null = null;

	private constructor() {}

	static getInstance(): SmartListService {
		if (!SmartListService.instance) {
			SmartListService.instance = new SmartListService();
		}
		return SmartListService.instance;
	}

	// =========================================================================
	// CRUD Operations
	// =========================================================================

	async createSmartList(input: CreateSmartListInput): Promise<SmartListRecord> {
		const now = new Date().toISOString();
		const nextRefresh = new Date(
			Date.now() + (input.refreshIntervalHours ?? 24) * 60 * 60 * 1000
		).toISOString();

		// Determine list source type and URL
		const listSourceType = input.listSourceType ?? 'tmdb-discover';
		let externalSourceConfig:
			| { url?: string; headers?: Record<string, string>; listId?: string; username?: string }
			| undefined;

		// If using a preset, resolve the URL
		if (listSourceType === 'external-json' && input.presetId) {
			const presetUrl = presetService.getListUrl(input.presetId, input.externalSourceConfig?.url);
			if (presetUrl) {
				externalSourceConfig = {
					url: presetUrl,
					headers: input.externalSourceConfig?.headers as Record<string, string> | undefined,
					listId: input.externalSourceConfig?.listId,
					username: input.externalSourceConfig?.username
				};
			} else if (input.externalSourceConfig) {
				externalSourceConfig = {
					url: input.externalSourceConfig.url,
					headers: input.externalSourceConfig.headers as Record<string, string> | undefined,
					listId: input.externalSourceConfig.listId,
					username: input.externalSourceConfig.username
				};
			}
		} else if (input.externalSourceConfig) {
			externalSourceConfig = {
				url: input.externalSourceConfig.url,
				headers: input.externalSourceConfig.headers as Record<string, string> | undefined,
				listId: input.externalSourceConfig.listId,
				username: input.externalSourceConfig.username
			};
		}

		const [result] = await db
			.insert(smartLists)
			.values({
				name: input.name,
				description: input.description,
				mediaType: input.mediaType,
				filters: input.filters,
				sortBy: input.sortBy ?? 'popularity.desc',
				itemLimit: input.itemLimit ?? 100,
				excludeInLibrary: input.excludeInLibrary ?? true,
				showUpgradeableOnly: input.showUpgradeableOnly ?? false,
				excludedTmdbIds: input.excludedTmdbIds ?? [],
				scoringProfileId: input.scoringProfileId,
				autoAddBehavior: input.autoAddBehavior ?? 'disabled',
				rootFolderId: input.rootFolderId,
				autoAddMonitored: input.autoAddMonitored ?? true,
				minimumAvailability: input.minimumAvailability ?? 'released',
				wantsSubtitles: input.wantsSubtitles ?? true,
				languageProfileId: input.languageProfileId,
				refreshIntervalHours: input.refreshIntervalHours ?? 24,
				enabled: input.enabled ?? true,
				listSourceType,
				externalSourceConfig,
				presetId: input.presetId,
				presetProvider: input.presetProvider,
				presetSettings: input.presetSettings,
				nextRefreshTime: nextRefresh,
				createdAt: now,
				updatedAt: now
			})
			.returning();

		logger.info('[SmartListService] Created smart list', { id: result.id, name: result.name });

		// Perform initial refresh
		await this.refreshSmartList(result.id, 'manual');

		return result;
	}

	async updateSmartList(id: string, input: UpdateSmartListInput): Promise<SmartListRecord | null> {
		const existing = await this.getSmartList(id);
		if (!existing) return null;

		const updates: Partial<SmartListRecord> = {
			updatedAt: new Date().toISOString()
		};

		if (input.name !== undefined) updates.name = input.name;
		if (input.description !== undefined) updates.description = input.description;
		if (input.filters !== undefined) updates.filters = input.filters;
		if (input.sortBy !== undefined) updates.sortBy = input.sortBy;
		if (input.itemLimit !== undefined) updates.itemLimit = input.itemLimit;
		if (input.excludeInLibrary !== undefined) updates.excludeInLibrary = input.excludeInLibrary;
		if (input.showUpgradeableOnly !== undefined)
			updates.showUpgradeableOnly = input.showUpgradeableOnly;
		if (input.excludedTmdbIds !== undefined) updates.excludedTmdbIds = input.excludedTmdbIds;
		if (input.scoringProfileId !== undefined) updates.scoringProfileId = input.scoringProfileId;
		if (input.autoAddBehavior !== undefined) updates.autoAddBehavior = input.autoAddBehavior;
		if (input.rootFolderId !== undefined) updates.rootFolderId = input.rootFolderId;
		if (input.autoAddMonitored !== undefined) updates.autoAddMonitored = input.autoAddMonitored;
		if (input.minimumAvailability !== undefined)
			updates.minimumAvailability = input.minimumAvailability;
		if (input.wantsSubtitles !== undefined) updates.wantsSubtitles = input.wantsSubtitles;
		if (input.languageProfileId !== undefined) updates.languageProfileId = input.languageProfileId;
		if (input.refreshIntervalHours !== undefined) {
			updates.refreshIntervalHours = input.refreshIntervalHours;
			// Recalculate next refresh time
			updates.nextRefreshTime = new Date(
				Date.now() + input.refreshIntervalHours * 60 * 60 * 1000
			).toISOString();
		}
		if (input.enabled !== undefined) updates.enabled = input.enabled;
		if (input.listSourceType !== undefined) updates.listSourceType = input.listSourceType;
		if (input.presetId !== undefined) updates.presetId = input.presetId;
		if (input.presetProvider !== undefined) updates.presetProvider = input.presetProvider;
		if (input.presetSettings !== undefined) updates.presetSettings = input.presetSettings;

		// Handle external source config - resolve preset URL if needed
		if (input.externalSourceConfig !== undefined) {
			const listSourceType = input.listSourceType ?? existing.listSourceType;
			const presetId = input.presetId ?? existing.presetId;
			const inputConfig = input.externalSourceConfig;

			if (listSourceType === 'external-json' && presetId) {
				const presetUrl = presetService.getListUrl(presetId, inputConfig?.url);
				if (presetUrl) {
					updates.externalSourceConfig = {
						url: presetUrl,
						headers: inputConfig?.headers as Record<string, string> | undefined,
						listId: inputConfig?.listId,
						username: inputConfig?.username
					};
				} else {
					updates.externalSourceConfig = {
						url: inputConfig?.url,
						headers: inputConfig?.headers as Record<string, string> | undefined,
						listId: inputConfig?.listId,
						username: inputConfig?.username
					};
				}
			} else {
				updates.externalSourceConfig = {
					url: inputConfig?.url,
					headers: inputConfig?.headers as Record<string, string> | undefined,
					listId: inputConfig?.listId,
					username: inputConfig?.username
				};
			}
		} else if (input.presetId !== undefined && existing.listSourceType === 'external-json') {
			// If preset changed but config not provided, resolve URL from new preset
			const presetUrl = presetService.getListUrl(
				input.presetId,
				existing.externalSourceConfig?.url
			);
			if (presetUrl) {
				updates.externalSourceConfig = {
					url: presetUrl,
					headers: existing.externalSourceConfig?.headers,
					listId: existing.externalSourceConfig?.listId,
					username: existing.externalSourceConfig?.username
				};
			}
		}

		const [result] = await db
			.update(smartLists)
			.set(updates)
			.where(eq(smartLists.id, id))
			.returning();

		logger.info('[SmartListService] Updated smart list', { id, updates: Object.keys(input) });

		return result;
	}

	async deleteSmartList(id: string): Promise<boolean> {
		const result = await db.delete(smartLists).where(eq(smartLists.id, id));
		logger.info('[SmartListService] Deleted smart list', { id });
		return result.changes > 0;
	}

	async getSmartList(id: string): Promise<SmartListRecord | null> {
		const result = await db.query.smartLists.findFirst({
			where: eq(smartLists.id, id)
		});
		return result ?? null;
	}

	async getAllSmartLists(): Promise<SmartListRecord[]> {
		return db.query.smartLists.findMany({
			orderBy: [desc(smartLists.createdAt)]
		});
	}

	async getEnabledSmartLists(): Promise<SmartListRecord[]> {
		return db.query.smartLists.findMany({
			where: eq(smartLists.enabled, true),
			orderBy: [desc(smartLists.createdAt)]
		});
	}

	// =========================================================================
	// Refresh Operations
	// =========================================================================

	async refreshSmartList(id: string, refreshType: 'automatic' | 'manual'): Promise<RefreshResult> {
		const list = await this.getSmartList(id);

		if (!list) {
			throw new Error(`Smart list not found: ${id}`);
		}

		// Route to appropriate refresh method based on source type
		if (list.listSourceType === 'tmdb-discover') {
			return this.refreshTmdbDiscoverList(list, refreshType);
		} else if (list.listSourceType === 'external-json') {
			return this.syncExternalList(list, refreshType);
		}

		throw new Error(`Unsupported list source type: ${list.listSourceType}`);
	}

	/**
	 * Refresh a TMDB Discover-based list
	 */
	private async refreshTmdbDiscoverList(
		list: SmartListRecord,
		refreshType: 'automatic' | 'manual'
	): Promise<RefreshResult> {
		const startTime = Date.now();
		const id = list.id;

		// Create history entry
		const [historyEntry] = await db
			.insert(smartListRefreshHistory)
			.values({
				smartListId: id,
				refreshType,
				status: 'running',
				startedAt: new Date().toISOString()
			})
			.returning();

		try {
			// Build discover params from filters
			const params = this.buildDiscoverParams(list.filters, list.sortBy ?? 'popularity.desc');

			// Fetch from TMDB (paginated to get itemLimit items)
			const items = await this.fetchDiscoverItems(
				list.mediaType as 'movie' | 'tv',
				params,
				list.itemLimit
			);

			// Get existing items for this list
			const existingItems = await db.query.smartListItems.findMany({
				where: eq(smartListItems.smartListId, id)
			});
			const existingTmdbIds = new Set(existingItems.map((item) => item.tmdbId));

			// Process items
			let itemsNew = 0;
			let itemsRemoved = 0;
			const newTmdbIds = new Set(items.map((item) => item.id));

			// Add new items
			const itemsToInsert: Array<typeof smartListItems.$inferInsert> = [];
			const now = new Date().toISOString();

			for (let i = 0; i < items.length; i++) {
				const item = items[i];
				if (!existingTmdbIds.has(item.id)) {
					itemsNew++;
					const title = list.mediaType === 'movie' ? item.title : item.name;
					const releaseDate = list.mediaType === 'movie' ? item.release_date : item.first_air_date;
					const year = releaseDate ? parseInt(releaseDate.substring(0, 4), 10) : undefined;

					itemsToInsert.push({
						smartListId: id,
						mediaType: list.mediaType as 'movie' | 'tv',
						tmdbId: item.id,
						title: title ?? 'Unknown',
						originalTitle: list.mediaType === 'movie' ? item.original_title : item.original_name,
						overview: item.overview,
						posterPath: item.poster_path,
						backdropPath: item.backdrop_path,
						releaseDate,
						year,
						voteAverage: String(item.vote_average),
						voteCount: item.vote_count,
						popularity: String(item.popularity),
						genreIds: item.genre_ids,
						originalLanguage: item.original_language,
						position: i,
						firstSeenAt: now,
						lastSeenAt: now,
						updatedAt: now
					});
				}
			}

			// Insert new items in batches
			if (itemsToInsert.length > 0) {
				const batchSize = 50;
				for (let i = 0; i < itemsToInsert.length; i += batchSize) {
					const batch = itemsToInsert.slice(i, i + batchSize);
					await db.insert(smartListItems).values(batch);
				}
			}

			// Update positions for existing items
			for (let i = 0; i < items.length; i++) {
				const item = items[i];
				if (existingTmdbIds.has(item.id)) {
					await db
						.update(smartListItems)
						.set({
							position: i,
							lastSeenAt: now,
							updatedAt: now
						})
						.where(and(eq(smartListItems.smartListId, id), eq(smartListItems.tmdbId, item.id)));
				}
			}

			// Mark items not in new results as removed (but don't delete them)
			for (const existing of existingItems) {
				if (!newTmdbIds.has(existing.tmdbId)) {
					itemsRemoved++;
					// We keep the items but they won't appear in position-based queries
					await db
						.update(smartListItems)
						.set({
							position: 9999, // Push to end
							updatedAt: now
						})
						.where(eq(smartListItems.id, existing.id));
				}
			}

			// Update library status for all items
			await this.updateLibraryStatus(id, list.mediaType as 'movie' | 'tv');

			// Handle auto-add if enabled
			let itemsAutoAdded = 0;
			if (list.autoAddBehavior !== 'disabled' && list.rootFolderId) {
				const result = await this.autoAddItems(list);
				itemsAutoAdded = result.added;
			}

			// Update list stats
			const finalItemCount = await db
				.select({ count: sql<number>`count(*)` })
				.from(smartListItems)
				.where(and(eq(smartListItems.smartListId, id), eq(smartListItems.position, sql`< 9999`)));

			const inLibraryCount = await db
				.select({ count: sql<number>`count(*)` })
				.from(smartListItems)
				.where(and(eq(smartListItems.smartListId, id), eq(smartListItems.inLibrary, true)));

			const completedAt = new Date().toISOString();
			const durationMs = Date.now() - startTime;

			await db
				.update(smartLists)
				.set({
					lastRefreshTime: completedAt,
					lastRefreshStatus: 'success',
					lastRefreshError: null,
					nextRefreshTime: new Date(
						Date.now() + list.refreshIntervalHours * 60 * 60 * 1000
					).toISOString(),
					cachedItemCount: finalItemCount[0]?.count ?? 0,
					itemsInLibrary: inLibraryCount[0]?.count ?? 0,
					itemsAutoAdded: (list.itemsAutoAdded ?? 0) + itemsAutoAdded,
					updatedAt: completedAt
				})
				.where(eq(smartLists.id, id));

			// Update history
			await db
				.update(smartListRefreshHistory)
				.set({
					status: 'success',
					itemsFound: items.length,
					itemsNew,
					itemsRemoved,
					itemsAutoAdded,
					completedAt,
					durationMs
				})
				.where(eq(smartListRefreshHistory.id, historyEntry.id));

			logger.info('[SmartListService] Refresh completed', {
				id,
				itemsFound: items.length,
				itemsNew,
				itemsRemoved,
				itemsAutoAdded,
				durationMs
			});

			return {
				smartListId: id,
				status: 'success',
				itemsFound: items.length,
				itemsNew,
				itemsRemoved,
				itemsAutoAdded,
				itemsFailed: 0,
				durationMs
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			const durationMs = Date.now() - startTime;

			await db
				.update(smartLists)
				.set({
					lastRefreshStatus: 'failed',
					lastRefreshError: errorMessage,
					updatedAt: new Date().toISOString()
				})
				.where(eq(smartLists.id, id));

			await db
				.update(smartListRefreshHistory)
				.set({
					status: 'failed',
					errorMessage,
					completedAt: new Date().toISOString(),
					durationMs
				})
				.where(eq(smartListRefreshHistory.id, historyEntry.id));

			logger.error('[SmartListService] Refresh failed', error, { id });

			return {
				smartListId: id,
				status: 'failed',
				itemsFound: 0,
				itemsNew: 0,
				itemsRemoved: 0,
				itemsAutoAdded: 0,
				itemsFailed: 0,
				durationMs,
				errorMessage
			};
		}
	}

	async refreshAllDueLists(): Promise<RefreshResult[]> {
		const now = new Date().toISOString();
		const dueLists = await db.query.smartLists.findMany({
			where: and(eq(smartLists.enabled, true), sql`${smartLists.nextRefreshTime} <= ${now}`)
		});

		logger.info('[SmartListService] Refreshing due lists', { count: dueLists.length });

		const results: RefreshResult[] = [];
		for (const list of dueLists) {
			try {
				const result = await this.refreshSmartList(list.id, 'automatic');
				results.push(result);
			} catch (error) {
				logger.error('[SmartListService] Failed to refresh list', error, { listId: list.id });
			}
		}

		return results;
	}

	// =========================================================================
	// Item Operations
	// =========================================================================

	async getSmartListItems(
		id: string,
		options: ItemQueryOptions = {}
	): Promise<{
		items: SmartListItemRecord[];
		page: number;
		totalPages: number;
		totalItems: number;
	}> {
		const {
			page = 1,
			limit = 50,
			inLibrary,
			isExcluded = false,
			includeExcluded = false
		} = options;
		const offset = (page - 1) * limit;

		const conditions = [eq(smartListItems.smartListId, id)];

		if (!includeExcluded) {
			conditions.push(eq(smartListItems.isExcluded, isExcluded));
		}

		if (inLibrary === true) {
			conditions.push(eq(smartListItems.inLibrary, true));
		} else if (inLibrary === false) {
			conditions.push(eq(smartListItems.inLibrary, false));
		}

		const whereCondition = and(...conditions);

		const [items, countResult] = await Promise.all([
			db.query.smartListItems.findMany({
				where: whereCondition,
				orderBy: [asc(smartListItems.position)],
				limit,
				offset
			}),
			db
				.select({ count: sql<number>`count(*)` })
				.from(smartListItems)
				.where(whereCondition)
		]);

		const totalItems = countResult[0]?.count ?? 0;
		const totalPages = Math.ceil(totalItems / limit);

		return {
			items,
			page,
			totalPages,
			totalItems
		};
	}

	async excludeItem(smartListId: string, tmdbId: number): Promise<void> {
		await db
			.update(smartListItems)
			.set({
				isExcluded: true,
				excludedAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			})
			.where(and(eq(smartListItems.smartListId, smartListId), eq(smartListItems.tmdbId, tmdbId)));

		// Also add to list's excludedTmdbIds
		const list = await this.getSmartList(smartListId);
		if (list) {
			const excluded = list.excludedTmdbIds ?? [];
			if (!excluded.includes(tmdbId)) {
				await db
					.update(smartLists)
					.set({
						excludedTmdbIds: [...excluded, tmdbId],
						updatedAt: new Date().toISOString()
					})
					.where(eq(smartLists.id, smartListId));
			}
		}
	}

	async includeItem(smartListId: string, tmdbId: number): Promise<void> {
		await db
			.update(smartListItems)
			.set({
				isExcluded: false,
				excludedAt: null,
				updatedAt: new Date().toISOString()
			})
			.where(and(eq(smartListItems.smartListId, smartListId), eq(smartListItems.tmdbId, tmdbId)));

		// Remove from list's excludedTmdbIds
		const list = await this.getSmartList(smartListId);
		if (list) {
			const excluded = (list.excludedTmdbIds ?? []).filter((id) => id !== tmdbId);
			await db
				.update(smartLists)
				.set({
					excludedTmdbIds: excluded,
					updatedAt: new Date().toISOString()
				})
				.where(eq(smartLists.id, smartListId));
		}
	}

	async addItemToLibrary(
		smartListId: string,
		itemId: string,
		_searchOnAdd = false
	): Promise<{ success: boolean; error?: string }> {
		const item = await db.query.smartListItems.findFirst({
			where: eq(smartListItems.id, itemId)
		});

		if (!item) {
			return { success: false, error: 'Item not found' };
		}

		if (item.inLibrary) {
			return { success: false, error: 'Item already in library' };
		}

		const list = await this.getSmartList(smartListId);
		if (!list) {
			return { success: false, error: 'Smart list not found' };
		}

		try {
			if (item.mediaType === 'movie') {
				// Check if movie already exists
				const existing = await db.query.movies.findFirst({
					where: eq(movies.tmdbId, item.tmdbId)
				});

				if (existing) {
					await db
						.update(smartListItems)
						.set({
							inLibrary: true,
							movieId: existing.id,
							wasAutoAdded: false,
							updatedAt: new Date().toISOString()
						})
						.where(eq(smartListItems.id, itemId));
					return { success: true };
				}

				// Add to library using existing movie service would go here
				// For now just mark as needing manual add
				return { success: false, error: 'Movie add integration not yet implemented' };
			} else {
				// Similar for TV
				const existing = await db.query.series.findFirst({
					where: eq(series.tmdbId, item.tmdbId)
				});

				if (existing) {
					await db
						.update(smartListItems)
						.set({
							inLibrary: true,
							seriesId: existing.id,
							wasAutoAdded: false,
							updatedAt: new Date().toISOString()
						})
						.where(eq(smartListItems.id, itemId));
					return { success: true };
				}

				return { success: false, error: 'Series add integration not yet implemented' };
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			return { success: false, error: errorMessage };
		}
	}

	async bulkAddToLibrary(smartListId: string, itemIds: string[]): Promise<BulkAddResult> {
		const result: BulkAddResult = {
			added: 0,
			failed: 0,
			alreadyInLibrary: 0,
			errors: []
		};

		for (const itemId of itemIds) {
			const addResult = await this.addItemToLibrary(smartListId, itemId);
			if (addResult.success) {
				result.added++;
			} else if (addResult.error === 'Item already in library') {
				result.alreadyInLibrary++;
			} else {
				result.failed++;
				const item = await db.query.smartListItems.findFirst({
					where: eq(smartListItems.id, itemId)
				});
				if (item) {
					result.errors.push({
						tmdbId: item.tmdbId,
						title: item.title,
						error: addResult.error ?? 'Unknown error'
					});
				}
			}
		}

		return result;
	}

	// =========================================================================
	// Helper Methods
	// =========================================================================

	private buildDiscoverParams(filters: SmartListFilters, sortBy: string): DiscoverParams {
		const params: DiscoverParams = {
			sort_by: sortBy
		};

		// Genres
		if (filters.withGenres?.length) {
			params.with_genres =
				filters.genreMode === 'and' ? filters.withGenres.join(',') : filters.withGenres.join('|');
		}
		if (filters.withoutGenres?.length) {
			params.without_genres = filters.withoutGenres.join(',');
		}

		// Year/Date
		if (filters.yearMin) {
			params['primary_release_date.gte'] = `${filters.yearMin}-01-01`;
			params['first_air_date.gte'] = `${filters.yearMin}-01-01`;
		}
		if (filters.yearMax) {
			params['primary_release_date.lte'] = `${filters.yearMax}-12-31`;
			params['first_air_date.lte'] = `${filters.yearMax}-12-31`;
		}
		if (filters.releaseDateMin) {
			params['primary_release_date.gte'] = filters.releaseDateMin;
			params['first_air_date.gte'] = filters.releaseDateMin;
		}
		if (filters.releaseDateMax) {
			params['primary_release_date.lte'] = filters.releaseDateMax;
			params['first_air_date.lte'] = filters.releaseDateMax;
		}

		// Rating
		if (filters.voteAverageMin !== undefined) {
			params['vote_average.gte'] = filters.voteAverageMin;
		}
		if (filters.voteAverageMax !== undefined) {
			params['vote_average.lte'] = filters.voteAverageMax;
		}
		if (filters.voteCountMin !== undefined) {
			params['vote_count.gte'] = filters.voteCountMin;
		}

		// Popularity
		if (filters.popularityMin !== undefined) {
			params['popularity.gte'] = filters.popularityMin;
		}
		if (filters.popularityMax !== undefined) {
			params['popularity.lte'] = filters.popularityMax;
		}

		// People
		if (filters.withCast?.length) {
			params.with_cast = filters.withCast.join(',');
		}
		if (filters.withCrew?.length) {
			params.with_crew = filters.withCrew.join(',');
		}

		// Keywords
		if (filters.withKeywords?.length) {
			params.with_keywords = filters.withKeywords.join(',');
		}
		if (filters.withoutKeywords?.length) {
			params.without_keywords = filters.withoutKeywords.join(',');
		}

		// Watch Providers
		if (filters.withWatchProviders?.length) {
			params.with_watch_providers = filters.withWatchProviders.join('|');
			params.watch_region = filters.watchRegion ?? 'US';
		}

		// Certification
		if (filters.certification) {
			params.certification = filters.certification;
			params.certification_country = filters.certificationCountry ?? 'US';
		}

		// Runtime
		if (filters.runtimeMin !== undefined) {
			params['with_runtime.gte'] = filters.runtimeMin;
		}
		if (filters.runtimeMax !== undefined) {
			params['with_runtime.lte'] = filters.runtimeMax;
		}

		// Language
		if (filters.withOriginalLanguage) {
			params.with_original_language = filters.withOriginalLanguage;
		}

		// TV-specific
		if (filters.withStatus) {
			params.with_status = filters.withStatus;
		}

		// Movie-specific
		if (filters.withReleaseType?.length) {
			params.with_release_type = filters.withReleaseType.join('|');
		}

		return params;
	}

	private async fetchDiscoverItems(
		mediaType: 'movie' | 'tv',
		params: DiscoverParams,
		limit: number
	): Promise<DiscoverItem[]> {
		const items: DiscoverItem[] = [];
		let page = 1;
		const maxPages = Math.ceil(limit / 20); // TMDB returns 20 per page

		while (items.length < limit && page <= maxPages) {
			const response =
				mediaType === 'movie'
					? await tmdb.discoverMovies({ ...params, page }, true)
					: await tmdb.discoverTv({ ...params, page }, true);

			items.push(...response.results);

			if (page >= response.total_pages) break;
			page++;
		}

		return items.slice(0, limit);
	}

	private async updateLibraryStatus(smartListId: string, mediaType: 'movie' | 'tv'): Promise<void> {
		const items = await db.query.smartListItems.findMany({
			where: eq(smartListItems.smartListId, smartListId)
		});

		for (const item of items) {
			let inLibrary = false;
			let libraryId: string | null = null;

			if (mediaType === 'movie') {
				const movie = await db.query.movies.findFirst({
					where: eq(movies.tmdbId, item.tmdbId)
				});
				if (movie) {
					inLibrary = true;
					libraryId = movie.id;
				}
			} else {
				const show = await db.query.series.findFirst({
					where: eq(series.tmdbId, item.tmdbId)
				});
				if (show) {
					inLibrary = true;
					libraryId = show.id;
				}
			}

			if (item.inLibrary !== inLibrary) {
				await db
					.update(smartListItems)
					.set({
						inLibrary,
						movieId: mediaType === 'movie' ? libraryId : null,
						seriesId: mediaType === 'tv' ? libraryId : null,
						updatedAt: new Date().toISOString()
					})
					.where(eq(smartListItems.id, item.id));
			}
		}
	}

	private async autoAddItems(list: SmartListRecord): Promise<{ added: number }> {
		if (!list.rootFolderId) {
			logger.warn('[SmartListService] Auto-add skipped: no root folder configured', {
				listId: list.id
			});
			return { added: 0 };
		}

		const mediaType = list.mediaType as 'movie' | 'tv';

		// Validate root folder exists and matches media type
		try {
			await validateRootFolder(list.rootFolderId, mediaType);
		} catch (error) {
			logger.error('[SmartListService] Auto-add failed: invalid root folder', error, {
				listId: list.id,
				rootFolderId: list.rootFolderId
			});
			return { added: 0 };
		}

		// Get items not in library, ordered by position (highest ranked first)
		const itemsToAdd = await db.query.smartListItems.findMany({
			where: and(
				eq(smartListItems.smartListId, list.id),
				eq(smartListItems.inLibrary, false),
				lt(smartListItems.position, 9999) // exclude removed items
			),
			orderBy: asc(smartListItems.position),
			limit: 10 // Add max 10 items per refresh to avoid overwhelming the system
		});

		if (itemsToAdd.length === 0) {
			return { added: 0 };
		}

		logger.info('[SmartListService] Auto-adding items from smart list', {
			listId: list.id,
			listName: list.name,
			itemCount: itemsToAdd.length,
			mediaType
		});

		// Get effective scoring profile
		const effectiveProfileId = await getEffectiveScoringProfileId(
			list.scoringProfileId ?? undefined
		);
		const shouldSearch = list.autoAddBehavior === 'add_and_search';
		const monitored = list.autoAddMonitored ?? true;
		const wantsSubtitles = list.wantsSubtitles ?? true;

		let addedCount = 0;

		if (mediaType === 'movie') {
			addedCount = await this.autoAddMovies(
				itemsToAdd,
				list,
				effectiveProfileId,
				monitored,
				shouldSearch,
				wantsSubtitles
			);
		} else {
			addedCount = await this.autoAddSeries(
				itemsToAdd,
				list,
				effectiveProfileId,
				monitored,
				shouldSearch,
				wantsSubtitles
			);
		}

		return { added: addedCount };
	}

	private async autoAddMovies(
		items: SmartListItemRecord[],
		list: SmartListRecord,
		scoringProfileId: string,
		monitored: boolean,
		shouldSearch: boolean,
		wantsSubtitles: boolean
	): Promise<number> {
		let added = 0;

		for (const item of items) {
			try {
				// Check if movie already exists in library (double-check)
				const existing = await db.query.movies.findFirst({
					where: eq(movies.tmdbId, item.tmdbId)
				});

				if (existing) {
					// Update smart list item to reflect it's in library
					await db
						.update(smartListItems)
						.set({
							inLibrary: true,
							movieId: existing.id,
							updatedAt: new Date().toISOString()
						})
						.where(eq(smartListItems.id, item.id));
					continue;
				}

				// Fetch movie details from TMDB
				const movieDetails = await fetchMovieDetails(item.tmdbId);

				// Generate folder path
				const year = movieDetails.release_date
					? new Date(movieDetails.release_date).getFullYear()
					: undefined;
				const folderName = namingService.generateMovieFolderName({
					title: movieDetails.title,
					year,
					tmdbId: item.tmdbId
				} as MediaNamingInfo);

				// Extract external IDs
				const { imdbId } = await fetchMovieExternalIds(item.tmdbId);

				// Get the language profile if subtitles wanted
				const languageProfileId = await getLanguageProfileId(wantsSubtitles, item.tmdbId);

				// Insert movie into database
				const [newMovie] = await db
					.insert(movies)
					.values({
						tmdbId: item.tmdbId,
						imdbId,
						title: movieDetails.title,
						originalTitle: movieDetails.original_title,
						year,
						overview: movieDetails.overview,
						posterPath: movieDetails.poster_path,
						backdropPath: movieDetails.backdrop_path,
						runtime: movieDetails.runtime,
						genres: movieDetails.genres?.map((g) => g.name) ?? [],
						path: folderName,
						rootFolderId: list.rootFolderId!,
						scoringProfileId,
						monitored,
						minimumAvailability: list.minimumAvailability ?? 'released',
						hasFile: false,
						wantsSubtitles,
						languageProfileId
					})
					.returning();

				// Update smart list item
				await db
					.update(smartListItems)
					.set({
						inLibrary: true,
						movieId: newMovie.id,
						wasAutoAdded: true,
						autoAddedAt: new Date().toISOString(),
						updatedAt: new Date().toISOString()
					})
					.where(eq(smartListItems.id, item.id));

				added++;

				logger.info('[SmartListService] Auto-added movie', {
					listId: list.id,
					movieId: newMovie.id,
					tmdbId: item.tmdbId,
					title: movieDetails.title
				});

				// Trigger search if requested and movie is monitored
				if (shouldSearch && monitored) {
					await triggerMovieSearch({
						movieId: newMovie.id,
						tmdbId: item.tmdbId,
						imdbId,
						title: movieDetails.title,
						year,
						scoringProfileId
					});
				}
			} catch (error) {
				logger.error('[SmartListService] Failed to auto-add movie', error, {
					listId: list.id,
					tmdbId: item.tmdbId,
					title: item.title
				});
			}
		}

		return added;
	}

	private async autoAddSeries(
		items: SmartListItemRecord[],
		list: SmartListRecord,
		scoringProfileId: string,
		monitored: boolean,
		shouldSearch: boolean,
		wantsSubtitles: boolean
	): Promise<number> {
		let added = 0;

		for (const item of items) {
			try {
				// Check if series already exists in library (double-check)
				const existing = await db.query.series.findFirst({
					where: eq(series.tmdbId, item.tmdbId)
				});

				if (existing) {
					// Update smart list item to reflect it's in library
					await db
						.update(smartListItems)
						.set({
							inLibrary: true,
							seriesId: existing.id,
							updatedAt: new Date().toISOString()
						})
						.where(eq(smartListItems.id, item.id));
					continue;
				}

				// Fetch series details from TMDB
				const seriesDetails = await fetchSeriesDetails(item.tmdbId);

				// Generate folder path
				const year = seriesDetails.first_air_date
					? new Date(seriesDetails.first_air_date).getFullYear()
					: undefined;

				// Get external IDs
				const { tvdbId, imdbId } = await fetchSeriesExternalIds(item.tmdbId);

				const folderName = namingService.generateSeriesFolderName({
					title: seriesDetails.name,
					year,
					tvdbId
				} as MediaNamingInfo);

				// Get the language profile if subtitles wanted
				const languageProfileId = await getLanguageProfileId(wantsSubtitles, item.tmdbId);

				// Insert series into database
				const [newSeries] = await db
					.insert(series)
					.values({
						tmdbId: item.tmdbId,
						tvdbId,
						imdbId,
						title: seriesDetails.name,
						originalTitle: seriesDetails.original_name,
						year,
						overview: seriesDetails.overview,
						posterPath: seriesDetails.poster_path,
						backdropPath: seriesDetails.backdrop_path,
						status: seriesDetails.status,
						network:
							seriesDetails.networks && seriesDetails.networks.length > 0
								? seriesDetails.networks[0].name
								: null,
						genres: seriesDetails.genres?.map((g) => g.name) ?? [],
						path: folderName,
						rootFolderId: list.rootFolderId!,
						scoringProfileId,
						monitored,
						seasonFolder: true,
						seriesType: 'standard',
						monitorNewItems: 'all',
						monitorSpecials: false,
						episodeCount: 0,
						episodeFileCount: 0,
						wantsSubtitles,
						languageProfileId
					})
					.returning();

				// Create seasons and episodes
				await this.createSeasonsAndEpisodes(newSeries.id, item.tmdbId, monitored);

				// Update smart list item
				await db
					.update(smartListItems)
					.set({
						inLibrary: true,
						seriesId: newSeries.id,
						wasAutoAdded: true,
						autoAddedAt: new Date().toISOString(),
						updatedAt: new Date().toISOString()
					})
					.where(eq(smartListItems.id, item.id));

				added++;

				logger.info('[SmartListService] Auto-added series', {
					listId: list.id,
					seriesId: newSeries.id,
					tmdbId: item.tmdbId,
					title: seriesDetails.name
				});

				// Trigger search if requested and series is monitored
				if (shouldSearch && monitored) {
					await triggerSeriesSearch({
						seriesId: newSeries.id,
						tmdbId: item.tmdbId,
						title: seriesDetails.name
					});
				}
			} catch (error) {
				logger.error('[SmartListService] Failed to auto-add series', error, {
					listId: list.id,
					tmdbId: item.tmdbId,
					title: item.title
				});
			}
		}

		return added;
	}

	private async createSeasonsAndEpisodes(
		seriesId: string,
		tmdbId: number,
		monitored: boolean
	): Promise<void> {
		try {
			const seriesDetails = await tmdb.getTVShow(tmdbId);
			if (!seriesDetails.seasons) return;

			let totalEpisodes = 0;

			for (const seasonInfo of seriesDetails.seasons) {
				// Skip specials (season 0) by default
				const isSpecials = seasonInfo.season_number === 0;
				const seasonMonitored = monitored && !isSpecials;

				// Create season
				const [newSeason] = await db
					.insert(seasons)
					.values({
						seriesId,
						seasonNumber: seasonInfo.season_number,
						name: seasonInfo.name,
						overview: seasonInfo.overview ?? null,
						posterPath: seasonInfo.poster_path ?? null,
						airDate: seasonInfo.air_date ?? null,
						episodeCount: seasonInfo.episode_count ?? 0,
						monitored: seasonMonitored
					})
					.returning();

				// Fetch season details for episodes
				try {
					const seasonDetails = await tmdb.getSeason(tmdbId, seasonInfo.season_number);
					if (seasonDetails.episodes) {
						const episodesToInsert = seasonDetails.episodes.map((ep) => ({
							seriesId,
							seasonId: newSeason.id,
							tmdbId: ep.id,
							seasonNumber: seasonInfo.season_number,
							episodeNumber: ep.episode_number,
							title: ep.name,
							overview: ep.overview ?? null,
							airDate: ep.air_date ?? null,
							runtime: ep.runtime ?? null,
							monitored: seasonMonitored,
							hasFile: false
						}));

						if (episodesToInsert.length > 0) {
							await db.insert(episodes).values(episodesToInsert);
							totalEpisodes += episodesToInsert.length;
						}
					}
				} catch (_err) {
					logger.warn('[SmartListService] Failed to fetch season details', {
						tmdbId,
						seasonNumber: seasonInfo.season_number
					});
				}
			}

			// Update series episode count
			await db
				.update(series)
				.set({
					episodeCount: totalEpisodes
				})
				.where(eq(series.id, seriesId));
		} catch (error) {
			logger.error('[SmartListService] Failed to create seasons/episodes', error, {
				seriesId,
				tmdbId
			});
		}
	}

	// =========================================================================
	// External List Operations
	// =========================================================================

	/**
	 * Sync an external list (JSON URL, Trakt, etc.)
	 */
	private async syncExternalList(
		list: SmartListRecord,
		refreshType: 'automatic' | 'manual'
	): Promise<RefreshResult> {
		const startTime = Date.now();
		const id = list.id;

		// Build external source config from preset and user settings
		let externalSourceConfig = list.externalSourceConfig ?? {};
		if (list.presetId) {
			const preset = presetService.getPreset(list.presetId);
			if (preset) {
				// Start with preset config (for providers like tmdb-popular)
				externalSourceConfig = {
					...preset.config,
					...externalSourceConfig
				};

				// Merge user settings from presetSettings (for custom presets like tmdb-list:custom)
				if (list.presetSettings) {
					externalSourceConfig = {
						...externalSourceConfig,
						...list.presetSettings
					};
				}

				// Add URL if preset has one (for external-json provider)
				if (preset.url) {
					externalSourceConfig.url = preset.url;
				}

				logger.info('[SmartListService] Using preset config', {
					presetId: list.presetId,
					config: externalSourceConfig
				});
			}
		}

		logger.info('[SmartListService] Starting external list sync', {
			id,
			sourceType: list.listSourceType,
			url: externalSourceConfig?.url,
			presetId: list.presetId
		});

		// Create history entry
		const [historyEntry] = await db
			.insert(smartListRefreshHistory)
			.values({
				smartListId: id,
				refreshType,
				status: 'running',
				startedAt: new Date().toISOString()
			})
			.returning();

		try {
			// Get the appropriate provider
			const provider = providerRegistry.get(list.listSourceType);
			if (!provider) {
				throw new Error(`No provider registered for source type: ${list.listSourceType}`);
			}

			// Validate config
			if (!provider.validateConfig(externalSourceConfig)) {
				throw new Error('Invalid external source configuration');
			}

			// Fetch items from external source
			// For external lists, we pass empty string to show all content types (movies and TV)
			const externalResult = await provider.fetchItems(externalSourceConfig, '');

			if (externalResult.error) {
				throw new Error(`External fetch failed: ${externalResult.error}`);
			}

			logger.info('[SmartListService] Fetched external items', {
				id,
				totalCount: externalResult.totalCount,
				failedCount: externalResult.failedCount
			});

			// Resolve external items to TMDB items
			const resolvedItems = await this.resolveExternalItems(
				externalResult.items,
				list.mediaType as 'movie' | 'tv',
				id
			);

			logger.info('[SmartListService] Resolved external items to TMDB', {
				id,
				resolvedCount: resolvedItems.length,
				totalExternal: externalResult.items.length
			});

			// Get existing items for this list
			const existingItems = await db.query.smartListItems.findMany({
				where: eq(smartListItems.smartListId, id)
			});
			const existingTmdbIds = new Set(existingItems.map((item) => item.tmdbId));

			// Process items
			let itemsNew = 0;
			let itemsRemoved = 0;
			const itemsFailed = 0;
			const newTmdbIds = new Set(resolvedItems.map((item) => item.tmdbId));

			// Add new items
			const itemsToInsert: Array<typeof smartListItems.$inferInsert> = [];
			const now = new Date().toISOString();

			for (let i = 0; i < resolvedItems.length; i++) {
				const item = resolvedItems[i];
				if (!existingTmdbIds.has(item.tmdbId)) {
					itemsNew++;
					itemsToInsert.push({
						smartListId: id,
						mediaType: list.mediaType as 'movie' | 'tv',
						tmdbId: item.tmdbId,
						title: item.title,
						originalTitle: item.title,
						overview: item.overview,
						posterPath: item.posterPath,
						releaseDate: item.releaseDate,
						year: item.year,
						voteAverage: item.voteAverage ? String(item.voteAverage) : null,
						voteCount: item.voteCount,
						popularity: null,
						genreIds: item.genreIds,
						originalLanguage: item.originalLanguage,
						position: i,
						firstSeenAt: now,
						lastSeenAt: now,
						updatedAt: now
					});
				}
			}

			// Insert new items in batches
			if (itemsToInsert.length > 0) {
				const batchSize = 50;
				for (let i = 0; i < itemsToInsert.length; i += batchSize) {
					const batch = itemsToInsert.slice(i, i + batchSize);
					await db.insert(smartListItems).values(batch);
				}
			}

			// Update positions for existing items
			for (let i = 0; i < resolvedItems.length; i++) {
				const item = resolvedItems[i];
				if (existingTmdbIds.has(item.tmdbId)) {
					await db
						.update(smartListItems)
						.set({
							position: i,
							lastSeenAt: now,
							updatedAt: now
						})
						.where(and(eq(smartListItems.smartListId, id), eq(smartListItems.tmdbId, item.tmdbId)));
				}
			}

			// Mark items not in new results as removed
			for (const existing of existingItems) {
				if (!newTmdbIds.has(existing.tmdbId)) {
					itemsRemoved++;
					await db
						.update(smartListItems)
						.set({
							position: 9999,
							updatedAt: now
						})
						.where(eq(smartListItems.id, existing.id));
				}
			}

			// Update library status for all items
			await this.updateLibraryStatus(id, list.mediaType as 'movie' | 'tv');

			// Handle auto-add if enabled
			let itemsAutoAdded = 0;
			if (list.autoAddBehavior !== 'disabled' && list.rootFolderId) {
				const result = await this.autoAddItems(list);
				itemsAutoAdded = result.added;
			}

			// Update list stats
			const finalItemCount = await db
				.select({ count: sql<number>`count(*)` })
				.from(smartListItems)
				.where(and(eq(smartListItems.smartListId, id), eq(smartListItems.position, sql`< 9999`)));

			const inLibraryCount = await db
				.select({ count: sql<number>`count(*)` })
				.from(smartListItems)
				.where(and(eq(smartListItems.smartListId, id), eq(smartListItems.inLibrary, true)));

			const completedAt = new Date().toISOString();
			const durationMs = Date.now() - startTime;

			await db
				.update(smartLists)
				.set({
					lastRefreshTime: completedAt,
					lastRefreshStatus: 'success',
					lastRefreshError: null,
					lastExternalSyncTime: completedAt,
					externalSyncError: null,
					nextRefreshTime: new Date(
						Date.now() + list.refreshIntervalHours * 60 * 60 * 1000
					).toISOString(),
					cachedItemCount: finalItemCount[0]?.count ?? 0,
					itemsInLibrary: inLibraryCount[0]?.count ?? 0,
					itemsAutoAdded: (list.itemsAutoAdded ?? 0) + itemsAutoAdded,
					updatedAt: completedAt
				})
				.where(eq(smartLists.id, id));

			// Update history
			await db
				.update(smartListRefreshHistory)
				.set({
					status: 'success',
					itemsFound: resolvedItems.length,
					itemsNew,
					itemsRemoved,
					itemsAutoAdded,
					itemsFailed,
					completedAt,
					durationMs
				})
				.where(eq(smartListRefreshHistory.id, historyEntry.id));

			logger.info('[SmartListService] External sync completed', {
				id,
				itemsFound: resolvedItems.length,
				itemsNew,
				itemsRemoved,
				itemsAutoAdded,
				durationMs
			});

			return {
				smartListId: id,
				status: 'success',
				itemsFound: resolvedItems.length,
				itemsNew,
				itemsRemoved,
				itemsAutoAdded,
				itemsFailed,
				durationMs
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			const durationMs = Date.now() - startTime;

			await db
				.update(smartLists)
				.set({
					lastRefreshStatus: 'failed',
					lastRefreshError: errorMessage,
					externalSyncError: errorMessage,
					updatedAt: new Date().toISOString()
				})
				.where(eq(smartLists.id, id));

			await db
				.update(smartListRefreshHistory)
				.set({
					status: 'failed',
					errorMessage,
					completedAt: new Date().toISOString(),
					durationMs
				})
				.where(eq(smartListRefreshHistory.id, historyEntry.id));

			logger.error('[SmartListService] External sync failed', error, { id });

			return {
				smartListId: id,
				status: 'failed',
				itemsFound: 0,
				itemsNew: 0,
				itemsRemoved: 0,
				itemsAutoAdded: 0,
				itemsFailed: 0,
				durationMs,
				errorMessage
			};
		}
	}

	/**
	 * Resolve external list items to TMDB items
	 * Uses concurrent batch processing for much faster resolution
	 */
	private async resolveExternalItems(
		items: ExternalListItem[],
		mediaType: 'movie' | 'tv',
		listId: string
	): Promise<
		Array<{
			tmdbId: number;
			title: string;
			overview?: string;
			posterPath?: string | null;
			releaseDate?: string;
			year?: number;
			voteAverage?: number;
			voteCount?: number;
			genreIds?: number[];
			originalLanguage?: string;
		}>
	> {
		logger.info('[SmartListService] Starting external item resolution', {
			listId,
			itemCount: items.length,
			mediaType
		});

		const startTime = Date.now();

		// Use batch resolution with concurrency for much faster processing
		const results = await externalIdResolver.resolveItemsBatch(items, mediaType, 10);

		const resolved: ReturnType<typeof this.resolveExternalItems> extends Promise<infer T>
			? T
			: never = [];

		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			const result = results[i];

			if (result.success && result.tmdbId) {
				resolved.push({
					tmdbId: result.tmdbId,
					title: result.title || item.title,
					overview: item.overview,
					posterPath: item.posterPath ?? result.posterPath,
					year: result.year ?? item.year,
					voteAverage: item.voteAverage,
					voteCount: item.voteCount,
					genreIds: item.genreIds,
					originalLanguage: item.originalLanguage
				});
			} else {
				logger.warn('[SmartListService] Failed to resolve external item', {
					listId,
					index: i,
					title: item.title,
					error: result.error
				});
			}
		}

		const duration = Date.now() - startTime;
		logger.info('[SmartListService] External item resolution complete', {
			listId,
			totalItems: items.length,
			resolvedCount: resolved.length,
			failedCount: items.length - resolved.length,
			durationMs: duration
		});

		return resolved;
	}
}

// Singleton getter
export function getSmartListService(): SmartListService {
	return SmartListService.getInstance();
}
