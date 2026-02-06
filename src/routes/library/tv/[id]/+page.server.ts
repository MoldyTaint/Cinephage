import { db } from '$lib/server/db/index.js';
import {
	series,
	seasons,
	episodes,
	episodeFiles,
	rootFolders,
	scoringProfiles,
	profileSizeLimits,
	downloadQueue,
	subtitles
} from '$lib/server/db/schema.js';
import { eq, asc, inArray } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { DEFAULT_PROFILES } from '$lib/server/scoring/profiles.js';

export interface QualityProfileSummary {
	id: string;
	name: string;
	description: string;
	isBuiltIn: boolean;
	isDefault: boolean;
}

export interface SeasonWithEpisodes {
	id: string;
	seasonNumber: number;
	name: string | null;
	overview: string | null;
	posterPath: string | null;
	airDate: string | null;
	monitored: boolean | null;
	episodeCount: number | null;
	episodeFileCount: number | null;
	episodes: EpisodeWithFile[];
}

export interface SubtitleInfo {
	id: string;
	language: string;
	isForced?: boolean;
	isHearingImpaired?: boolean;
	format?: string;
}

export interface EpisodeWithFile {
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
}

export interface EpisodeFileInfo {
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

export interface QueueItemInfo {
	id: string;
	title: string;
	status: string;
	progress: number | null;
	episodeIds: string[] | null;
	seasonNumber: number | null;
}

export interface LibrarySeriesPageData {
	series: {
		id: string;
		tmdbId: number;
		tvdbId: number | null;
		imdbId: string | null;
		title: string;
		originalTitle: string | null;
		year: number | null;
		overview: string | null;
		posterPath: string | null;
		backdropPath: string | null;
		status: string | null;
		network: string | null;
		genres: string[] | null;
		path: string;
		rootFolderId: string | null;
		rootFolderPath: string | null;
		scoringProfileId: string | null;
		monitored: boolean | null;
		seasonFolder: boolean | null;
		wantsSubtitles: boolean | null;
		added: string;
		episodeCount: number | null;
		episodeFileCount: number | null;
		percentComplete: number;
	};
	seasons: SeasonWithEpisodes[];
	qualityProfiles: QualityProfileSummary[];
	rootFolders: Array<{
		id: string;
		name: string;
		path: string;
		mediaType: string;
		freeSpaceBytes: number | null;
	}>;
	queueItems: QueueItemInfo[];
}

export const load: PageServerLoad = async ({ params }): Promise<LibrarySeriesPageData> => {
	const { id } = params;

	// Fetch the series with root folder info
	const seriesResult = await db
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
		.where(eq(series.id, id));

	if (seriesResult.length === 0) {
		error(404, 'Series not found in library');
	}

	const seriesData = seriesResult[0];

	// Calculate percent complete
	const percentComplete =
		seriesData.episodeCount && seriesData.episodeCount > 0
			? Math.round(((seriesData.episodeFileCount || 0) / seriesData.episodeCount) * 100)
			: 0;

	// Fetch all seasons
	const allSeasons = await db
		.select()
		.from(seasons)
		.where(eq(seasons.seriesId, id))
		.orderBy(asc(seasons.seasonNumber));

	// Fetch all episodes
	const allEpisodes = await db
		.select()
		.from(episodes)
		.where(eq(episodes.seriesId, id))
		.orderBy(asc(episodes.seasonNumber), asc(episodes.episodeNumber));

	// Fetch all episode files
	const allFiles = await db.select().from(episodeFiles).where(eq(episodeFiles.seriesId, id));

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

	// Fetch subtitles for all episodes in this series
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

	// Fetch quality profiles from database
	const dbProfiles = await db
		.select({
			id: scoringProfiles.id,
			name: scoringProfiles.name,
			description: scoringProfiles.description,
			isDefault: scoringProfiles.isDefault
		})
		.from(scoringProfiles);

	const defaultBuiltInOverride = await db
		.select({ profileId: profileSizeLimits.profileId })
		.from(profileSizeLimits)
		.where(eq(profileSizeLimits.isDefault, true))
		.limit(1);

	// Built-in profile IDs - derived from DEFAULT_PROFILES
	const BUILT_IN_IDS = DEFAULT_PROFILES.map((p) => p.id);
	const dbIds = new Set(dbProfiles.map((p) => p.id));
	const customDefaultId = dbProfiles.find(
		(p) => !BUILT_IN_IDS.includes(p.id) && Boolean(p.isDefault)
	)?.id;
	const builtInDefaultId = defaultBuiltInOverride[0]?.profileId;
	const resolvedDefaultId = customDefaultId ?? builtInDefaultId ?? 'balanced';

	// Merge built-in profiles with database profiles (avoiding duplicates)
	const allQualityProfiles: QualityProfileSummary[] = [
		// Built-in profiles (only if not overridden in DB)
		...DEFAULT_PROFILES.filter((p) => !dbIds.has(p.id)).map((p) => ({
			id: p.id,
			name: p.name,
			description: p.description,
			isBuiltIn: true,
			isDefault: p.id === resolvedDefaultId
		})),
		// Database profiles (correctly mark built-ins stored in DB)
		...dbProfiles.map((p) => ({
			id: p.id,
			name: p.name,
			description: p.description ?? '',
			isBuiltIn: BUILT_IN_IDS.includes(p.id),
			isDefault: p.id === resolvedDefaultId
		}))
	];

	// Fetch TV root folders
	const folders = await db
		.select({
			id: rootFolders.id,
			name: rootFolders.name,
			path: rootFolders.path,
			mediaType: rootFolders.mediaType,
			freeSpaceBytes: rootFolders.freeSpaceBytes
		})
		.from(rootFolders)
		.where(eq(rootFolders.mediaType, 'tv'));

	// Fetch active queue items for this series
	const queueResults = await db
		.select({
			id: downloadQueue.id,
			title: downloadQueue.title,
			status: downloadQueue.status,
			progress: downloadQueue.progress,
			episodeIds: downloadQueue.episodeIds,
			seasonNumber: downloadQueue.seasonNumber
		})
		.from(downloadQueue)
		.where(eq(downloadQueue.seriesId, id));

	const queueItems: QueueItemInfo[] = queueResults.map((q) => ({
		id: q.id,
		title: q.title,
		status: q.status ?? 'queued',
		progress: q.progress ? parseFloat(q.progress) : null,
		episodeIds: q.episodeIds as string[] | null,
		seasonNumber: q.seasonNumber
	}));

	return {
		series: {
			...seriesData,
			added: seriesData.added ?? new Date().toISOString(),
			percentComplete
		},
		seasons: seasonsWithEpisodes,
		qualityProfiles: allQualityProfiles,
		rootFolders: folders,
		queueItems
	};
};
