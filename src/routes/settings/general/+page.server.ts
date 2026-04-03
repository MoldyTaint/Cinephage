import type { PageServerLoad } from './$types';
import { sql } from 'drizzle-orm';
import { getRootFolderService } from '$lib/server/downloadClients/RootFolderService';
import { getEffectiveAnimeRootFolderEnforcement } from '$lib/server/library/anime-root-enforcement-settings.js';
import { getLibraryEntityService } from '$lib/server/library/LibraryEntityService';
import { db } from '$lib/server/db';
import { episodeFiles, movieFiles, movies, series, subtitles } from '$lib/server/db/schema';

type StorageBreakdownItem = {
	id: string;
	name: string;
	mediaType: 'movie' | 'tv';
	mediaSubType: 'standard' | 'anime';
	usedBytes: number;
	itemCount: number;
	path?: string | null;
};

export const load: PageServerLoad = async () => {
	const rootFolderService = getRootFolderService();
	const libraryService = getLibraryEntityService();

	const [
		rootFolders,
		enforceAnimeSubtype,
		libraries,
		movieStats,
		tvStats,
		subtitleStats,
		libraryMovieUsage,
		librarySeriesUsage
	] = await Promise.all([
		rootFolderService.getFolders(),
		getEffectiveAnimeRootFolderEnforcement(),
		libraryService.listLibraries(),
		db
			.select({
				usedBytes: sql<number>`COALESCE(SUM(${movieFiles.size}), 0)`,
				itemCount: sql<number>`COUNT(DISTINCT ${movies.id})`
			})
			.from(movies)
			.leftJoin(movieFiles, sql`${movieFiles.movieId} = ${movies.id}`)
			.get(),
		db
			.select({
				usedBytes: sql<number>`COALESCE(SUM(${episodeFiles.size}), 0)`,
				itemCount: sql<number>`COUNT(DISTINCT ${series.id})`
			})
			.from(series)
			.leftJoin(episodeFiles, sql`${episodeFiles.seriesId} = ${series.id}`)
			.get(),
		db
			.select({
				usedBytes: sql<number>`COALESCE(SUM(${subtitles.size}), 0)`,
				itemCount: sql<number>`COUNT(${subtitles.id})`
			})
			.from(subtitles)
			.get(),
		db
			.select({
				libraryId: movies.libraryId,
				usedBytes: sql<number>`COALESCE(SUM(${movieFiles.size}), 0)`,
				itemCount: sql<number>`COUNT(DISTINCT ${movies.id})`
			})
			.from(movies)
			.leftJoin(movieFiles, sql`${movieFiles.movieId} = ${movies.id}`)
			.groupBy(movies.libraryId),
		db
			.select({
				libraryId: series.libraryId,
				usedBytes: sql<number>`COALESCE(SUM(${episodeFiles.size}), 0)`,
				itemCount: sql<number>`COUNT(DISTINCT ${series.id})`
			})
			.from(series)
			.leftJoin(episodeFiles, sql`${episodeFiles.seriesId} = ${series.id}`)
			.groupBy(series.libraryId)
	]);

	const usageByLibrary = new Map<string, { usedBytes: number; itemCount: number }>();

	for (const row of [...libraryMovieUsage, ...librarySeriesUsage]) {
		if (!row.libraryId) continue;
		const current = usageByLibrary.get(row.libraryId) ?? { usedBytes: 0, itemCount: 0 };
		current.usedBytes += Number(row.usedBytes ?? 0);
		current.itemCount += Number(row.itemCount ?? 0);
		usageByLibrary.set(row.libraryId, current);
	}

	const libraryBreakdown: StorageBreakdownItem[] = libraries.map((library) => {
		const usage = usageByLibrary.get(library.id) ?? { usedBytes: 0, itemCount: 0 };
		return {
			id: library.id,
			name: library.name,
			mediaType: library.mediaType,
			mediaSubType: library.mediaSubType,
			usedBytes: usage.usedBytes,
			itemCount: usage.itemCount,
			path: library.defaultRootFolderPath
		};
	});

	const rootFolderBreakdown: StorageBreakdownItem[] = rootFolders.map((folder) => {
		const matchingLibraries = libraryBreakdown.filter(
			(item) =>
				item.mediaType === folder.mediaType &&
				item.mediaSubType === (folder.mediaSubType ?? 'standard') &&
				item.path === folder.path
		);
		return {
			id: folder.id,
			name: folder.name,
			path: folder.path,
			mediaType: folder.mediaType,
			mediaSubType: folder.mediaSubType ?? 'standard',
			usedBytes: matchingLibraries.reduce((sum, item) => sum + item.usedBytes, 0),
			itemCount: matchingLibraries.reduce((sum, item) => sum + item.itemCount, 0)
		};
	});

	return {
		rootFolders,
		enforceAnimeSubtype,
		libraries,
		storage: {
			totalUsedBytes:
				Number(movieStats?.usedBytes ?? 0) +
				Number(tvStats?.usedBytes ?? 0) +
				Number(subtitleStats?.usedBytes ?? 0),
			moviesUsedBytes: Number(movieStats?.usedBytes ?? 0),
			tvUsedBytes: Number(tvStats?.usedBytes ?? 0),
			subtitlesUsedBytes: Number(subtitleStats?.usedBytes ?? 0),
			movieCount: Number(movieStats?.itemCount ?? 0),
			seriesCount: Number(tvStats?.itemCount ?? 0),
			subtitleCount: Number(subtitleStats?.itemCount ?? 0),
			libraryBreakdown,
			rootFolderBreakdown
		}
	};
};
