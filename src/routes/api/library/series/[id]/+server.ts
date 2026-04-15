import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { db } from '$lib/server/db/index.js';
import {
	series,
	seasons,
	episodes,
	episodeFiles,
	downloadHistory,
	downloadQueue,
	rootFolders,
	subtitles
} from '$lib/server/db/schema.js';
import { eq, inArray, and } from 'drizzle-orm';
import { deleteDirectoryWithinRoot } from '$lib/server/filesystem/delete-helpers.js';
import { logger } from '$lib/logging';
import { getLanguageProfileService } from '$lib/server/subtitles/services/LanguageProfileService.js';
import { searchSubtitlesForMediaBatch } from '$lib/server/subtitles/services/SubtitleImportService.js';
import { searchOnAdd } from '$lib/server/library/searchOnAdd.js';
import { monitoringScheduler } from '$lib/server/monitoring/MonitoringScheduler.js';
import { deleteAllAlternateTitles } from '$lib/server/services/index.js';
import { getDownloadClientManager } from '$lib/server/downloadClients/DownloadClientManager.js';
import { libraryMediaEvents } from '$lib/server/library/LibraryMediaEvents';
import {
	validateRootFolder,
	getAnimeSubtypeEnforcement
} from '$lib/server/library/LibraryAddService.js';
import { mediaMoveService } from '$lib/server/library/MediaMoveService.js';
import { getLibraryEntityService } from '$lib/server/library/LibraryEntityService.js';
import { isLikelyAnimeMedia } from '$lib/shared/anime-classification.js';
import { tmdb } from '$lib/server/tmdb.js';

