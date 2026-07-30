import { movies, series } from '$lib/server/db/schema';
import { inArray } from 'drizzle-orm';
import type { InsightItemResolver } from './types.js';

export const brokenPathsResolver: InsightItemResolver = async ({ db, insight, page, limit }) => {
	const rawDetails = insight.detailsJson ? JSON.parse(insight.detailsJson) : null;
	if (!rawDetails?.items || !Array.isArray(rawDetails.items)) {
		return { items: [], total: 0 };
	}
	type Item = { storageId: string; title: string; tmdbId: number | null };
	const items: Item[] = rawDetails.items;
	const total = items.length;
	const sliceStart = (page - 1) * limit;
	const sliced = items.slice(sliceStart, sliceStart + limit);
	const tmdbIds = sliced.map((i) => i.tmdbId).filter((id): id is number => id !== null);
	const movieMap = new Map<number, string>();
	const seriesMap = new Map<number, string>();
	if (tmdbIds.length > 0) {
		const movieRows = db
			.select({ id: movies.id, tmdbId: movies.tmdbId })
			.from(movies)
			.where(inArray(movies.tmdbId, tmdbIds))
			.all();
		for (const r of movieRows) movieMap.set(r.tmdbId, r.id);
		const seriesRows = db
			.select({ id: series.id, tmdbId: series.tmdbId })
			.from(series)
			.where(inArray(series.tmdbId, tmdbIds))
			.all();
		for (const r of seriesRows) seriesMap.set(r.tmdbId, r.id);
	}
	return {
		items: sliced.map((item) => ({
			id: `bp-${item.storageId}`,
			kind: movieMap.has(item.tmdbId ?? -1) ? ('movie' as const) : ('series' as const),
			title: item.title,
			subtitle: `Storage ID: ${item.storageId}`,
			badges: [{ label: 'File missing', tone: 'critical' as const }],
			href: movieMap.has(item.tmdbId ?? -1)
				? `/library/movie/${movieMap.get(item.tmdbId!)}`
				: seriesMap.has(item.tmdbId ?? -1)
					? `/library/tv/${seriesMap.get(item.tmdbId!)}`
					: undefined
		})),
		total
	};
};
