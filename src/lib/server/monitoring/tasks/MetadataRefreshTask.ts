import { db } from '$lib/server/db/index.js';
import { movies, series } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { tmdb } from '$lib/server/tmdb.js';
import { logger } from '$lib/logging/index.js';
import type { TaskResult } from '../MonitoringScheduler.js';
import type { TaskExecutionContext } from '$lib/server/tasks/TaskExecutionContext.js';
import { TaskCancelledException } from '$lib/server/tasks/TaskCancelledException.js';

export async function executeMetadataRefreshTask(
	ctx: TaskExecutionContext | null
): Promise<TaskResult> {
	const executedAt = new Date();
	logger.info('[MetadataRefreshTask] Starting metadata refresh');

	let itemsProcessed = 0;
	let itemsUpdated = 0;
	let errors = 0;

	try {
		ctx?.checkCancelled();

		const allMovies = await db
			.select({
				id: movies.id,
				tmdbId: movies.tmdbId,
				title: movies.title
			})
			.from(movies);

		logger.info({ count: allMovies.length }, '[MetadataRefreshTask] Found movies to refresh');

		for await (const movie of ctx?.iterate?.(allMovies) ?? allMovies) {
			try {
				const tmdbMovie = await tmdb.getMovie(movie.tmdbId);

				let externalIds: { imdb_id: string | null } | null = null;
				try {
					externalIds = await tmdb.getMovieExternalIds(movie.tmdbId);
				} catch {
					logger.warn(
						{ tmdbId: movie.tmdbId },
						'[MetadataRefreshTask] Failed to fetch external IDs (non-fatal)'
					);
				}

				await db
					.update(movies)
					.set({
						title: tmdbMovie.title,
						originalTitle: tmdbMovie.original_title,
						overview: tmdbMovie.overview,
						posterPath: tmdbMovie.poster_path,
						backdropPath: tmdbMovie.backdrop_path,
						runtime: tmdbMovie.runtime,
						genres: tmdbMovie.genres?.map((g) => g.name),
						year: tmdbMovie.release_date
							? new Date(tmdbMovie.release_date).getFullYear()
							: undefined,
						releaseDate: tmdbMovie.release_date ?? undefined,
						imdbId: externalIds?.imdb_id ?? undefined,
						tmdbCollectionId: tmdbMovie.belongs_to_collection?.id ?? null,
						collectionName: tmdbMovie.belongs_to_collection?.name ?? null
					})
					.where(eq(movies.id, movie.id));

				itemsUpdated++;
			} catch (err) {
				errors++;
				logger.error(
					{ err, movieId: movie.id, tmdbId: movie.tmdbId },
					'[MetadataRefreshTask] Failed to refresh movie'
				);
			}

			itemsProcessed++;

			if (itemsProcessed % 50 === 0) {
				logger.info(
					{ itemsProcessed, itemsUpdated, errors, total: allMovies.length },
					'[MetadataRefreshTask] Progress'
				);
			}

			await ctx?.delay(250);
		}

		ctx?.checkCancelled();

		const allSeries = await db
			.select({
				id: series.id,
				tmdbId: series.tmdbId,
				title: series.title
			})
			.from(series);

		logger.info({ count: allSeries.length }, '[MetadataRefreshTask] Found series to refresh');

		for await (const s of ctx?.iterate?.(allSeries) ?? allSeries) {
			try {
				const tmdbSeries = await tmdb.getTVShow(s.tmdbId);

				await db
					.update(series)
					.set({
						title: tmdbSeries.name,
						originalTitle: tmdbSeries.original_name,
						overview: tmdbSeries.overview,
						posterPath: tmdbSeries.poster_path,
						backdropPath: tmdbSeries.backdrop_path,
						status: tmdbSeries.status,
						network: tmdbSeries.networks?.[0]?.name ?? undefined,
						genres: tmdbSeries.genres?.map((g) => g.name),
						year: tmdbSeries.first_air_date
							? new Date(tmdbSeries.first_air_date).getFullYear()
							: undefined,
						firstAirDate: tmdbSeries.first_air_date ?? undefined
					})
					.where(eq(series.id, s.id));

				itemsUpdated++;
			} catch (err) {
				errors++;
				logger.error(
					{ err, seriesId: s.id, tmdbId: s.tmdbId },
					'[MetadataRefreshTask] Failed to refresh series'
				);
			}

			itemsProcessed++;

			if (itemsProcessed % 50 === 0) {
				logger.info({ itemsProcessed, itemsUpdated, errors }, '[MetadataRefreshTask] Progress');
			}

			await ctx?.delay(250);
		}

		logger.info(
			{ itemsProcessed, itemsUpdated, errors },
			'[MetadataRefreshTask] Metadata refresh completed'
		);

		return {
			taskType: 'metadata-refresh',
			itemsProcessed,
			itemsGrabbed: itemsUpdated,
			errors,
			executedAt
		};
	} catch (error) {
		if (TaskCancelledException.isTaskCancelled(error)) {
			logger.info({ itemsProcessed }, '[MetadataRefreshTask] Task cancelled');
		} else {
			logger.error({ err: error }, '[MetadataRefreshTask] Metadata refresh failed');
		}
		throw error;
	}
}
