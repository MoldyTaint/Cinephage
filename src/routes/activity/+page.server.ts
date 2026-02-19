import type { PageServerLoad } from './$types';
import type { UnifiedActivity, ActivityFilters, FilterOptions } from '$lib/types/activity';
import { db } from '$lib/server/db';
import { downloadClients, indexers } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ fetch, url }) => {
	// Parse all filter parameters
	const status = url.searchParams.get('status') || 'all';
	const mediaType = url.searchParams.get('mediaType') || 'all';
	const search = url.searchParams.get('search') || '';
	const protocol = url.searchParams.get('protocol') || 'all';
	const indexer = url.searchParams.get('indexer') || '';
	const releaseGroup = url.searchParams.get('releaseGroup') || '';
	const resolution = url.searchParams.get('resolution') || '';
	const isUpgrade = url.searchParams.get('isUpgrade') === 'true';
	const includeNoResults = url.searchParams.get('includeNoResults') === 'true';
	const downloadClientId = url.searchParams.get('downloadClientId') || '';
	const startDate = url.searchParams.get('startDate') || '';
	const endDate = url.searchParams.get('endDate') || '';

	// Build filters object
	const filters: ActivityFilters = {
		status: status as ActivityFilters['status'],
		mediaType: mediaType as ActivityFilters['mediaType'],
		search: search || undefined,
		protocol: protocol as ActivityFilters['protocol'],
		indexer: indexer || undefined,
		releaseGroup: releaseGroup || undefined,
		resolution: resolution || undefined,
		isUpgrade: isUpgrade || undefined,
		includeNoResults: includeNoResults || undefined,
		downloadClientId: downloadClientId || undefined,
		startDate: startDate || undefined,
		endDate: endDate || undefined
	};

	// Build API URL with query params
	const apiUrl = new URL('/api/activity', url.origin);
	apiUrl.searchParams.set('limit', '50');
	apiUrl.searchParams.set('offset', '0');

	if (filters.status !== 'all') apiUrl.searchParams.set('status', filters.status!);
	if (filters.mediaType !== 'all') apiUrl.searchParams.set('mediaType', filters.mediaType!);
	if (filters.search) apiUrl.searchParams.set('search', filters.search);
	if (filters.protocol !== 'all') apiUrl.searchParams.set('protocol', filters.protocol!);
	if (filters.indexer) apiUrl.searchParams.set('indexer', filters.indexer);
	if (filters.releaseGroup) apiUrl.searchParams.set('releaseGroup', filters.releaseGroup);
	if (filters.resolution) apiUrl.searchParams.set('resolution', filters.resolution);
	if (filters.isUpgrade) apiUrl.searchParams.set('isUpgrade', 'true');
	if (filters.includeNoResults) apiUrl.searchParams.set('includeNoResults', 'true');
	if (filters.downloadClientId)
		apiUrl.searchParams.set('downloadClientId', filters.downloadClientId);
	if (filters.startDate) apiUrl.searchParams.set('startDate', filters.startDate);
	if (filters.endDate) apiUrl.searchParams.set('endDate', filters.endDate);

	// Fetch filter options (indexers, download clients)
	const [indexerRows, clientRows] = await Promise.all([
		db
			.select({ id: indexers.id, name: indexers.name })
			.from(indexers)
			.where(eq(indexers.enabled, true))
			.orderBy(indexers.name),
		db
			.select({ id: downloadClients.id, name: downloadClients.name })
			.from(downloadClients)
			.where(eq(downloadClients.enabled, true))
			.orderBy(downloadClients.name)
	]);

	const filterOptions: FilterOptions = {
		indexers: indexerRows,
		downloadClients: clientRows,
		releaseGroups: [],
		resolutions: ['4K', '2160p', '1080p', '720p', '480p', 'SD']
	};

	try {
		const response = await fetch(apiUrl.toString());
		const data = await response.json();

		return {
			activities: data.activities as UnifiedActivity[],
			total: data.total as number,
			hasMore: data.hasMore as boolean,
			filters,
			filterOptions
		};
	} catch (error) {
		console.error('Failed to load activity:', error);
		return {
			activities: [] as UnifiedActivity[],
			total: 0,
			hasMore: false,
			filters,
			filterOptions
		};
	}
};
