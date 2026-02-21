import { createSSEStream } from '$lib/server/sse';
import { downloadMonitor } from '$lib/server/downloadClients/monitoring';
import { importService } from '$lib/server/downloadClients/import';
import { db } from '$lib/server/db';
import {
	series,
	seasons,
	episodes,
	episodeFiles,
	rootFolders,
	downloadQueue,
	subtitles
} from '$lib/server/db/schema';
import { eq, asc, inArray, and } from 'drizzle-orm';
import type { RequestHandler } from '@sveltejs/kit';
import { libraryMediaEvents } from '$lib/server/library/LibraryMediaEvents';

const ACTIVE_DOWNLOAD_STATUSES = [
	'queued',
	'downloading',
	'stalled',
	'paused',
	'completed',
	'postprocessing',
	'importing',
	'seeding',
	'seeding-imported'
] as const;

// Local type definitions
interface EpisodeFileInfo {
	id: string;
	relativePath: string;
	size: number | null;
	dateAdded: string | null;
	sceneName: string | null;
	releaseGroup: string | null;
	releaseType: string | null;
	quality: {
		resolution?: string;
		source?: string;
		codec?: string;
		hdr?: string;
	} | null;
	mediaInfo: {
		containerFormat?: string;
		videoCodec?: string;
		videoProfile?: string;
		videoBitrate?: number;
		videoBitDepth?: number;
		videoHdrFormat?: string;
		width?: number;
		height?: number;
		audioCodec?: string;
		audioChannels?: number;
		audioLanguages?: string[];
		subtitleLanguages?: string[];
	} | null;
	languages: string[] | null;
}

interface SubtitleInfo {
	id: string;
	language: string;
	isForced?: boolean;
	isHearingImpaired?: boolean;
	format?: string;
}

interface SeasonWithEpisodes {
	id: string;
	seasonNumber: number;
	name: string | null;
	overview: string | null;
	posterPath: string | null;
	airDate: string | null;
	monitored: boolean | null;
	episodeCount: number | null;
	episodeFileCount: number | null;
	episodes: Array<{
		id: string;
		tmdbId: number | null;
		tvdbId: number | null;
		seasonNumber: number;
		episodeNumber: number;
		absoluteEpisodeNumber: number | null;
		title: string | null;
		overview: string | null;
		airDate: string | null;
		runtime: number | null;
		monitored: boolean | null;
		hasFile: boolean | null;
		file: EpisodeFileInfo | null;
		subtitles?: SubtitleInfo[];
	}>;
}

interface QueueItem {
	id: string;
	title: string;
	status: string;
	progress?: string;
	episodeIds?: string[];
	seasonNumber?: number;
}

interface FileImportedEvent {
	mediaType: 'episode';
	seriesId: string;
	episodeIds: string[];
	seasonNumber: number;
	file: {
		id: string;
		relativePath: string;
		size: number;
		dateAdded: string;
		sceneName?: string;
		releaseGroup?: string;
		releaseType?: string;
		quality: EpisodeFileInfo['quality'];
		mediaInfo: EpisodeFileInfo['mediaInfo'];
		languages?: string[];
	};
	wasUpgrade: boolean;
	replacedFileIds?: string[];
}

interface FileDeletedEvent {
	mediaType: 'episode';
	seriesId: string;
	fileId: string;
	episodeIds: string[];
}

/**
 * Get series data with seasons and episodes for SSE initial state
 */
