import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { activityService } from '$lib/server/activity';
import { logger } from '$lib/logging';
import type { ActivityFilters, ActivitySortOptions, FilterOptions } from '$lib/types/activity';
import { db } from '$lib/server/db';
import { downloadClients, indexers } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

/**
 * GET - Get unified activity with optional filtering
 *
 * Query params:
 * - status: Filter by status ('imported', 'failed', 'downloading', 'no_results', 'success', 'all')
 * - mediaType: Filter by media type ('movie', 'tv', 'all')
 * - search: Search in media title or release title
 * - protocol: Filter by protocol ('torrent', 'usenet', 'streaming', 'all')
 * - indexer: Filter by indexer name
 * - releaseGroup: Filter by release group
 * - resolution: Filter by resolution (e.g., '1080p', '4K')
 * - isUpgrade: Filter for upgrades only ('true', 'false')
 * - includeNoResults: Include 'no_results' activities ('true', 'false') - defaults to false
 * - downloadClientId: Filter by download client ID
 * - startDate: Filter activities after this date (ISO string)
 * - endDate: Filter activities before this date (ISO string)
 * - limit: Max number of results (default 50)
 * - offset: Pagination offset (default 0)
 * - sort: Sort field ('time', 'media', 'size', 'status')
 * - direction: Sort direction ('asc', 'desc')
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		// Parse query parameters
		const statusParam = url.searchParams.get('status') as ActivityFilters['status'] | null;
		const mediaType = url.searchParams.get('mediaType') as ActivityFilters['mediaType'] | null;
		const search = url.searchParams.get('search') || undefined;
		const protocol = url.searchParams.get('protocol') as ActivityFilters['protocol'] | null;
		const indexer = url.searchParams.get('indexer') || undefined;
		const releaseGroup = url.searchParams.get('releaseGroup') || undefined;
		const resolution = url.searchParams.get('resolution') || undefined;
		const isUpgradeParam = url.searchParams.get('isUpgrade');
		const includeNoResultsParam = url.searchParams.get('includeNoResults');
		const downloadClientId = url.searchParams.get('downloadClientId') || undefined;
		const startDate = url.searchParams.get('startDate') || undefined;
		const endDate = url.searchParams.get('endDate') || undefined;
		const limitParam = url.searchParams.get('limit');
		const offsetParam = url.searchParams.get('offset');
		const sortField = url.searchParams.get('sort') as ActivitySortOptions['field'] | null;
		const sortDirection = url.searchParams.get('direction') as
			| ActivitySortOptions['direction']
			| null;

		// Build filters
		const filters: ActivityFilters = {
			status: statusParam || 'all',
			mediaType: mediaType || 'all',
			search,
			protocol: protocol || 'all',
			indexer,
			releaseGroup,
			resolution,
			isUpgrade: isUpgradeParam === 'true' ? true : isUpgradeParam === 'false' ? false : undefined,
			includeNoResults: includeNoResultsParam === 'true' ? true : undefined,
			downloadClientId,
			startDate,
			endDate
		};

		// Build sort options
		const sort: ActivitySortOptions = {
			field: sortField || 'time',
			direction: sortDirection || 'desc'
		};

		// Build pagination
		const limit = Math.min(limitParam ? parseInt(limitParam, 10) : 50, 100);
		const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

		// Get activities from service
		const result = await activityService.getActivities(filters, sort, { limit, offset });

		return json({
			success: true,
			activities: result.activities,
			total: result.total,
			hasMore: result.hasMore
		});
	} catch (err) {
		logger.error('Error fetching activity', err instanceof Error ? err : undefined);
		return json({ error: 'Failed to fetch activity', success: false }, { status: 500 });
	}
};

/**
 * GET /options - Get available filter options (indexers, clients, etc.)
 */
export const OPTIONS: RequestHandler = async () => {
	try {
		// Fetch available indexers
		const indexerRows = await db
			.select({ id: indexers.id, name: indexers.name })
			.from(indexers)
			.where(eq(indexers.enabled, true))
			.orderBy(indexers.name);

		// Fetch available download clients
		const clientRows = await db
			.select({ id: downloadClients.id, name: downloadClients.name })
			.from(downloadClients)
			.where(eq(downloadClients.enabled, true))
			.orderBy(downloadClients.name);

		// Common resolutions
		const resolutions = ['4K', '2160p', '1080p', '720p', '480p', 'SD'];

		const options: FilterOptions = {
			indexers: indexerRows,
			downloadClients: clientRows,
			releaseGroups: [], // Will be populated from activity data
			resolutions
		};

		return json({ success: true, options });
	} catch (err) {
		logger.error('Error fetching filter options', err instanceof Error ? err : undefined);
		return json({ error: 'Failed to fetch filter options', success: false }, { status: 500 });
	}
};
