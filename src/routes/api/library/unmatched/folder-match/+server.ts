import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { db } from '$lib/server/db/index.js';
import {
	unmatchedFiles,
	movies,
	series,
	seasons,
	movieFiles,
	episodes,
	episodeFiles,
	rootFolders
} from '$lib/server/db/schema.js';
import { eq, and, like } from 'drizzle-orm';
import { tmdb } from '$lib/server/tmdb.js';
import { mediaInfoService } from '$lib/server/library/index.js';
import path from 'path';
import { logger } from '$lib/logging';
import { parseRelease } from '$lib/server/indexers/parser/ReleaseParser.js';

/**
 * POST /api/library/unmatched/folder-match
 * Match all files in a folder to a TMDB entry
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { folderPath, tmdbId, mediaType } = body as {
			folderPath: string;
			tmdbId: number;
			mediaType: 'movie' | 'tv';
		};

		if (!folderPath || !tmdbId || !mediaType) {
			return json(
				{ success: false, error: 'folderPath, tmdbId, and mediaType are required' },
				{ status: 400 }
			);
		}

		// Get all unmatched files in this folder
		const files = await db
			.select()
			.from(unmatchedFiles)
			.where(like(unmatchedFiles.path, `${folderPath}%`));

		if (files.length === 0) {
			return json({ success: false, error: 'No unmatched files found in folder' }, { status: 404 });
		}

		// Get defaultMonitored from first file's root folder
		let defaultMonitored = true;
		const firstFile = files[0];
		if (firstFile.rootFolderId) {
			const [rootRow] = await db
				.select({ defaultMonitored: rootFolders.defaultMonitored })
				.from(rootFolders)
				.where(eq(rootFolders.id, firstFile.rootFolderId))
				.limit(1);
			defaultMonitored = rootRow?.defaultMonitored ?? true;
		}

		let result;
		if (mediaType === 'movie') {
			result = await matchMovieFolder(files, tmdbId, defaultMonitored);
		} else {
			result = await matchSeriesFolder(files, tmdbId, folderPath, defaultMonitored);
		}

		return json({
			success: true,
			message: `Successfully matched ${result.matched} files`,
			matched: result.matched,
			failed: result.failed,
			mediaId: result.mediaId
		});
	} catch (error) {
		logger.error('[API] Error matching folder', error instanceof Error ? error : undefined);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to match folder'
			},
			{ status: 500 }
		);
	}
};

/**
 * Match all files in a folder as a movie
 */
async function matchMovieFolder(
	files: Array<{
		id: string;
		path: string;
		rootFolderId: string | null;
		size: number | null;
	}>,
	tmdbId: number,
	defaultMonitored: boolean
) {
	const details = await tmdb.getMovie(tmdbId);

	// Check if movie already exists
	let [existingMovie] = await db.select().from(movies).where(eq(movies.tmdbId, tmdbId));

	if (!existingMovie) {
		// Create new movie entry
		const [newMovie] = await db
			.insert(movies)
			.values({
				tmdbId,
				title: details.title,
				originalTitle: details.original_title || details.title,
				year: details.release_date ? parseInt(details.release_date.substring(0, 4), 10) : null,
				overview: details.overview,
				posterPath: details.poster_path,
				backdropPath: details.backdrop_path,
				path: path.dirname(files[0].path),
				rootFolderId: files[0].rootFolderId,
				monitored: defaultMonitored
			})
			.returning();
		existingMovie = newMovie;
	}

	let matched = 0;
	let failed = 0;

	for (const file of files) {
		try {
			// Get media info
			const mediaInfo = await mediaInfoService.extractMediaInfo(file.path);

			// Add the movie file
			await db.insert(movieFiles).values({
				movieId: existingMovie.id,
				relativePath: path.basename(file.path),
				size: file.size,
				quality: null,
				mediaInfo: mediaInfo || null
			});

			// Delete from unmatched
			await db.delete(unmatchedFiles).where(eq(unmatchedFiles.id, file.id));

			matched++;
		} catch (error) {
			logger.error(`[FolderMatch] Failed to match movie file ${file.path}`, error as Error);
			failed++;
		}
	}

	// Update movie to have file
	await db.update(movies).set({ hasFile: true }).where(eq(movies.id, existingMovie.id));

	return { matched, failed, mediaId: existingMovie.id };
}

/**
 * Match all files in a folder as a TV series
 */