async function getSeriesData(seriesId: string) {
	const [seriesData] = await db
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
			monitored: series.monitored,
			seasonFolder: series.seasonFolder,
			wantsSubtitles: series.wantsSubtitles,
			added: series.added,
			episodeCount: series.episodeCount,
			episodeFileCount: series.episodeFileCount
		})
		.from(series)
		.leftJoin(rootFolders, eq(series.rootFolderId, rootFolders.id))
		.where(eq(series.id, seriesId));

	if (!seriesData) return null;

	const percentComplete =
		seriesData.episodeCount && seriesData.episodeCount > 0
			? Math.round(((seriesData.episodeFileCount || 0) / seriesData.episodeCount) * 100)
			: 0;

	// Fetch all seasons
	const allSeasons = await db
		.select()
		.from(seasons)
		.where(eq(seasons.seriesId, seriesId))
		.orderBy(asc(seasons.seasonNumber));

	// Fetch all episodes
	const allEpisodes = await db
		.select()
		.from(episodes)
		.where(eq(episodes.seriesId, seriesId))
		.orderBy(asc(episodes.seasonNumber), asc(episodes.episodeNumber));

	// Fetch all episode files
	const allFiles = await db.select().from(episodeFiles).where(eq(episodeFiles.seriesId, seriesId));

	// Create a map of episode ID to file
	const episodeIdToFile = new Map<string, EpisodeFileInfo>();
	for (const file of allFiles) {
		const episodeIds = file.episodeIds as string[] | null;
		if (episodeIds) {
			for (const epId of episodeIds) {
				episodeIdToFile.set(epId, {
					id: file.id,
					relativePath: file.relativePath,
					size: file.size,
					dateAdded: file.dateAdded,
					sceneName: file.sceneName,
					releaseGroup: file.releaseGroup,
					releaseType: file.releaseType,
					quality: file.quality as EpisodeFileInfo['quality'],
					mediaInfo: file.mediaInfo as EpisodeFileInfo['mediaInfo'],
					languages: file.languages as string[] | null
				});
			}
		}
	}

	// Fetch subtitles for all episodes
	const episodeIds = allEpisodes.map((ep) => ep.id);
	const allSubtitles =
		episodeIds.length > 0
			? await db
					.select({
						id: subtitles.id,
						episodeId: subtitles.episodeId,
						language: subtitles.language,
						isForced: subtitles.isForced,
						isHearingImpaired: subtitles.isHearingImpaired,
						format: subtitles.format
					})
					.from(subtitles)
					.where(inArray(subtitles.episodeId, episodeIds))
			: [];

	// Create a map of episode ID to subtitles
	const episodeIdToSubtitles = new Map<string, SubtitleInfo[]>();
	for (const sub of allSubtitles) {
		if (sub.episodeId) {
			const existing = episodeIdToSubtitles.get(sub.episodeId) || [];
			existing.push({
				id: sub.id,
				language: sub.language,
				isForced: sub.isForced ?? undefined,
				isHearingImpaired: sub.isHearingImpaired ?? undefined,
				format: sub.format ?? undefined
			});
			episodeIdToSubtitles.set(sub.episodeId, existing);
		}
	}

	// Build seasons with episodes
	const seasonsWithEpisodes: SeasonWithEpisodes[] = allSeasons.map((season) => {
		const seasonEpisodes = allEpisodes
			.filter((ep) => ep.seasonNumber === season.seasonNumber)
			.map((ep) => ({
				id: ep.id,
				tmdbId: ep.tmdbId,
				tvdbId: ep.tvdbId,
				seasonNumber: ep.seasonNumber,
				episodeNumber: ep.episodeNumber,
				absoluteEpisodeNumber: ep.absoluteEpisodeNumber,
				title: ep.title,
				overview: ep.overview,
				airDate: ep.airDate,
				runtime: ep.runtime,
				monitored: ep.monitored,
				hasFile: ep.hasFile,
				file: episodeIdToFile.get(ep.id) || null,
				subtitles: episodeIdToSubtitles.get(ep.id) || []
			}));

		return {
			id: season.id,
			seasonNumber: season.seasonNumber,
			name: season.name,
			overview: season.overview,
			posterPath: season.posterPath,
			airDate: season.airDate,
			monitored: season.monitored,
			episodeCount: season.episodeCount,
			episodeFileCount: season.episodeFileCount,
			episodes: seasonEpisodes
		};
	});

	return {
		series: {
			...seriesData,
			added: seriesData.added ?? new Date().toISOString(),
			percentComplete
		},
		seasons: seasonsWithEpisodes
	};
}

/**
 * Get active queue items for series
 */
