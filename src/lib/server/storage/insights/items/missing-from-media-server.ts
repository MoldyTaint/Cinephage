import { storageItems, movies, series, episodeFiles } from '$lib/server/db/schema';
import { eq, notInArray, and, count, inArray } from 'drizzle-orm';
import type { InsightItemResolver } from './types.js';

export const missingFromMediaServerResolver: InsightItemResolver = async ({ db, page, limit }) => {
	const total =
		db
			.select({ count: count() })
			.from(storageItems)
			.where(
				and(
					eq(storageItems.sourceSystem, 'local'),
					notInArray(storageItems.itemType, ['series', 'season'])
				)
			)
			.get()?.count ?? 0;
	if (total === 0) return { items: [], total: 0 };

	const rows = db
		.select({
			id: storageItems.id,
			title: storageItems.title,
			tmdbId: storageItems.tmdbId,
			itemType: storageItems.itemType,
			seriesName: storageItems.seriesName,
			seasonNumber: storageItems.seasonNumber,
			episodeNumber: storageItems.episodeNumber,
			episodeFileId: storageItems.episodeFileId
		})
		.from(storageItems)
		.where(
			and(
				eq(storageItems.sourceSystem, 'local'),
				notInArray(storageItems.itemType, ['series', 'season'])
			)
		)
		.limit(limit)
		.offset((page - 1) * limit)
		.all();

	const episodeFileIds = rows.filter((r) => r.episodeFileId).map((r) => r.episodeFileId!);
	const episodePathMap = new Map<string, string>();
	if (episodeFileIds.length > 0) {
		const efr = db
			.select({ id: episodeFiles.id, relativePath: episodeFiles.relativePath })
			.from(episodeFiles)
			.where(inArray(episodeFiles.id, episodeFileIds))
			.all();
		for (const r of efr) episodePathMap.set(r.id, r.relativePath);
	}

	const movieTmdbIds = rows.filter((r) => r.itemType === 'movie' && r.tmdbId).map((r) => r.tmdbId!);
	const seriesTmdbIds = rows
		.filter((r) => r.itemType !== 'movie' && r.tmdbId)
		.map((r) => r.tmdbId!);
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

	function buildItem(
		row: (typeof rows)[number],
		movieMap: Map<number, string>,
		seriesMap: Map<number, string>
	) {
		const href = row.tmdbId
			? movieMap.has(row.tmdbId)
				? `/library/movie/${movieMap.get(row.tmdbId)}`
				: seriesMap.has(row.tmdbId)
					? `/library/tv/${seriesMap.get(row.tmdbId)}`
					: undefined
			: undefined;

		if (row.itemType === 'movie') {
			return {
				id: `mm-${row.id}`,
				kind: 'movie' as const,
				title: row.title,
				badges: [{ label: 'Missing from server', tone: 'info' as const }],
				href
			};
		}

		const seasonLabel = `S${String(row.seasonNumber ?? 0).padStart(2, '0')}`;
		const episodeLabel = `E${String(row.episodeNumber ?? 0).padStart(2, '0')}`;
		const seriesTitle = row.seriesName || row.title;

		const epPath = row.episodeFileId ? episodePathMap.get(row.episodeFileId) : null;
		const epFromPath = epPath
			? (epPath.split('/').pop() ?? epPath)
			: `${seasonLabel}${episodeLabel}`;

		return {
			id: `mm-${row.id}`,
			kind: 'episode' as const,
			title: epFromPath,
			subtitle: seriesTitle,
			badges: [{ label: 'Missing from server', tone: 'info' as const }],
			href
		};
	}

	return {
		items: rows.map((row) => buildItem(row, movieMap, seriesMap)),
		total
	};
};
