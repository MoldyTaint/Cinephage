import { storageItems, movies, series } from '$lib/server/db/schema';
import { inArray } from 'drizzle-orm';
import type { InsightItemResolver } from './types.js';

export const unplayedResolver: InsightItemResolver = async ({ db, insight, page, limit }) => {
	const rawDetails = insight.detailsJson ? JSON.parse(insight.detailsJson) : null;
	if (
		!rawDetails?.itemIds ||
		!Array.isArray(rawDetails.itemIds) ||
		rawDetails.itemIds.length === 0
	) {
		return { items: [], total: 0 };
	}

	const allIds: string[] = rawDetails.itemIds;
	const total = allIds.length;
	const sliceStart = (page - 1) * limit;
	const slicedIds = allIds.slice(sliceStart, sliceStart + limit);

	if (slicedIds.length === 0) return { items: [], total: 0 };

	const rows = db
		.select({
			id: storageItems.id,
			title: storageItems.title,
			tmdbId: storageItems.tmdbId,
			itemType: storageItems.itemType
		})
		.from(storageItems)
		.where(inArray(storageItems.id, slicedIds))
		.all();

	const rowsById = new Map(rows.map((r) => [r.id, r]));

	const movieTmdbIds: number[] = [];
	const seriesTmdbIds: number[] = [];
	for (const row of rows) {
		if (row.itemType === 'movie' && row.tmdbId) movieTmdbIds.push(row.tmdbId);
		else if (row.tmdbId) seriesTmdbIds.push(row.tmdbId);
	}

	const movieMap = new Map<number, string>();
	const seriesMap = new Map<number, string>();
	if (movieTmdbIds.length > 0) {
		const mr = db
			.select({ id: movies.id, tmdbId: movies.tmdbId })
			.from(movies)
			.where(inArray(movies.tmdbId, movieTmdbIds))
			.all();
		for (const r of mr) movieMap.set(r.tmdbId, r.id);
	}
	if (seriesTmdbIds.length > 0) {
		const sr = db
			.select({ id: series.id, tmdbId: series.tmdbId })
			.from(series)
			.where(inArray(series.tmdbId, seriesTmdbIds))
			.all();
		for (const r of sr) seriesMap.set(r.tmdbId, r.id);
	}

	const sortedRows = slicedIds.map((id) => rowsById.get(id)).filter(Boolean);

	return {
		items: sortedRows.map((row) => ({
			id: `up-${row!.id}`,
			kind: (row!.itemType === 'movie' ? 'movie' : 'episode') as 'movie' | 'episode',
			title: row!.title,
			badges: [{ label: 'Unplayed', tone: 'warn' as const }],
			href: row!.tmdbId
				? movieMap.has(row!.tmdbId)
					? `/library/movie/${movieMap.get(row!.tmdbId)}`
					: seriesMap.has(row!.tmdbId)
						? `/library/tv/${seriesMap.get(row!.tmdbId)}`
						: undefined
				: undefined
		})),
		total
	};
};