async function getQueueItems(seriesId: string): Promise<QueueItem[]> {
	const results = await db
		.select({
			id: downloadQueue.id,
			title: downloadQueue.title,
			status: downloadQueue.status,
			progress: downloadQueue.progress,
			episodeIds: downloadQueue.episodeIds,
			seasonNumber: downloadQueue.seasonNumber
		})
		.from(downloadQueue)
		.where(
			and(
				eq(downloadQueue.seriesId, seriesId),
				inArray(downloadQueue.status, [...ACTIVE_DOWNLOAD_STATUSES])
			)
		);

	return results.map((q) => ({
		id: q.id,
		title: q.title,
		status: q.status ?? 'queued',
		progress: q.progress ?? undefined,
		episodeIds: q.episodeIds as string[] | undefined,
		seasonNumber: q.seasonNumber ?? undefined
	}));
}

/**
 * Server-Sent Events endpoint for real-time series detail updates
 *
 * Events emitted:
 * - media:initial - Full series state on connect
 * - queue:updated - Queue item progress/status change
 * - file:added - New episode file imported
 * - file:removed - Episode file deleted
 * - episode:updated - Episode metadata changes
 */
export const GET: RequestHandler = async ({ params }) => {
	const seriesId = params.id;

	if (!seriesId) {
		return new Response('Series ID is required', { status: 400 });
	}

	return createSSEStream((send) => {
		// Send initial state
		const sendInitialState = async () => {
			try {
				const [data, queueItems] = await Promise.all([
					getSeriesData(seriesId),
					getQueueItems(seriesId)
				]);

				if (data) {
					send('media:initial', { ...data, queueItems });
				}
			} catch {
				// Error fetching initial state
			}
		};

		// Send initial state immediately
		sendInitialState();

		// Handle queue updates for this series
		const onQueueUpdated = (item: unknown) => {
			const typedItem = item as QueueItem & { seriesId?: string };
			if (typedItem.seriesId === seriesId) {
				send('queue:updated', {
					id: typedItem.id,
					title: typedItem.title,
					status: typedItem.status,
					progress: typedItem.progress ? parseFloat(typedItem.progress) : null,
					episodeIds: typedItem.episodeIds,
					seasonNumber: typedItem.seasonNumber
				});
			}
		};

		// Handle file imports for this series
		const onFileImported = (data: unknown) => {
			const typedData = data as FileImportedEvent;
			if (typedData.mediaType === 'episode' && typedData.seriesId === seriesId) {
				send('file:added', {
					file: typedData.file,
					episodeIds: typedData.episodeIds,
					seasonNumber: typedData.seasonNumber,
					wasUpgrade: typedData.wasUpgrade,
					replacedFileIds: typedData.replacedFileIds
				});

				// If files were replaced, send deletion events
				if (typedData.replacedFileIds) {
					for (const replacedId of typedData.replacedFileIds) {
						send('file:removed', { fileId: replacedId });
					}
				}
			}
		};

		// Handle file deletions for this series
		const onFileDeleted = (data: unknown) => {
			const typedData = data as FileDeletedEvent;
			if (typedData.mediaType === 'episode' && typedData.seriesId === seriesId) {
				send('file:removed', {
					fileId: typedData.fileId,
					episodeIds: typedData.episodeIds
				});
			}
		};

		// Handle metadata/subtitle/settings updates for this series
		const onSeriesUpdated = (event: { seriesId: string }) => {
			if (event.seriesId === seriesId) {
				sendInitialState();
			}
		};

		// Register handlers
		downloadMonitor.on('queue:updated', onQueueUpdated);
		importService.on('file:imported', onFileImported);
		importService.on('file:deleted', onFileDeleted);
		libraryMediaEvents.onSeriesUpdated(onSeriesUpdated);

		// Return cleanup function
		return () => {
			downloadMonitor.off('queue:updated', onQueueUpdated);
			importService.off('file:imported', onFileImported);
			importService.off('file:deleted', onFileDeleted);
			libraryMediaEvents.offSeriesUpdated(onSeriesUpdated);
		};
	});
};
