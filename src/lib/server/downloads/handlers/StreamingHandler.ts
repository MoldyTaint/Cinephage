import { strmService, StrmService, getStreamingBaseUrl } from '$lib/server/streaming/index.js';
import { getRecoverableApiKeyByType } from '$lib/server/auth/index.js';
import { ReleaseParser } from '$lib/server/indexers/parser/ReleaseParser.js';
import { mediaInfoService } from '$lib/server/library/media-info.js';
import { getLibraryRelativePath } from '$lib/server/library/media-paths.js';
import { monitoringScheduler } from '$lib/server/monitoring/MonitoringScheduler.js';
import { searchSubtitlesForNewMedia } from '$lib/server/subtitles/services/SubtitleImportService.js';
import { fileExists, importService } from '$lib/server/downloadClients/import/index.js';
import { eventBuffer } from '$lib/server/sse/EventBuffer.js';
import { libraryMediaEvents } from '$lib/server/library/LibraryMediaEvents.js';
import { createChildLogger } from '$lib/logging/index.js';
import { db } from '$lib/server/db/index.js';
import {
	movies,
	movieFiles,
	series,
	episodes,
	episodeFiles,
	downloadHistory
} from '$lib/server/db/schema.js';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { statSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { GrabRequest, ResolvedContext, HandlerResult } from '../grab-types.js';

const logger = createChildLogger({ module: 'StreamingHandler' });
const parser = new ReleaseParser();

type EpisodeFileUpsertInput = Omit<typeof episodeFiles.$inferInsert, 'id'> & { id?: string };

async function upsertEpisodeFileByPath(record: EpisodeFileUpsertInput): Promise<string> {
	const { id: requestedId, ...values } = record;

	const existing = await db
		.select({ id: episodeFiles.id })
		.from(episodeFiles)
		.where(
			and(
				eq(episodeFiles.seriesId, record.seriesId),
				eq(episodeFiles.relativePath, record.relativePath)
			)
		)
		.limit(1);

	if (existing.length > 0) {
		await db.update(episodeFiles).set(values).where(eq(episodeFiles.id, existing[0].id));
		return existing[0].id;
	}

	const id = requestedId ?? randomUUID();
	await db.insert(episodeFiles).values({ id, ...values });
	return id;
}

export class StreamingHandler {
	private streamingKeyCache: { available: boolean; checkedAt: number } | null = null;
	private streamingKeyWarned = false;
	private static readonly STREAMING_KEY_CACHE_TTL_MS = 60_000;

	private async isStreamingKeyAvailable(): Promise<boolean> {
		const now = Date.now();
		if (
			this.streamingKeyCache &&
			now - this.streamingKeyCache.checkedAt < StreamingHandler.STREAMING_KEY_CACHE_TTL_MS
		) {
			return this.streamingKeyCache.available;
		}

		try {
			const key = await getRecoverableApiKeyByType('streaming');
			const available = !!key;
			this.streamingKeyCache = { available, checkedAt: now };
			if (available) {
				this.streamingKeyWarned = false;
			}
			return available;
		} catch {
			this.streamingKeyCache = { available: false, checkedAt: now };
			return false;
		}
	}

	async handle(request: GrabRequest, resolved: ResolvedContext): Promise<HandlerResult> {
		const { release } = request;
		const { movieId, seriesId, seasonNumber, mediaType } = resolved;

		if (!(await this.isStreamingKeyAvailable())) {
			if (!this.streamingKeyWarned) {
				logger.warn(
					'Streaming API key not configured - skipping streaming releases. Generate API keys in Settings > System.'
				);
				this.streamingKeyWarned = true;
			}
			return {
				success: false,
				error: 'Streaming API key not configured. Generate API keys in Settings > System.'
			};
		}

		const parsed = StrmService.parseStreamUrl(release.downloadUrl ?? '');
		if (!parsed) {
			return { success: false, error: `Invalid streaming URL: ${release.downloadUrl}` };
		}

		const baseUrl = await getStreamingBaseUrl('http://localhost:5173');

		if (parsed.isSeasonPack && mediaType === 'tv' && seriesId && parsed.season !== undefined) {
			return this.handleSeasonPack(request, resolved, parsed, baseUrl);
		}

		const result = await strmService.createStrmFile({
			mediaType,
			tmdbId: parsed.tmdbId,
			movieId,
			seriesId,
			season: parsed.season ?? seasonNumber,
			episode: parsed.episode,
			baseUrl
		});

		if (!result.success || !result.filePath) {
			return { success: false, error: result.error };
		}

		return this.importStreamingFile(request, resolved, parsed, result.filePath);
	}

	private async importStreamingFile(
		request: GrabRequest,
		resolved: ResolvedContext,
		parsedStream: NonNullable<ReturnType<typeof StrmService.parseStreamUrl>>,
		filePath: string
	): Promise<HandlerResult> {
		const { release, options } = request;
		const { movieId, seriesId, mediaType } = resolved;
		const isUpgrade = options.isUpgrade;

		try {
			const stats = statSync(filePath);
			const fileSize = Number(stats.size);
			let allowStrmProbe = true;
			if (mediaType === 'movie' && movieId) {
				const movie = await db.query.movies.findFirst({ where: eq(movies.id, movieId) });
				allowStrmProbe = movie?.scoringProfileId !== 'streamer';
			} else if (mediaType === 'tv' && seriesId) {
				const show = await db.query.series.findFirst({ where: eq(series.id, seriesId) });
				allowStrmProbe = show?.scoringProfileId !== 'streamer';
			}
			const mediaInfo = await mediaInfoService.extractMediaInfo(filePath, { allowStrmProbe });

			const parsedRelease = parser.parse(release.title);
			const quality = {
				resolution: parsedRelease.resolution ?? '1080p',
				source: 'Streaming',
				codec: 'HLS',
				hdr: undefined
			};

			if (mediaType === 'movie' && movieId) {
				return this.importStreamingMovie(release, {
					movieId,
					filePath,
					fileSize,
					mediaInfo,
					quality,
					parsedRelease,
					isUpgrade
				});
			} else if (
				mediaType === 'tv' &&
				seriesId &&
				parsedStream.season !== undefined &&
				parsedStream.episode !== undefined
			) {
				return this.importStreamingEpisode(release, {
					seriesId,
					season: parsedStream.season,
					episode: parsedStream.episode,
					filePath,
					fileSize,
					mediaInfo,
					quality,
					parsedRelease,
					isUpgrade
				});
			}

			return { success: false, error: 'Invalid media type or missing required IDs' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return { success: false, error: `Database error: ${message}` };
		}
	}

	private async importStreamingMovie(
		release: GrabRequest['release'],
		options: {
			movieId: string;
			filePath: string;
			fileSize: number;
			mediaInfo: Awaited<ReturnType<typeof mediaInfoService.extractMediaInfo>>;
			quality: { resolution: string; source: string; codec: string; hdr: undefined };
			parsedRelease: ReturnType<typeof parser.parse>;
			isUpgrade?: boolean;
		}
	): Promise<HandlerResult> {
		const { movieId, filePath, fileSize, mediaInfo, quality, parsedRelease, isUpgrade } = options;

		const movie = await db.query.movies.findFirst({
			where: eq(movies.id, movieId),
			with: { rootFolder: true }
		});

		if (!movie || !movie.rootFolder) {
			return { success: false, error: 'Movie or root folder not found' };
		}

		const relativePath = getLibraryRelativePath(movie.rootFolder.path, movie.path, filePath);

		if (isUpgrade) {
			await this.deleteExistingMovieFiles(movieId, movie.rootFolder.path, movie.path);
		}

		const fileId = randomUUID();
		await db.insert(movieFiles).values({
			id: fileId,
			movieId,
			relativePath,
			size: fileSize,
			dateAdded: new Date().toISOString(),
			sceneName: release.title,
			releaseGroup: parsedRelease.releaseGroup ?? 'Streaming',
			edition: parsedRelease.edition ?? undefined,
			quality,
			mediaInfo
		});

		await db.update(movies).set({ hasFile: true }).where(eq(movies.id, movieId));

		await db.insert(downloadHistory).values({
			title: release.title,
			indexerId: release.indexerId,
			indexerName: release.indexerName,
			protocol: 'streaming',
			movieId,
			status: 'streaming',
			size: fileSize,
			quality,
			importedPath: filePath,
			movieFileId: fileId,
			grabbedAt: new Date().toISOString(),
			importedAt: new Date().toISOString()
		});

		libraryMediaEvents.emitMovieUpdated(movieId);

		const movieEvent = {
			mediaType: 'movie' as const,
			movieId,
			file: {
				id: fileId,
				relativePath,
				size: fileSize,
				dateAdded: new Date().toISOString(),
				sceneName: release.title,
				releaseGroup: parsedRelease.releaseGroup ?? 'Streaming',
				quality,
				mediaInfo
			},
			wasUpgrade: isUpgrade ?? false,
			timestamp: Date.now()
		};
		importService.emit('file:imported', movieEvent);
		eventBuffer.add(movieEvent);

		void this.triggerSubtitleSearch('movie', movieId);

		return {
			success: true,
			queueId: fileId,
			clientId: 'streaming',
			clientName: 'Streaming',
			category: 'movies'
		};
	}

	private async importStreamingEpisode(
		release: GrabRequest['release'],
		options: {
			seriesId: string;
			season: number;
			episode: number;
			filePath: string;
			fileSize: number;
			mediaInfo: Awaited<ReturnType<typeof mediaInfoService.extractMediaInfo>>;
			quality: { resolution: string; source: string; codec: string; hdr: undefined };
			parsedRelease: ReturnType<typeof parser.parse>;
			isUpgrade?: boolean;
		}
	): Promise<HandlerResult> {
		const {
			seriesId,
			season,
			episode,
			filePath,
			fileSize,
			mediaInfo,
			quality,
			parsedRelease,
			isUpgrade
		} = options;

		const show = await db.query.series.findFirst({
			where: eq(series.id, seriesId),
			with: { rootFolder: true }
		});

		if (!show || !show.rootFolder) {
			return { success: false, error: 'Series or root folder not found' };
		}

		const episodeRow = await db.query.episodes.findFirst({
			where: and(
				eq(episodes.seriesId, seriesId),
				eq(episodes.seasonNumber, season),
				eq(episodes.episodeNumber, episode)
			)
		});

		if (!episodeRow) {
			return { success: false, error: `Episode S${season}E${episode} not found` };
		}

		const relativePath = getLibraryRelativePath(show.rootFolder.path, show.path, filePath);

		if (isUpgrade) {
			await this.deleteExistingEpisodeFiles(
				seriesId,
				episodeRow.id,
				show.rootFolder.path,
				show.path
			);
		}

		const fileId = await upsertEpisodeFileByPath({
			seriesId,
			seasonNumber: season,
			episodeIds: [episodeRow.id],
			relativePath,
			size: fileSize,
			dateAdded: new Date().toISOString(),
			sceneName: release.title,
			releaseGroup: parsedRelease.releaseGroup ?? 'Streaming',
			edition: parsedRelease.edition ?? undefined,
			quality,
			mediaInfo
		});

		await db.update(episodes).set({ hasFile: true }).where(eq(episodes.id, episodeRow.id));

		await db.insert(downloadHistory).values({
			title: release.title,
			indexerId: release.indexerId,
			indexerName: release.indexerName,
			protocol: 'streaming',
			seriesId,
			episodeIds: [episodeRow.id],
			seasonNumber: season,
			status: 'streaming',
			size: fileSize,
			quality,
			importedPath: filePath,
			episodeFileIds: [fileId],
			grabbedAt: new Date().toISOString(),
			importedAt: new Date().toISOString()
		});

		libraryMediaEvents.emitSeriesUpdated(seriesId);

		const episodeEvent = {
			mediaType: 'episode' as const,
			seriesId,
			episodeIds: [episodeRow.id],
			seasonNumber: season,
			file: {
				id: fileId,
				relativePath,
				size: fileSize,
				dateAdded: new Date().toISOString(),
				sceneName: release.title,
				releaseGroup: parsedRelease.releaseGroup ?? 'Streaming',
				quality,
				mediaInfo
			},
			wasUpgrade: isUpgrade ?? false,
			timestamp: Date.now()
		};
		importService.emit('file:imported', episodeEvent);
		eventBuffer.add(episodeEvent);

		void this.triggerSubtitleSearch('episode', episodeRow.id);

		return {
			success: true,
			queueId: fileId,
			clientId: 'streaming',
			clientName: 'Streaming',
			category: 'tv'
		};
	}

	private async handleSeasonPack(
		request: GrabRequest,
		resolved: ResolvedContext,
		parsedStream: NonNullable<ReturnType<typeof StrmService.parseStreamUrl>>,
		baseUrl: string
	): Promise<HandlerResult> {
		const { release, options } = request;
		const { seriesId } = resolved;
		const seasonNumber = parsedStream.season!;
		const isUpgrade = options.isUpgrade;

		if (!seriesId) {
			return { success: false, error: 'seriesId is required for season pack' };
		}

		const show = await db.query.series.findFirst({
			where: eq(series.id, seriesId),
			with: { rootFolder: true }
		});

		if (!show || !show.rootFolder) {
			return { success: false, error: 'Series or root folder not found' };
		}
		const allowStrmProbe = show.scoringProfileId !== 'streamer';

		const seasonEpisodes = await db.query.episodes.findMany({
			where: and(eq(episodes.seriesId, seriesId), eq(episodes.seasonNumber, seasonNumber))
		});
		const episodesNeedingFiles = isUpgrade
			? seasonEpisodes
			: seasonEpisodes.filter((ep) => !ep.hasFile);

		if (episodesNeedingFiles.length === 0) {
			return {
				success: true,
				queueId: 'streaming',
				clientId: 'streaming',
				clientName: 'Streaming',
				category: 'tv'
			};
		}

		const strmResult = await strmService.createSeasonStrmFiles({
			seriesId,
			seasonNumber,
			tmdbId: parsedStream.tmdbId,
			baseUrl,
			episodeIds: episodesNeedingFiles.map((ep) => ep.id)
		});

		if (!strmResult.success || strmResult.results.length === 0) {
			return { success: false, error: strmResult.error || 'Failed to create .strm files' };
		}

		const parsedRelease = parser.parse(release.title);
		const quality = {
			resolution: parsedRelease.resolution ?? '1080p',
			source: 'Streaming',
			codec: 'HLS',
			hdr: undefined
		};

		const episodeFileData: Array<{
			episodeId: string;
			episodeNumber: number;
			filePath: string;
			fileSize: number;
			relativePath: string;
			mediaInfo: Awaited<ReturnType<typeof mediaInfoService.extractMediaInfo>>;
		}> = [];

		for (const epResult of strmResult.results) {
			if (!epResult.filePath) continue;

			try {
				const stats = statSync(epResult.filePath);
				const mediaInfo = await mediaInfoService.extractMediaInfo(epResult.filePath, {
					allowStrmProbe
				});
				const relativePath = getLibraryRelativePath(
					show.rootFolder!.path,
					show.path,
					epResult.filePath
				);

				episodeFileData.push({
					episodeId: epResult.episodeId,
					episodeNumber: epResult.episodeNumber,
					filePath: epResult.filePath,
					fileSize: Number(stats.size),
					relativePath,
					mediaInfo
				});
			} catch (error) {
				logger.error(
					{
						episodeId: epResult.episodeId,
						err: error
					},
					'Failed to get file info for episode'
				);
			}
		}

		if (episodeFileData.length === 0) {
			return { success: false, error: 'Failed to get file info for any episodes' };
		}

		const createdEpisodeIds: string[] = [];
		const createdFileIds: string[] = [];
		let totalSize = 0;

		try {
			for (const epData of episodeFileData) {
				const existingFile = await db.query.episodeFiles.findFirst({
					where: eq(episodeFiles.relativePath, epData.relativePath)
				});

				if (existingFile && !isUpgrade) {
					createdFileIds.push(existingFile.id);
					createdEpisodeIds.push(epData.episodeId);
					totalSize += epData.fileSize;
					continue;
				}

				if (isUpgrade) {
					const allSeriesFiles = await db.query.episodeFiles.findMany({
						where: eq(episodeFiles.seriesId, seriesId)
					});
					const existingFiles = allSeriesFiles.filter((f) =>
						f.episodeIds?.includes(epData.episodeId)
					);
					for (const oldFile of existingFiles) {
						const oldFilePath = join(show.rootFolder!.path, show.path, oldFile.relativePath);
						try {
							if (await fileExists(oldFilePath)) {
								await unlink(oldFilePath);
							}
						} catch {
							// non-critical
						}
						await db.delete(episodeFiles).where(eq(episodeFiles.id, oldFile.id));
					}
				}

				const fileId = await upsertEpisodeFileByPath({
					seriesId,
					seasonNumber,
					episodeIds: [epData.episodeId],
					relativePath: epData.relativePath,
					size: epData.fileSize,
					dateAdded: new Date().toISOString(),
					sceneName: release.title,
					releaseGroup: parsedRelease.releaseGroup ?? 'Streaming',
					quality,
					mediaInfo: epData.mediaInfo
				});

				await db.update(episodes).set({ hasFile: true }).where(eq(episodes.id, epData.episodeId));

				createdEpisodeIds.push(epData.episodeId);
				createdFileIds.push(fileId);
				totalSize += epData.fileSize;
			}

			if (createdFileIds.length > 0) {
				await db.insert(downloadHistory).values({
					title: release.title,
					indexerId: release.indexerId,
					indexerName: release.indexerName,
					protocol: 'streaming',
					seriesId,
					episodeIds: createdEpisodeIds,
					seasonNumber,
					status: 'streaming',
					size: totalSize,
					quality,
					episodeFileIds: createdFileIds,
					grabbedAt: new Date().toISOString(),
					importedAt: new Date().toISOString()
				});
			}
		} catch (dbError) {
			return {
				success: false,
				error: dbError instanceof Error ? dbError.message : 'Database operation failed'
			};
		}

		if (createdFileIds.length === 0) {
			return { success: false, error: 'Failed to create any episode file records' };
		}

		libraryMediaEvents.emitSeriesUpdated(seriesId);
		void this.triggerSubtitleSearchForEpisodes(createdEpisodeIds);

		return {
			success: true,
			queueId: createdFileIds[0],
			clientId: 'streaming',
			clientName: 'Streaming',
			category: 'tv'
		};
	}

	private async triggerSubtitleSearch(
		mediaType: 'movie' | 'episode',
		mediaId: string
	): Promise<void> {
		try {
			const settings = await monitoringScheduler.getSettings();
			if (!settings.subtitleSearchOnImportEnabled) return;
			await searchSubtitlesForNewMedia(mediaType, mediaId);
		} catch (error) {
			logger.warn({ mediaType, mediaId, err: error }, 'Subtitle search on import failed');
		}
	}

	private async triggerSubtitleSearchForEpisodes(episodeIds: string[]): Promise<void> {
		if (episodeIds.length === 0) return;
		try {
			const settings = await monitoringScheduler.getSettings();
			if (!settings.subtitleSearchOnImportEnabled) return;
			await Promise.allSettled(episodeIds.map((id) => searchSubtitlesForNewMedia('episode', id)));
		} catch (error) {
			logger.warn({ total: episodeIds.length, err: error }, 'Subtitle search failed for episodes');
		}
	}

	private async deleteExistingMovieFiles(
		movieId: string,
		rootFolderPath: string,
		moviePath: string
	): Promise<void> {
		const existingFiles = await db.query.movieFiles.findMany({
			where: eq(movieFiles.movieId, movieId)
		});

		for (const oldFile of existingFiles) {
			const oldFilePath = join(rootFolderPath, moviePath, oldFile.relativePath);
			try {
				if (await fileExists(oldFilePath)) {
					await unlink(oldFilePath);
				}
			} catch {
				// non-critical
			}
			await db.delete(movieFiles).where(eq(movieFiles.id, oldFile.id));
		}
	}

	private async deleteExistingEpisodeFiles(
		seriesId: string,
		episodeId: string,
		rootFolderPath: string,
		seriesPath: string
	): Promise<void> {
		const allSeriesFiles = await db.query.episodeFiles.findMany({
			where: eq(episodeFiles.seriesId, seriesId)
		});
		const existingFiles = allSeriesFiles.filter((f) => f.episodeIds?.includes(episodeId));

		for (const oldFile of existingFiles) {
			const oldFilePath = join(rootFolderPath, seriesPath, oldFile.relativePath);
			try {
				if (await fileExists(oldFilePath)) {
					await unlink(oldFilePath);
				}
			} catch {
				// non-critical
			}
			await db.delete(episodeFiles).where(eq(episodeFiles.id, oldFile.id));
		}
	}
}
