import { db } from '$lib/server/db';
import { movies, series, episodes } from '$lib/server/db/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import { tmdb } from '$lib/server/tmdb.js';
import type { DiscoverItem } from '$lib/server/tmdb.js';

export interface CalendarMovieItem {
	tmdbId: number;
	title: string;
	posterPath: string | null;
	releaseDate: string;
	inLibrary: boolean;
	movieId?: string;
}

export interface CalendarEpisodeItem {
	episodeId: string;
	title: string | null;
	seasonNumber: number;
	episodeNumber: number;
	airDate: string | null;
	seriesId: string;
	seriesTitle: string;
	seriesPosterPath: string | null;
}

export interface CalendarDay {
	date: string;
	movies: CalendarMovieItem[];
	episodes: CalendarEpisodeItem[];
}

export interface UpcomingItem {
	type: 'movie' | 'episode';
	date: string;
	title: string;
	posterPath: string | null;
	subtitle?: string;
	tmdbId?: number;
	movieId?: string;
	seriesId?: string;
	episodeId?: string;
}

function getMonthRange(monthStr: string): { start: string; end: string } {
	const [year, month] = monthStr.split('-').map(Number);
	const monthStart = new Date(year, month - 1, 1);
	const monthEnd = new Date(year, month, 0);
	const start = new Date(monthStart);
	start.setDate(start.getDate() - 3);
	const end = new Date(monthEnd);
	end.setDate(end.getDate() + 3);
	return {
		start: start.toISOString().split('T')[0],
		end: end.toISOString().split('T')[0]
	};
}

async function fetchTmdbUpcoming(): Promise<DiscoverItem[]> {
	try {
		const [nowPlaying, upcoming] = await Promise.all([tmdb.getNowPlaying(), tmdb.getUpcoming()]);
		const seen = new Set<number>();
		const merged: DiscoverItem[] = [];
		for (const item of [...nowPlaying.results, ...upcoming.results]) {
			if (!seen.has(item.id)) {
				seen.add(item.id);
				merged.push(item);
			}
		}
		return merged;
	} catch {
		return [];
	}
}

async function getLibraryMovieTmdbIds(): Promise<Set<number>> {
	const rows = await db.select({ tmdbId: movies.tmdbId }).from(movies);
	return new Set(rows.map((r) => r.tmdbId));
}

export async function getCalendarData(
	monthStr: string,
	type: 'all' | 'movies' | 'episodes'
): Promise<CalendarDay[]> {
	const { start, end } = getMonthRange(monthStr);
	const dayMap = new Map<string, CalendarDay>();

	const allDates: string[] = [];
	const current = new Date(start + 'T00:00:00');
	const endDate = new Date(end + 'T00:00:00');
	while (current <= endDate) {
		const dateStr = current.toISOString().split('T')[0];
		allDates.push(dateStr);
		dayMap.set(dateStr, { date: dateStr, movies: [], episodes: [] });
		current.setDate(current.getDate() + 1);
	}

	const includeMovies = type === 'all' || type === 'movies';
	const includeEpisodes = type === 'all' || type === 'episodes';

	if (includeMovies) {
		const [tmdbItems, libraryTmdbIds, libraryMovies] = await Promise.all([
			fetchTmdbUpcoming(),
			getLibraryMovieTmdbIds(),
			db.select({ tmdbId: movies.tmdbId, id: movies.id }).from(movies)
		]);

		const libraryMovieMap = new Map(libraryMovies.map((m) => [m.tmdbId, m.id]));

		for (const item of tmdbItems) {
			const releaseDate = item.release_date;
			if (!releaseDate || releaseDate < start || releaseDate > end) continue;
			const inLibrary = libraryTmdbIds.has(item.id);
			const day = dayMap.get(releaseDate);
			if (!day) continue;
			day.movies.push({
				tmdbId: item.id,
				title: item.title ?? item.original_title ?? 'Unknown',
				posterPath: item.poster_path,
				releaseDate,
				inLibrary,
				movieId: inLibrary ? libraryMovieMap.get(item.id) : undefined
			});
		}
	}

	if (includeEpisodes) {
		const episodeRows = await db
			.select({
				episodeId: episodes.id,
				episodeTitle: episodes.title,
				seasonNumber: episodes.seasonNumber,
				episodeNumber: episodes.episodeNumber,
				airDate: episodes.airDate,
				seriesId: episodes.seriesId,
				seriesTitle: series.title,
				seriesPosterPath: series.posterPath
			})
			.from(episodes)
			.innerJoin(series, eq(episodes.seriesId, series.id))
			.where(
				and(
					eq(episodes.monitored, true),
					eq(series.monitored, true),
					gte(episodes.airDate, start),
					lte(episodes.airDate, end)
				)
			);

		for (const ep of episodeRows) {
			if (!ep.airDate) continue;
			const day = dayMap.get(ep.airDate);
			if (!day) continue;
			day.episodes.push({
				episodeId: ep.episodeId,
				title: ep.episodeTitle,
				seasonNumber: ep.seasonNumber,
				episodeNumber: ep.episodeNumber,
				airDate: ep.airDate,
				seriesId: ep.seriesId,
				seriesTitle: ep.seriesTitle,
				seriesPosterPath: ep.seriesPosterPath
			});
		}
	}

	return Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export async function getUpcomingItems(limit = 7): Promise<UpcomingItem[]> {
	const today = new Date().toISOString().split('T')[0];

	const [episodeRows, tmdbItems] = await Promise.all([
		db
			.select({
				episodeId: episodes.id,
				episodeTitle: episodes.title,
				seasonNumber: episodes.seasonNumber,
				episodeNumber: episodes.episodeNumber,
				airDate: episodes.airDate,
				seriesId: episodes.seriesId,
				seriesTitle: series.title,
				seriesPosterPath: series.posterPath
			})
			.from(episodes)
			.innerJoin(series, eq(episodes.seriesId, series.id))
			.where(
				and(eq(episodes.monitored, true), eq(series.monitored, true), gte(episodes.airDate, today))
			)
			.orderBy(episodes.airDate)
			.limit(limit),
		fetchTmdbUpcoming()
	]);

	const items: UpcomingItem[] = [];

	for (const ep of episodeRows) {
		if (!ep.airDate) continue;
		items.push({
			type: 'episode',
			date: ep.airDate,
			title: ep.seriesTitle,
			posterPath: ep.seriesPosterPath,
			subtitle: `S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')}${ep.episodeTitle ? ` - ${ep.episodeTitle}` : ''}`,
			seriesId: ep.seriesId,
			episodeId: ep.episodeId
		});
	}

	if (items.length < limit) {
		const libraryTmdbIds = await getLibraryMovieTmdbIds();
		const libraryMovies = await db.select({ tmdbId: movies.tmdbId, id: movies.id }).from(movies);
		const libraryMovieMap = new Map(libraryMovies.map((m) => [m.tmdbId, m.id]));

		for (const item of tmdbItems) {
			if (items.length >= limit) break;
			const releaseDate = item.release_date;
			if (!releaseDate || releaseDate < today) continue;
			const inLibrary = libraryTmdbIds.has(item.id);
			items.push({
				type: 'movie',
				date: releaseDate,
				title: item.title ?? item.original_title ?? 'Unknown',
				posterPath: item.poster_path,
				tmdbId: item.id,
				movieId: inLibrary ? libraryMovieMap.get(item.id) : undefined
			});
		}
	}

	items.sort((a, b) => a.date.localeCompare(b.date));

	return items.slice(0, limit);
}