async function matchSeriesFolder(
	files: Array<{
		id: string;
		path: string;
		rootFolderId: string | null;
		size: number | null;
	}>,
	tmdbId: number,
	folderPath: string,
	defaultMonitored: boolean
) {
	const details = await tmdb.getTVShow(tmdbId);

	// Check if series already exists
	let [existingSeries] = await db.select().from(series).where(eq(series.tmdbId, tmdbId));

	if (!existingSeries) {
		// Create new series entry
		const [newSeries] = await db
			.insert(series)
			.values({
				tmdbId,
				title: details.name,
				originalTitle: details.original_name || details.name,
				year: details.first_air_date ? parseInt(details.first_air_date.substring(0, 4), 10) : null,
				overview: details.overview,
				posterPath: details.poster_path,
				backdropPath: details.backdrop_path,
				path: folderPath,
				rootFolderId: files[0].rootFolderId,
				monitored: defaultMonitored
			})
			.returning();
		existingSeries = newSeries;

		// Populate all seasons and episodes from TMDB
		if (details.seasons && details.seasons.length > 0) {
			for (const seasonInfo of details.seasons) {
				try {
					const fullSeason = await tmdb.getSeason(tmdbId, seasonInfo.season_number);
					const isSpecials = seasonInfo.season_number === 0;

					// Create season record
					const [newSeasonRecord] = await db
						.insert(seasons)
						.values({
							seriesId: existingSeries.id,
							seasonNumber: seasonInfo.season_number,
							name: seasonInfo.name,
							overview: seasonInfo.overview,
							posterPath: seasonInfo.poster_path,
							airDate: seasonInfo.air_date,
							episodeCount: seasonInfo.episode_count ?? 0,
							episodeFileCount: 0,
							monitored: defaultMonitored && !isSpecials
						})
						.returning();

					// Create episode records
					if (fullSeason.episodes) {
						for (const ep of fullSeason.episodes) {
							await db.insert(episodes).values({
								seriesId: existingSeries.id,
								seasonId: newSeasonRecord.id,
								seasonNumber: ep.season_number,
								episodeNumber: ep.episode_number,
								tmdbId: ep.id,
								title: ep.name,
								overview: ep.overview,
								airDate: ep.air_date,
								runtime: ep.runtime,
								monitored: defaultMonitored && !isSpecials,
								hasFile: false
							});
						}
					}
				} catch {
					logger.warn('[FolderMatch] Failed to fetch TMDB season', {
						tmdbId,
						seasonNumber: seasonInfo.season_number
					});
				}
			}

			// Update series episode count (excluding specials)
			const allEps = await db
				.select()
				.from(episodes)
				.where(eq(episodes.seriesId, existingSeries.id));
			const regularEps = allEps.filter((e) => e.seasonNumber !== 0);
			await db
				.update(series)
				.set({
					episodeCount: regularEps.length,
					episodeFileCount: 0
				})
				.where(eq(series.id, existingSeries.id));
		}
	}

	let matched = 0;
	let failed = 0;

	for (const file of files) {
		try {
			// Parse season and episode from filename
			const parsedInfo = parseRelease(path.basename(file.path));
			const season = parsedInfo.episode?.season ?? 1;
			const episode = parsedInfo.episode?.episodes?.[0];

			if (episode === undefined) {
				logger.warn(`[FolderMatch] Could not parse season/episode for ${file.path}`);
				failed++;
				continue;
			}

			// Check if season exists, create if not
			let [existingSeason] = await db
				.select()
				.from(seasons)
				.where(and(eq(seasons.seriesId, existingSeries.id), eq(seasons.seasonNumber, season)));

			if (!existingSeason) {
				const [newSeason] = await db
					.insert(seasons)
					.values({
						seriesId: existingSeries.id,
						seasonNumber: season,
						monitored: defaultMonitored && season !== 0
					})
					.returning();
				existingSeason = newSeason;
			}

			// Find or create episode
			const [existingEpisode] = await db
				.select()
				.from(episodes)
				.where(
					and(
						eq(episodes.seriesId, existingSeries.id),
						eq(episodes.seasonNumber, season),
						eq(episodes.episodeNumber, episode)
					)
				);

			let episodeId: string;

			if (existingEpisode) {
				episodeId = existingEpisode.id;
			} else {
				// Create episode entry
				const [newEpisode] = await db
					.insert(episodes)
					.values({
						seriesId: existingSeries.id,
						seasonNumber: season,
						episodeNumber: episode,
						title: `Season ${season} Episode ${episode}`,
						monitored: defaultMonitored && season !== 0,
						hasFile: true
					})
					.returning();
				episodeId = newEpisode.id;
			}

			// Get media info
			const mediaInfo = await mediaInfoService.extractMediaInfo(file.path);

			// Add the episode file
			await db.insert(episodeFiles).values({
				seriesId: existingSeries.id,
				seasonNumber: season,
				episodeIds: [episodeId],
				relativePath: path.basename(file.path),
				size: file.size,
				quality: null,
				mediaInfo: mediaInfo || null
			});

			// Update episode to have file
			await db.update(episodes).set({ hasFile: true }).where(eq(episodes.id, episodeId));

			// Delete from unmatched
			await db.delete(unmatchedFiles).where(eq(unmatchedFiles.id, file.id));

			matched++;
		} catch (error) {
			logger.error(`[FolderMatch] Failed to match episode file ${file.path}`, error as Error);
			failed++;
		}
	}

	return { matched, failed, mediaId: existingSeries.id };
}