/**
 * GET /api/library/series/[id]
 * Get a specific series with seasons and episodes
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const [seriesItem] = await db
			.select({
				id: series.id,
				tmdbId: series.tmdbId,
				tvdbId: series.tvdbId,
				imdbId: series.imdbId,
				title: series.title,
				originalTitle: series.originalTitle,
				year: series.year,
				overview: series.overview,
				posterPath: series.posterPath,
				backdropPath: series.backdropPath,
				status: series.status,
				network: series.network,
				genres: series.genres,
				path: series.path,
				rootFolderId: series.rootFolderId,
				rootFolderPath: rootFolders.path,
				scoringProfileId: series.scoringProfileId,
				languageProfileId: series.languageProfileId,
				monitored: series.monitored,
				seasonFolder: series.seasonFolder,
				seriesType: series.seriesType,
				added: series.added,
				episodeCount: series.episodeCount,
				episodeFileCount: series.episodeFileCount,
				wantsSubtitles: series.wantsSubtitles
			})
			.from(series)
			.leftJoin(rootFolders, eq(series.rootFolderId, rootFolders.id))
			.where(eq(series.id, params.id));

		if (!seriesItem) {
			return json({ success: false, error: 'Series not found' }, { status: 404 });
		}

		// Get seasons
		const allSeasons = await db
			.select()
			.from(seasons)
			.where(eq(seasons.seriesId, params.id))
			.orderBy(seasons.seasonNumber);

		// Get episodes
		const allEpisodes = await db
			.select()
			.from(episodes)
			.where(eq(episodes.seriesId, params.id))
			.orderBy(episodes.seasonNumber, episodes.episodeNumber);

		// Get episode files
		const allFiles = await db
			.select()
			.from(episodeFiles)
			.where(eq(episodeFiles.seriesId, params.id));

		// Match the page-load/SSE behavior: build a stable episode -> file map.
		// Using allFiles.find(...) can over-assign stale pack rows during client-side refreshes.
		const episodeIdToFile = new Map<string, (typeof allFiles)[number]>();
		for (const file of allFiles) {
			const episodeIds = file.episodeIds as string[] | null;
			for (const episodeId of episodeIds ?? []) {
				episodeIdToFile.set(episodeId, file);
			}
		}

		// Get subtitles for all episodes in this series
		const episodeIds = allEpisodes.map((ep) => ep.id);
		const allSubtitles =
			episodeIds.length > 0
				? await db.select().from(subtitles).where(inArray(subtitles.episodeId, episodeIds))
				: [];

		// Group subtitles by episode ID
		const subtitlesByEpisode = new Map<string, typeof allSubtitles>();
		for (const sub of allSubtitles) {
			if (sub.episodeId) {
				const existing = subtitlesByEpisode.get(sub.episodeId) || [];
				existing.push(sub);
				subtitlesByEpisode.set(sub.episodeId, existing);
			}
		}

		// Build structured response
		const seasonsWithEpisodes = allSeasons.map((season) => ({
			...season,
			episodes: allEpisodes
				.filter((ep) => ep.seasonNumber === season.seasonNumber)
				.map((ep) => {
					const epSubtitles = subtitlesByEpisode.get(ep.id) || [];
					return {
						...ep,
						file: episodeIdToFile.get(ep.id) ?? null,
						subtitles: epSubtitles.map((s) => ({
							id: s.id,
							language: s.language,
							isForced: s.isForced,
							isHearingImpaired: s.isHearingImpaired,
							format: s.format,
							matchScore: s.matchScore,
							providerId: s.providerId,
							dateAdded: s.dateAdded,
							wasSynced: s.wasSynced,
							syncOffset: s.syncOffset
						})),
						subtitleCount: epSubtitles.length,
						subtitleLanguages: [...new Set(epSubtitles.map((s) => s.language))]
					};
				})
		}));

		// Get overall series subtitle status (episodes missing subtitles)
		const profileService = getLanguageProfileService();
		const episodesMissingSubs = await profileService.getSeriesEpisodesMissingSubtitles(params.id);

		return json({
			success: true,
			series: {
				...seriesItem,
				percentComplete:
					seriesItem.episodeCount && seriesItem.episodeCount > 0
						? Math.round(((seriesItem.episodeFileCount || 0) / seriesItem.episodeCount) * 100)
						: 0,
				seasons: seasonsWithEpisodes,
				subtitleStatus: {
					episodesMissingSubtitles: episodesMissingSubs.length,
					totalSubtitles: allSubtitles.length,
					languages: [...new Set(allSubtitles.map((s) => s.language))]
				}
			}
		});
	} catch (error) {
		logger.error('[API] Error fetching series', error instanceof Error ? error : undefined);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to fetch series'
			},
			{ status: 500 }
		);
	}
};

/**
 * PATCH /api/library/series/[id]
 * Update series settings
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
	try {
		const body = await request.json();
		const {
			monitored,
			scoringProfileId,
			seasonFolder,
			seriesType,
			rootFolderId,
			moveFilesOnRootChange,
			wantsSubtitles,
			languageProfileId
		} = body;

		// Get current series state BEFORE update to detect monitoring changes
		const [currentSeries] = await db
			.select({
				tmdbId: series.tmdbId,
				title: series.title,
				seriesType: series.seriesType,
				path: series.path,
				episodeFileCount: series.episodeFileCount,
				rootFolderId: series.rootFolderId,
				monitored: series.monitored,
				wantsSubtitles: series.wantsSubtitles,
				languageProfileId: series.languageProfileId
			})
			.from(series)
			.where(eq(series.id, params.id));

		const wasUnmonitored = currentSeries ? !currentSeries.monitored : false;

		const updateData: Record<string, unknown> = {};
		let moveRequest:
			| {
					mediaId: string;
					mediaTitle: string;
					relativePath: string;
					sourceRootFolderId: string;
					destinationRootFolderId: string;
			  }
			| undefined;

		if (typeof monitored === 'boolean') {
			updateData.monitored = monitored;
		}
		if (scoringProfileId !== undefined) {
			updateData.scoringProfileId = scoringProfileId;
		}
		if (typeof seasonFolder === 'boolean') {
			updateData.seasonFolder = seasonFolder;
		}
		if (seriesType === 'standard' || seriesType === 'anime' || seriesType === 'daily') {
			updateData.seriesType = seriesType;
		}
		if (rootFolderId !== undefined) {
			const nextRootFolderId = typeof rootFolderId === 'string' ? rootFolderId.trim() : '';
			const currentRootFolderId = currentSeries?.rootFolderId ?? null;
			if (!nextRootFolderId) {
				return json(
					{
						success: false,
						error: 'Root folder is required and cannot be unset after adding media.'
					},
					{ status: 400 }
				);
			}

			// Only validate/apply when reassignment is requested.
			if (nextRootFolderId !== currentRootFolderId) {
				const hasExistingFiles = (currentSeries?.episodeFileCount ?? 0) > 0;
				const canMoveFromCurrentRoot = Boolean(currentRootFolderId);
				if (hasExistingFiles && canMoveFromCurrentRoot && moveFilesOnRootChange !== true) {
					return json(
						{
							success: false,
							error:
								'This series already has files. Enable "Move existing files to new root folder" to change its root folder.'
						},
						{ status: 400 }
					);
				}

				const enforceAnimeSubtype = await getAnimeSubtypeEnforcement();
				let isAnimeMedia = false;
				if (enforceAnimeSubtype && currentSeries) {
					const tvDetails = await tmdb.getTVShow(currentSeries.tmdbId);
					isAnimeMedia = isLikelyAnimeMedia({
						genres: tvDetails.genres,
						originalLanguage: tvDetails.original_language,
						originCountries: tvDetails.origin_country,
						productionCountries: tvDetails.production_countries,
						title: tvDetails.name,
						originalTitle: tvDetails.original_name
					});
				}

				await validateRootFolder(nextRootFolderId, 'tv', {
					enforceAnimeSubtype,
					isAnimeMedia,
					mediaTitle: currentSeries?.title
				});

				const shouldMoveFiles =
					moveFilesOnRootChange === true &&
					hasExistingFiles &&
					Boolean(currentSeries?.path) &&
					canMoveFromCurrentRoot;
				if (shouldMoveFiles && currentRootFolderId && currentSeries?.path) {
					moveRequest = {
						mediaId: params.id,
						mediaTitle: currentSeries.title,
						relativePath: currentSeries.path,
						sourceRootFolderId: currentRootFolderId,
						destinationRootFolderId: nextRootFolderId
					};
				} else {
					// Recovery path: if files exist but current root folder is missing, re-link directly.
					const owningLibrary = await getLibraryEntityService().resolveOwningLibraryForRootFolder(
						nextRootFolderId,
						'tv'
					);
					updateData.rootFolderId = nextRootFolderId;
					updateData.libraryId = owningLibrary.id;
				}
			}
		}
		if (typeof wantsSubtitles === 'boolean') {
			updateData.wantsSubtitles = wantsSubtitles;
		}
		if (languageProfileId !== undefined) {
			updateData.languageProfileId = languageProfileId;
		}

		if (Object.keys(updateData).length === 0 && !moveRequest) {
			return json({ success: false, error: 'No valid fields to update' }, { status: 400 });
		}

		if (Object.keys(updateData).length > 0) {
			await db.update(series).set(updateData).where(eq(series.id, params.id));
		}

		let moveTask:
			| {
					taskId: string;
					historyId: string;
			  }
			| undefined;
		if (moveRequest) {
			moveTask = await mediaMoveService.enqueueMove({
				mediaType: 'series',
				mediaId: moveRequest.mediaId,
				mediaTitle: moveRequest.mediaTitle,
				relativePath: moveRequest.relativePath,
				sourceRootFolderId: moveRequest.sourceRootFolderId,
				destinationRootFolderId: moveRequest.destinationRootFolderId
			});
		}

		// If monitoring was just enabled, check if we should trigger a search
		if (wasUnmonitored && monitored === true) {
			const settings = await monitoringScheduler.getSettings();

			if (settings.searchOnMonitorEnabled) {
				// Fire and forget - don't block the response
				searchOnAdd.searchForMissingEpisodes(params.id).catch((err) => {
					logger.error(
						{
							seriesId: params.id,
							error: err instanceof Error ? err.message : 'Unknown error'
						},
						'[API] Background search on monitor enable failed'
					);
				});

				logger.info(
					{
						seriesId: params.id
					},
					'[API] Triggered search on monitor enable for series'
				);
			}
		}

		// Check if subtitle monitoring was just enabled
		if (currentSeries) {
			const wasSubtitlesEnabled =
				currentSeries.wantsSubtitles === true && currentSeries.languageProfileId;
			const newWantsSubtitles = wantsSubtitles ?? currentSeries.wantsSubtitles;
			const newProfileId = languageProfileId ?? currentSeries.languageProfileId;
			const isNowSubtitlesEnabled = newWantsSubtitles === true && newProfileId;

			// Trigger subtitle search for all episodes with files if just enabled
			if (!wasSubtitlesEnabled && isNowSubtitlesEnabled) {
				const settings = await monitoringScheduler.getSettings();

				if (settings.subtitleSearchOnImportEnabled) {
					// Get all episodes with files
					const episodesWithFiles = await db
						.select({ id: episodes.id })
						.from(episodes)
						.where(and(eq(episodes.seriesId, params.id), eq(episodes.hasFile, true)));

					if (episodesWithFiles.length > 0) {
						logger.info(
							{
								seriesId: params.id,
								episodeCount: episodesWithFiles.length
							},
							'[API] Subtitle monitoring enabled for series, triggering search'
						);

						// Fire-and-forget: batch search all episodes
						const items = episodesWithFiles.map((ep) => ({
							mediaType: 'episode' as const,
							mediaId: ep.id
						}));

						searchSubtitlesForMediaBatch(items).catch((err) => {
							logger.warn(
								{
									seriesId: params.id,
									error: err instanceof Error ? err.message : String(err)
								},
								'[API] Background subtitle batch search failed'
							);
						});
					}
				}
			}
		}

		libraryMediaEvents.emitSeriesUpdated(params.id);

		return json({
			success: true,
			moveQueued: Boolean(moveTask),
			moveTaskId: moveTask?.taskId,
			moveTaskHistoryId: moveTask?.historyId
		});
	} catch (error) {
		logger.error('[API] Error updating series', error instanceof Error ? error : undefined);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to update series'
			},
			{ status: 500 }
		);
	}
};

// Alias PUT to PATCH for convenience
export const PUT: RequestHandler = PATCH;

/**
 * DELETE /api/library/series/[id]
 * Delete files for a series (keeps metadata, marks episodes as missing)
 * With removeFromLibrary=true, removes the series entirely from the database
 */
