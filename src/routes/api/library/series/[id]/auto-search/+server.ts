import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { searchOnAdd } from '$lib/server/library/searchOnAdd.js';
import { db } from '$lib/server/db/index.js';
import { series } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { logger } from '$lib/logging';

/**
 * Auto-Search Request Types
 */
interface AutoSearchRequest {
	type: 'episode' | 'season' | 'missing' | 'bulk';
	episodeId?: string; // For single episode search
	seasonNumber?: number; // For season pack search
	episodeIds?: string[]; // For bulk episode selection
}

/**
 * POST /api/library/series/[id]/auto-search
 * Automatically search and grab releases for episodes/seasons
 */
export const POST: RequestHandler = async ({ params, request }) => {
	try {
		const seriesId = params.id;

		// Verify series exists
		const seriesData = await db.query.series.findFirst({
			where: eq(series.id, seriesId)
		});

		if (!seriesData) {
			return json({ success: false, error: 'Series not found' }, { status: 404 });
		}

		const body: AutoSearchRequest = await request.json();
		const { type, episodeId, seasonNumber, episodeIds } = body;

		switch (type) {
			case 'episode': {
				if (!episodeId) {
					return json(
						{ success: false, error: 'episodeId is required for episode search' },
						{ status: 400 }
					);
				}

				const result = await searchOnAdd.searchForEpisode({
					episodeId,
					bypassMonitoring: true
				});

				return json({
					success: result.success,
					results: [
						{
							itemId: episodeId,
							itemLabel: 'Episode',
							found: result.success && !!result.releaseName,
							grabbed: result.success && !!result.releaseName,
							releaseName: result.releaseName,
							error: result.error
						}
					],
					summary: {
						searched: 1,
						found: result.success && result.releaseName ? 1 : 0,
						grabbed: result.success && result.releaseName ? 1 : 0
					}
				});
			}

			case 'season': {
				if (seasonNumber === undefined) {
					return json(
						{ success: false, error: 'seasonNumber is required for season search' },
						{ status: 400 }
					);
				}

				const result = await searchOnAdd.searchForSeason({
					seriesId,
					seasonNumber,
					bypassMonitoring: true
				});

				return json({
					success: result.success,
					results: [
						{
							itemId: `${seriesId}-s${seasonNumber}`,
							itemLabel: `Season ${seasonNumber}`,
							found: result.success && !!result.releaseName,
							grabbed: result.success && !!result.releaseName,
							releaseName: result.releaseName,
							error: result.error
						}
					],
					summary: {
						searched: 1,
						found: result.success && result.releaseName ? 1 : 0,
						grabbed: result.success && result.releaseName ? 1 : 0
					}
				});
			}

			case 'missing': {
				const result = await searchOnAdd.searchForMissingEpisodes(seriesId);

				return json({
					success: true,
					results: result.results,
					summary: result.summary,
					// Include season pack details when available
					seasonPacks: result.seasonPacks
				});
			}

			case 'bulk': {
				if (!episodeIds || episodeIds.length === 0) {
					return json(
						{ success: false, error: 'episodeIds is required for bulk search' },
						{ status: 400 }
					);
				}

				const result = await searchOnAdd.searchBulkEpisodes(episodeIds);

				return json({
					success: true,
					results: result.results,
					summary: result.summary,
					// Include season pack details when available
					seasonPacks: result.seasonPacks
				});
			}

			default:
				return json({ success: false, error: `Invalid search type: ${type}` }, { status: 400 });
		}
	} catch (error) {
		logger.error('[API] Auto-search error', error instanceof Error ? error : undefined);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to perform auto-search'
			},
			{ status: 500 }
		);
	}
};
