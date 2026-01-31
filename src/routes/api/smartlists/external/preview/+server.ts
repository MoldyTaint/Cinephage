/**
 * External List Preview API
 * POST /api/smartlists/external/preview - Preview external list items
 * POST /api/smartlists/external/test - Test external list connection
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { providerRegistry } from '$lib/server/smartlists/providers/ProviderRegistry.js';
import { externalIdResolver } from '$lib/server/smartlists/ExternalIdResolver.js';
import { presetService } from '$lib/server/smartlists/presets/PresetService.js';
import { logger } from '$lib/logging';
import { z } from 'zod';
import { movies, series } from '$lib/server/db/schema.js';
import { db } from '$lib/server/db/index.js';

const previewSchema = z.object({
	url: z.string().url().optional(),
	headers: z.record(z.string(), z.unknown()).optional(),
	mediaType: z.enum(['movie', 'tv']).optional(),
	presetId: z.string().optional(),
	providerType: z.string().optional(),
	config: z.record(z.string(), z.unknown()).optional(),
	page: z.number().int().min(1).default(1),
	itemLimit: z.number().int().min(1).max(1000).default(100)
});

export const POST: RequestHandler = async ({ request, url }) => {
	const isTest = url.pathname.endsWith('/test');

	try {
		const body = await request.json();
		const data = previewSchema.parse(body);

		let providerType: string;
		let providerConfig: Record<string, unknown>;

		// Determine provider type and config
		if (data.presetId) {
			// Using a preset - extract provider from preset ID
			const preset = presetService.getPreset(data.presetId);
			if (!preset) {
				return json({ error: 'Preset not found' }, { status: 404 });
			}

			providerType = preset.provider;

			// Build config from preset config + user settings
			providerConfig = {
				...preset.config,
				...data.config
			};

			// For external-json provider, also include URL
			if (preset.url) {
				providerConfig.url = preset.url;
				providerConfig.headers = data.headers;
			}

			logger.info('[ExternalPreview API] Using preset', {
				presetId: data.presetId,
				providerType,
				config: providerConfig
			});
		} else if (data.providerType) {
			// Using explicit provider type with custom config
			providerType = data.providerType;
			providerConfig = data.config ?? {};

			// For external-json provider, include URL
			if (providerType === 'external-json' && data.url) {
				providerConfig.url = data.url;
				providerConfig.headers = data.headers;
			}

			logger.info('[ExternalPreview API] Using provider type', {
				providerType,
				config: providerConfig
			});
		} else if (data.url) {
			// Fallback to external-json for backward compatibility
			providerType = 'external-json';
			providerConfig = {
				url: data.url,
				headers: data.headers
			};

			logger.info('[ExternalPreview API] Using URL (backward compatibility)', {
				url: data.url
			});
		} else {
			return json({ error: 'Must provide presetId, providerType, or url' }, { status: 400 });
		}

		// Get the appropriate provider
		const provider = providerRegistry.get(providerType);
		if (!provider) {
			return json({ error: `Provider '${providerType}' not available` }, { status: 500 });
		}

		// Validate config
		if (!provider.validateConfig(providerConfig)) {
			return json(
				{ error: `Invalid configuration for provider '${providerType}'` },
				{ status: 400 }
			);
		}

		logger.info('[ExternalPreview API] Fetching external list', {
			providerType,
			mediaType: data.mediaType,
			isTest
		});

		// Fetch items from external source
		// For external lists, we pass empty string to show all content types
		// If mediaType is provided, use it; otherwise pass empty string for all types
		const result = await provider.fetchItems(providerConfig, data.mediaType ?? '');

		if (result.error) {
			return json({ error: result.error }, { status: 400 });
		}

		logger.info('[ExternalPreview API] Fetched external items', {
			totalCount: result.totalCount,
			failedCount: result.failedCount
		});

		// For test endpoint, just return counts without resolving IDs
		if (isTest) {
			return json({
				success: true,
				totalCount: result.totalCount,
				failedCount: result.failedCount
			});
		}

		// Resolve external items to TMDB items using concurrent batch processing
		const resolvedItems = [];
		const seenIds = new Set<number>();
		const failedItems: Array<{ imdbId?: string; title: string; year?: number; error?: string }> =
			[];
		let resolvedCount = 0;
		let failedCount = 0;
		let duplicatesRemoved = 0;

		// Determine resolution strategy based on mediaType
		// If no mediaType specified, try movie first, then TV as fallback
		const resolveMediaType = data.mediaType || 'movie';

		logger.info('[ExternalPreview API] Starting concurrent resolution', {
			totalItems: result.items.length,
			mediaType: resolveMediaType
		});

		// Use batch resolution with concurrency for much faster processing
		const resolutions = await externalIdResolver.resolveItemsBatch(
			result.items,
			resolveMediaType,
			10
		);

		// Process results and handle cross-type fallback for items without mediaType
		for (let i = 0; i < result.items.length; i++) {
			const item = result.items[i];
			let resolution = resolutions[i];

			// If no mediaType was specified and movie resolution failed, try TV
			if (!data.mediaType && !resolution.success && resolveMediaType === 'movie') {
				resolution = await externalIdResolver.resolveItem(item, 'tv');
			}

			if (resolution.success && resolution.tmdbId) {
				// Check for duplicates
				if (seenIds.has(resolution.tmdbId)) {
					duplicatesRemoved++;
					logger.debug('[ExternalPreview API] Duplicate item removed', {
						tmdbId: resolution.tmdbId,
						title: resolution.title
					});
					continue;
				}
				seenIds.add(resolution.tmdbId);

				resolvedItems.push({
					id: resolution.tmdbId,
					title: resolution.title,
					name: data.mediaType === 'tv' ? resolution.title : undefined,
					poster_path: item.posterPath ?? resolution.posterPath,
					vote_average: item.voteAverage ?? 0,
					release_date: item.year ? `${item.year}-01-01` : undefined,
					first_air_date: item.year ? `${item.year}-01-01` : undefined,
					overview: item.overview,
					inLibrary: false // Will be set below
				});
				resolvedCount++;
			} else {
				failedCount++;
				// Track failed items for debugging
				if (failedItems.length < 20) {
					failedItems.push({
						imdbId: item.imdbId,
						title: item.title,
						year: item.year,
						error: resolution.error
					});
				}
			}
		}

		// Log summary of failed items for debugging
		if (failedCount > 0) {
			logger.warn('[ExternalPreview API] Resolution summary', {
				totalItems: result.items.length,
				resolvedCount,
				failedCount,
				duplicatesRemoved,
				failedItems: failedItems.slice(0, 10)
			});
		}

		// Check which items are already in the library
		const tmdbIds = resolvedItems.map((item) => item.id);
		const libraryTmdbIds = new Set<number>();

		if (tmdbIds.length > 0) {
			// If mediaType is specified, check only that type; otherwise check both
			if (!data.mediaType || data.mediaType === 'movie') {
				const libraryMovies = await db.select({ tmdbId: movies.tmdbId }).from(movies);
				for (const movie of libraryMovies) {
					if (tmdbIds.includes(movie.tmdbId)) {
						libraryTmdbIds.add(movie.tmdbId);
					}
				}
			}
			if (!data.mediaType || data.mediaType === 'tv') {
				const librarySeries = await db.select({ tmdbId: series.tmdbId }).from(series);
				for (const show of librarySeries) {
					if (tmdbIds.includes(show.tmdbId)) {
						libraryTmdbIds.add(show.tmdbId);
					}
				}
			}
		}

		// Add inLibrary flag to each item
		const itemsWithLibraryStatus = resolvedItems.map((item) => ({
			...item,
			inLibrary: libraryTmdbIds.has(item.id)
		}));

		logger.info('[ExternalPreview API] Resolved items', {
			resolvedCount,
			failedCount,
			duplicatesRemoved,
			inLibrary: libraryTmdbIds.size
		});

		// Implement client-side pagination
		const page = data.page;
		const itemsPerPage = data.itemLimit;
		const totalItems = itemsWithLibraryStatus.length;
		const totalPages = Math.ceil(totalItems / itemsPerPage);

		// Slice items for the requested page
		const startIndex = (page - 1) * itemsPerPage;
		const endIndex = startIndex + itemsPerPage;
		const paginatedItems = itemsWithLibraryStatus.slice(startIndex, endIndex);

		logger.info('[ExternalPreview API] Returning paginated results', {
			page,
			itemsPerPage,
			totalItems,
			totalPages,
			returnedItems: paginatedItems.length
		});

		return json({
			items: paginatedItems,
			totalResults: totalItems,
			totalPages,
			unfilteredTotal: result.totalCount,
			resolvedCount,
			failedCount,
			duplicatesRemoved
		});
	} catch (error) {
		if (error instanceof z.ZodError) {
			logger.error('[ExternalPreview API] Validation error', { issues: error.issues });
			return json({ error: 'Validation failed', details: error.issues }, { status: 400 });
		}
		logger.error('[ExternalPreview API] Error', error);
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json({ error: message }, { status: 500 });
	}
};