export const DELETE: RequestHandler = async ({ params, url }) => {
	try {
		const deleteFiles = url.searchParams.get('deleteFiles') === 'true';
		const removeFromLibrary = url.searchParams.get('removeFromLibrary') === 'true';

		// Get series with root folder info
		const [seriesItem] = await db
			.select({
				id: series.id,
				path: series.path,
				rootFolderPath: rootFolders.path,
				rootFolderReadOnly: rootFolders.readOnly
			})
			.from(series)
			.leftJoin(rootFolders, eq(series.rootFolderId, rootFolders.id))
			.where(eq(series.id, params.id));

		if (!seriesItem) {
			return json({ success: false, error: 'Series not found' }, { status: 404 });
		}

		// Get all episode files for this series
		const files = await db.select().from(episodeFiles).where(eq(episodeFiles.seriesId, params.id));

		// Only require files if not removing from library entirely
		if (files.length === 0 && !removeFromLibrary) {
			return json({ success: false, error: 'Series has no files to delete' }, { status: 400 });
		}

		// Block file deletion from read-only folders
		if (deleteFiles && seriesItem.rootFolderReadOnly) {
			return json(
				{ success: false, error: 'Cannot delete files from read-only folder' },
				{ status: 400 }
			);
		}

		// Delete files from disk if requested
		if (deleteFiles && seriesItem.rootFolderPath && seriesItem.path) {
			const seriesFolder = await deleteDirectoryWithinRoot(
				seriesItem.rootFolderPath,
				seriesItem.path
			);
			logger.debug({ seriesFolder }, '[API] Removed series folder and all contents');
		}

		// Delete all episode file records from database
		if (files.length > 0) {
			await db.delete(episodeFiles).where(eq(episodeFiles.seriesId, params.id));
		}

		if (removeFromLibrary) {
			// Cancel active downloads from client before removing
			const activeQueueItems = await db
				.select()
				.from(downloadQueue)
				.where(eq(downloadQueue.seriesId, params.id));

			for (const queueItem of activeQueueItems) {
				if (queueItem.downloadClientId) {
					try {
						const isTorrent = queueItem.protocol === 'torrent';
						const clientDownloadId = isTorrent
							? queueItem.infoHash || queueItem.downloadId
							: queueItem.downloadId || queueItem.infoHash;
						if (clientDownloadId) {
							const clientInstance = await getDownloadClientManager().getClientInstance(
								queueItem.downloadClientId
							);
							if (clientInstance) {
								await clientInstance.removeDownload(clientDownloadId, true);
							}
						}
					} catch (err) {
						logger.warn(
							{
								queueItemId: queueItem.id,
								error: err instanceof Error ? err.message : 'Unknown'
							},
							'[API] Failed to remove download from client'
						);
					}
				}
				// Delete queue record
				await db.delete(downloadQueue).where(eq(downloadQueue.id, queueItem.id));
			}

			// Preserve activity audit trail after media row is deleted (FKs become null on delete)
			await db
				.update(downloadHistory)
				.set({ status: 'removed', statusReason: null })
				.where(eq(downloadHistory.seriesId, params.id));

			// Delete alternate titles (not cascaded automatically)
			await deleteAllAlternateTitles('series', params.id);

			// Delete the series from database - CASCADE will handle:
			// - seasons, episodes, subtitles, downloadQueue, pendingReleases, blocklist, etc.
			await db.delete(series).where(eq(series.id, params.id));
			libraryMediaEvents.emitSeriesUpdated(params.id);

			logger.info({ seriesId: params.id }, '[API] Removed series from library');
			return json({ success: true, removed: true });
		} else {
			// Update all episodes in this series to hasFile=false
			await db
				.update(episodes)
				.set({ hasFile: false, lastSearchTime: null })
				.where(eq(episodes.seriesId, params.id));

			// Update all seasons' episode file count to 0
			await db.update(seasons).set({ episodeFileCount: 0 }).where(eq(seasons.seriesId, params.id));

			// Update series episode file count
			await db.update(series).set({ episodeFileCount: 0 }).where(eq(series.id, params.id));
			libraryMediaEvents.emitSeriesUpdated(params.id);

			// Note: Series, season, and episode metadata is kept - episodes will show as "missing"
			return json({ success: true });
		}
	} catch (error) {
		logger.error('[API] Error deleting series files', error instanceof Error ? error : undefined);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to delete series files'
			},
			{ status: 500 }
		);
	}
};
