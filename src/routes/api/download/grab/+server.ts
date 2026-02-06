import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDownloadClientManager } from '$lib/server/downloadClients/DownloadClientManager';
import { getIndexerManager } from '$lib/server/indexers/IndexerManager';
import { downloadMonitor } from '$lib/server/downloadClients/monitoring';
import { ReleaseParser } from '$lib/server/indexers/parser/ReleaseParser';
import { logger } from '$lib/logging';
import type { GrabRequest, GrabResponse } from '$lib/types/queue';
import { getDownloadResolutionService, releaseDecisionService } from '$lib/server/downloads';
import { checkNzbAvailability } from '$lib/server/downloads/nzb/NzbAvailabilityChecker.js';
import { blocklistService } from '$lib/server/monitoring/specifications/BlocklistSpecification.js';
import type { DownloadInfo } from '$lib/server/downloadClients/core/interfaces';
import { categoryMatchesSearchType, getCategoryContentType } from '$lib/server/indexers/types';
import { strmService, StrmService, getStreamingBaseUrl } from '$lib/server/streaming';
import { getNzbMountManager } from '$lib/server/streaming/nzb';
import { getUsenetStreamService } from '$lib/server/streaming/usenet/UsenetStreamService';
import { mediaInfoService } from '$lib/server/library/media-info';
import { db } from '$lib/server/db';
import {
	movies,
	movieFiles,
	series,
	episodes,
	episodeFiles,
	downloadHistory
} from '$lib/server/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { statSync } from 'node:fs';
import { relative } from 'node:path';
import { redactUrl } from '$lib/server/utils/urlSecurity';

const parser = new ReleaseParser();

type EpisodeFileUpsertInput = Omit<typeof episodeFiles.$inferInsert, 'id'> & { id?: string };

/**
 * Upsert episode file by (seriesId, relativePath) to avoid duplicate rows.
 * Returns the canonical episode_files.id (existing or newly inserted).
 */
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

/**
 * POST /api/download/grab
 * Sends a release to a download client and creates a queue record.
 */
export const POST: RequestHandler = async ({ request }) => {
	let data: GrabRequest;

	try {
		data = await request.json();
	} catch {
		return json({ success: false, error: 'Invalid JSON body' } satisfies GrabResponse, {
			status: 400
		});
	}

	// Validate required fields
	if (!data.downloadUrl && !data.magnetUrl) {
		return json(
			{
				success: false,
				error: 'Either downloadUrl or magnetUrl is required'
			} satisfies GrabResponse,
			{ status: 400 }
		);
	}

	if (!data.title) {
		return json({ success: false, error: 'title is required' } satisfies GrabResponse, {
			status: 400
		});
	}

	if (!data.mediaType) {
		return json({ success: false, error: 'mediaType is required' } satisfies GrabResponse, {
			status: 400
		});
	}

	// Require linked media
	if (!data.movieId && !data.seriesId) {
		return json(
			{ success: false, error: 'Either movieId or seriesId is required' } satisfies GrabResponse,
			{ status: 400 }
		);
	}

	// Validate release category matches media type (prevents grabbing audio for movies, etc.)
	if (data.categories && data.categories.length > 0) {
		const searchType = data.mediaType === 'movie' ? 'movie' : 'tv';
		const hasMatchingCategory = data.categories.some((cat) =>
			categoryMatchesSearchType(cat, searchType)
		);

		if (!hasMatchingCategory) {
			const actualContentType = getCategoryContentType(data.categories[0]);
			logger.error('[Grab] BLOCKED: Release category mismatch - potential wrong content type', {
				title: data.title,
				expectedType: data.mediaType,
				actualContentType,
				categories: data.categories
			});
			return json(
				{
					success: false,
					error: `Category mismatch: ${actualContentType} release cannot be grabbed for ${data.mediaType}`
				} satisfies GrabResponse,
				{ status: 422 }
			);
		}
	}

	// Validate release title matches target series (prevents wrong series being grabbed)
	// Only for automatic grabs - manual grabs are user's choice
	if (data.seriesId && data.isAutomatic) {
		const targetSeries = await db
			.select()
			.from(series)
			.where(eq(series.id, data.seriesId))
			.limit(1);
		if (targetSeries.length > 0) {
			const parsed = parser.parse(data.title);
			const parsedTitle = (parsed.cleanTitle || '').toLowerCase().replace(/[^a-z0-9]/g, '');
			const targetTitle = targetSeries[0].title.toLowerCase().replace(/[^a-z0-9]/g, '');

			// Check if titles have reasonable overlap
			// Either exact match, or one contains the other (handles "The Office" vs "Office")
			const titlesMatch =
				parsedTitle === targetTitle ||
				(parsedTitle.length > 3 && targetTitle.includes(parsedTitle)) ||
				(targetTitle.length > 3 && parsedTitle.includes(targetTitle));

			if (!titlesMatch && parsedTitle.length > 0) {
				logger.error('[Grab] BLOCKED: Release title does not match target series', {
					releaseTitle: data.title,
					parsedTitle: parsed.cleanTitle,
					normalizedParsed: parsedTitle,
					targetTitle: targetSeries[0].title,
					normalizedTarget: targetTitle,
					seriesId: data.seriesId
				});
				return json(
					{
						success: false,
						error: `Title mismatch: "${parsed.cleanTitle || data.title}" does not match series "${targetSeries[0].title}"`
					} satisfies GrabResponse,
					{ status: 422 }
				);
			}
		}
	}

	try {
		// ============================================================
		// STREAMING PROTOCOL HANDLING
		// ============================================================
		// If this is a streaming release, bypass download client and create .strm file directly
		if (data.protocol === 'streaming') {
			return await handleStreamingGrab(data);
		}

		// ============================================================
		// NZB STREAMING - Stream directly via NNTP without download client
		// ============================================================
		if (data.protocol === 'usenet' && data.streamUsenet) {
			return await handleNzbStreamingGrab(data);
		}

		// ============================================================
		// UPGRADE VALIDATION - Check if release is acceptable
		// ============================================================
		// Manual grabs bypass upgrade validation - user made a conscious choice
		if (data.isAutomatic !== true) {
			data.force = data.force ?? true;
		}

		// Parse quality from release title for decision making
		const parsedQuality = parser.parse(data.title);

		// Build release info for decision service
		const releaseInfo = {
			title: data.title,
			size: undefined as number | undefined, // Size not always available from grab request
			quality: {
				resolution: parsedQuality.resolution ?? undefined,
				source: parsedQuality.source ?? undefined,
				codec: parsedQuality.codec ?? undefined,
				hdr: parsedQuality.hdr ?? undefined
			},
			indexerId: data.indexerId,
			infoHash: data.infoHash,
			downloadUrl: data.downloadUrl,
			magnetUrl: data.magnetUrl
		};

		// Evaluate the release based on media type
		let decision;

		if (data.movieId) {
			// Movie grab
			decision = await releaseDecisionService.evaluateForMovie(data.movieId, releaseInfo, {
				force: data.force
			});
		} else if (data.seriesId && !data.episodeIds?.length) {
			// Season pack grab
			decision = await releaseDecisionService.evaluateForSeason(
				data.seriesId,
				data.seasonNumber!,
				releaseInfo,
				{ force: data.force }
			);
		} else if (data.episodeIds?.length) {
			// Specific episodes grab - evaluate the first episode as representative
			// (In practice, all episodes in the same release should have similar quality needs)
			decision = await releaseDecisionService.evaluateForEpisode(data.episodeIds[0], releaseInfo, {
				force: data.force
			});
		} else if (data.seriesId) {
			// Series-level grab (rare, but possible for complete series packs)
			decision = await releaseDecisionService.evaluateForSeries(data.seriesId, releaseInfo, {
				force: data.force
			});
		} else {
			// Fallback - shouldn't happen due to validation above
			decision = { accepted: true, isUpgrade: false, upgradeStatus: 'new' as const };
		}

		// If not accepted and not forced, reject the grab
		if (!decision.accepted && !data.force) {
			logger.info('Grab rejected by upgrade validation', {
				title: data.title,
				movieId: data.movieId,
				seriesId: data.seriesId,
				reason: decision.reason,
				upgradeStatus: decision.upgradeStatus
			});

			return json(
				{
					success: false,
					error: decision.reason || 'Release does not meet upgrade requirements',
					rejectionType: decision.rejectionType,
					upgradeDecision: {
						upgradeStatus: decision.upgradeStatus,
						reason: decision.reason,
						isUpgrade: decision.isUpgrade,
						candidateScore: decision.candidateScore,
						existingScore: decision.existingScore,
						upgradeStats: decision.upgradeStats
					}
				} satisfies GrabResponse,
				{ status: 422 }
			);
		}

		// Log if force was used to override
		if (!decision.accepted && data.force) {
			logger.info('Grab forced despite upgrade validation failure', {
				title: data.title,
				reason: decision.reason,
				upgradeStatus: decision.upgradeStatus
			});
		}

		// Track whether this is an upgrade for the queue record
		const isUpgrade = decision.isUpgrade;

		// ============================================================
		// DOWNLOAD CLIENT SETUP
		// ============================================================
		const manager = getDownloadClientManager();

		// Determine protocol (default to torrent for backwards compatibility)
		const protocol = data.protocol === 'usenet' ? 'usenet' : 'torrent';

		// Get client for the specific protocol
		const clientResult = await manager.getClientForProtocol(protocol);

		if (!clientResult) {
			return json(
				{
					success: false,
					error: `No enabled ${protocol} download client configured`
				} satisfies GrabResponse,
				{ status: 400 }
			);
		}

		const { client: clientConfig, instance: clientInstance } = clientResult;

		// Determine category based on media type
		const category =
			data.mediaType === 'movie' ? clientConfig.movieCategory : clientConfig.tvCategory;

		// Determine if we should pause based on client config
		const paused = clientConfig.initialState === 'pause';

		// Parse quality from release title if not provided
		let quality = data.quality;
		if (!quality) {
			const parsed = parser.parse(data.title);
			quality = {
				resolution: parsed.resolution ?? undefined,
				source: parsed.source ?? undefined,
				codec: parsed.codec ?? undefined,
				hdr: parsed.hdr ?? undefined
			};
		}

		// Look up indexer to get seed ratio/time settings
		let indexerSeedRatio: number | undefined;
		let indexerSeedTime: number | undefined;

		if (data.indexerId) {
			const indexerManager = await getIndexerManager();
			const indexer = await indexerManager.getIndexer(data.indexerId);
			if (indexer) {
				indexerSeedRatio = indexer.seedRatio ? parseFloat(indexer.seedRatio) : undefined;
				indexerSeedTime = indexer.seedTime ?? undefined;
			}
		}

		// Use indexer settings if available, otherwise fall back to client defaults
		const seedRatioLimit =
			indexerSeedRatio ??
			(clientConfig.seedRatioLimit ? parseFloat(clientConfig.seedRatioLimit) : undefined);
		const seedTimeLimit = indexerSeedTime ?? clientConfig.seedTimeLimit ?? undefined;

		logger.info('Grabbing release', {
			title: data.title,
			indexer: data.indexerName,
			client: clientConfig.name,
			category,
			hasMagnet: !!data.magnetUrl,
			hasDownloadUrl: !!data.downloadUrl,
			hasInfoHash: !!data.infoHash,
			movieId: data.movieId,
			seriesId: data.seriesId,
			seedRatioLimit,
			seedTimeLimit
		});

		// For Usenet, skip torrent resolution - just pass URL directly to client
		// For torrents, resolve the download URL to get a magnet link or torrent file
		let resolved: {
			success: boolean;
			magnetUrl?: string;
			torrentFile?: Buffer;
			infoHash?: string;
			error?: string;
		};

		// Reconstruct redacted download URL if needed (API keys are redacted in search results)
		let reconstructedDownloadUrl = data.downloadUrl;
		if (data.downloadUrl && data.indexerId) {
			const isRedacted =
				data.downloadUrl.includes('[REDACTED]') || data.downloadUrl.includes('%5BREDACTED%5D');
			if (isRedacted) {
				const indexerManager = await getIndexerManager();
				const indexerInstance = await indexerManager.getIndexerInstance(data.indexerId);
				if (indexerInstance && 'reconstructDownloadUrl' in indexerInstance) {
					reconstructedDownloadUrl = (
						indexerInstance as { reconstructDownloadUrl: (url: string) => string }
					).reconstructDownloadUrl(data.downloadUrl);
					logger.debug('Reconstructed redacted download URL for grab');
				}
			}
		}

		if (protocol === 'usenet') {
			// Usenet: fetch NZB and run NNTP pre-flight check before sending to client
			resolved = { success: true };

			// Fetch NZB content for availability check
			if (reconstructedDownloadUrl) {
				try {
					logger.info('[Grab] Fetching NZB for pre-flight check', { title: data.title });
					const nzbResponse = await fetch(reconstructedDownloadUrl);
					if (nzbResponse.ok) {
						const nzbContent = await nzbResponse.text();

						// Run NNTP availability check
						const availability = await checkNzbAvailability(nzbContent);

						if (availability.skipped) {
							logger.warn('[Grab] NNTP pre-flight check skipped - no servers configured', {
								title: data.title,
								indexer: data.indexerName
							});
						} else if (!availability.available) {
							logger.warn('[Grab] NZB availability check failed', {
								title: data.title,
								completionPercentage: availability.completionPercentage,
								checkedSegments: availability.checkedSegments,
								missingSegments: availability.missingSegments
							});

							// Auto-blocklist this release from this specific indexer
							try {
								await blocklistService.addToBlocklist(
									{
										title: data.title,
										indexerId: data.indexerId,
										size: data.size,
										protocol: 'usenet'
									},
									{
										movieId: data.movieId,
										seriesId: data.seriesId,
										episodeIds: data.episodeIds,
										reason: 'download_failed',
										message: `Unavailable on usenet: ${availability.completionPercentage}% articles found`,
										expiresInHours: 72
									}
								);
								logger.info('[Grab] Auto-blocklisted unavailable release', {
									title: data.title,
									indexer: data.indexerName,
									expiresInHours: 72
								});
							} catch (blocklistError) {
								logger.warn('[Grab] Failed to add to blocklist', {
									title: data.title,
									error: blocklistError instanceof Error ? blocklistError.message : 'Unknown'
								});
							}

							return json(
								{
									success: false,
									error: `Release unavailable on usenet: ${availability.completionPercentage}% of articles found. Release may be incomplete or DMCA'd.`
								} satisfies GrabResponse,
								{ status: 400 }
							);
						} else {
							logger.info('[Grab] NZB availability check passed', {
								title: data.title,
								completionPercentage: availability.completionPercentage
							});
						}
					}
				} catch (nzbError) {
					logger.warn('[Grab] Failed to fetch NZB for pre-flight check, proceeding anyway', {
						title: data.title,
						error: nzbError instanceof Error ? nzbError.message : 'Unknown'
					});
				}
			}

			logger.debug('Usenet download ready', { title: data.title });
		} else {
			// Resolve torrent - fetches through the indexer with proper auth/cookies
			const resolutionService = getDownloadResolutionService();
			resolved = await resolutionService.resolve({
				downloadUrl: reconstructedDownloadUrl,
				magnetUrl: data.magnetUrl,
				infoHash: data.infoHash,
				indexerId: data.indexerId,
				title: data.title
			});

			if (!resolved.success) {
				logger.error('Failed to resolve download', {
					title: data.title,
					error: resolved.error
				});
				return json(
					{
						success: false,
						error: `Failed to resolve download: ${resolved.error}`
					} satisfies GrabResponse,
					{ status: 500 }
				);
			}

			logger.debug('Download resolved', {
				title: data.title,
				hasMagnet: !!resolved.magnetUrl,
				hasTorrentFile: !!resolved.torrentFile,
				infoHash: resolved.infoHash
			});
		}

		// Send to download client
		let hash: string;
		let existingTorrent: DownloadInfo | null = null;

		try {
			hash = await clientInstance.addDownload({
				magnetUri: resolved.magnetUrl,
				torrentFile: resolved.torrentFile,
				infoHash: resolved.infoHash,
				downloadUrl: reconstructedDownloadUrl,
				title: data.title,
				category,
				paused,
				priority: clientConfig.recentPriority,
				seedRatioLimit,
				seedTimeLimit
			});
		} catch (addError) {
			// Check if this is a duplicate torrent error
			const isDuplicate = (addError as Error & { isDuplicate?: boolean }).isDuplicate;
			existingTorrent =
				(addError as Error & { existingTorrent?: DownloadInfo }).existingTorrent || null;

			if (isDuplicate && existingTorrent) {
				logger.info('Handling duplicate torrent - linking to existing download', {
					title: data.title,
					existingName: existingTorrent.name,
					existingStatus: existingTorrent.status,
					existingProgress: existingTorrent.progress,
					hash: existingTorrent.hash
				});

				// Use the existing torrent's hash
				hash = existingTorrent.hash;
			} else {
				// Not a duplicate error, re-throw
				throw addError;
			}
		}

		// Determine the best infoHash to use
		const infoHash = resolved.infoHash || hash;

		// Create queue record to track the download
		// addToQueue will return existing item if already tracked
		const queueItem = await downloadMonitor.addToQueue({
			downloadClientId: clientConfig.id,
			downloadId: hash || infoHash || resolved.magnetUrl || data.downloadUrl || '',
			infoHash: infoHash || undefined,
			title: data.title,
			indexerId: data.indexerId,
			indexerName: data.indexerName,
			downloadUrl: data.downloadUrl,
			magnetUrl: resolved.magnetUrl || data.magnetUrl,
			protocol: protocol,
			movieId: data.movieId,
			seriesId: data.seriesId,
			episodeIds: data.episodeIds,
			seasonNumber: data.seasonNumber,
			quality,
			isAutomatic: data.isAutomatic ?? false,
			isUpgrade: isUpgrade
		});

		// Log appropriate message based on whether it was a duplicate
		if (existingTorrent) {
			logger.info('Duplicate torrent linked to queue', {
				title: data.title,
				hash,
				queueId: queueItem.id,
				existingStatus: existingTorrent.status,
				existingProgress: Math.round(existingTorrent.progress * 100) + '%',
				client: clientConfig.name
			});
		} else {
			logger.info('Release grabbed and queued successfully', {
				title: data.title,
				hash,
				queueId: queueItem.id,
				client: clientConfig.name
			});
		}

		return json({
			success: true,
			data: {
				queueId: queueItem.id,
				hash: hash || queueItem.downloadId,
				clientId: clientConfig.id,
				clientName: clientConfig.name,
				category,
				wasDuplicate: !!existingTorrent,
				isUpgrade
			}
		} satisfies GrabResponse);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		logger.error('Failed to grab release', { error: message, title: data.title });

		return json({ success: false, error: message } satisfies GrabResponse, { status: 500 });
	}
};

/**
 * Handle streaming protocol grabs
 * Creates .strm file directly without using download client
 */
async function handleStreamingGrab(data: GrabRequest): Promise<Response> {
	const { mediaType, movieId, seriesId, downloadUrl, title, indexerId, indexerName } = data;

	logger.info('[Grab] Handling streaming release', {
		title,
		downloadUrl: downloadUrl ? redactUrl(downloadUrl) : null
	});

	// Parse the stream:// URL to get TMDB ID and episode info
	const parsed = StrmService.parseStreamUrl(downloadUrl || '');
	if (!parsed) {
		return json(
			{ success: false, error: `Invalid streaming URL: ${downloadUrl}` } satisfies GrabResponse,
			{ status: 400 }
		);
	}

	// Determine base URL for the .strm file content (from indexer settings, env var, or default)
	const baseUrl = await getStreamingBaseUrl('http://localhost:5173');

	// Handle complete series (all seasons)
	if (parsed.isCompleteSeries && mediaType === 'tv' && seriesId) {
		return handleStreamingCompleteSeries(data, parsed, baseUrl);
	}

	// Handle season pack (multiple episodes in one season)
	if (parsed.isSeasonPack && mediaType === 'tv' && seriesId && parsed.season !== undefined) {
		return handleStreamingSeasonPack(data, parsed, baseUrl);
	}

	// Single file handling (movie or single episode)
	const result = await strmService.createStrmFile({
		mediaType,
		tmdbId: parsed.tmdbId,
		movieId,
		seriesId,
		season: parsed.season,
		episode: parsed.episode,
		baseUrl
	});

	if (!result.success || !result.filePath) {
		logger.error('[Grab] Failed to create .strm file', {
			title,
			error: result.error
		});
		return json(
			{
				success: false,
				error: result.error || 'Failed to create .strm file'
			} satisfies GrabResponse,
			{ status: 500 }
		);
	}

	logger.info('[Grab] Created .strm file for streaming release', {
		title,
		filePath: result.filePath
	});

	// Now add the file to the database (immediate import)
	try {
		// Get file stats
		const stats = statSync(result.filePath);

		// Parse quality from release title - for streaming, quality is determined at playback
		const parsedRelease = parser.parse(title);
		const quality = {
			resolution: parsedRelease.resolution ?? undefined,
			source: 'Streaming',
			codec: undefined,
			hdr: undefined
		};

		let fileId: string | undefined;

		if (mediaType === 'movie' && movieId) {
			// Get movie for root folder path
			const movie = await db.query.movies.findFirst({
				where: eq(movies.id, movieId),
				with: { rootFolder: true }
			});

			if (!movie || !movie.rootFolder) {
				return json(
					{ success: false, error: 'Movie or root folder not found' } satisfies GrabResponse,
					{ status: 404 }
				);
			}

			const allowStrmProbe = movie.scoringProfileId !== 'streamer';
			const mediaInfo = await mediaInfoService.extractMediaInfo(result.filePath, {
				allowStrmProbe
			});

			// Calculate relative path from root folder
			const relativePath = relative(movie.rootFolder.path, result.filePath);

			// Create movie file record
			fileId = randomUUID();
			await db.insert(movieFiles).values({
				id: fileId,
				movieId,
				relativePath,
				size: stats.size,
				dateAdded: new Date().toISOString(),
				sceneName: title,
				releaseGroup: parsedRelease.releaseGroup ?? 'Streaming',
				quality,
				mediaInfo
			});

			// Update movie hasFile flag
			await db.update(movies).set({ hasFile: true }).where(eq(movies.id, movieId));

			// Create history record
			await db.insert(downloadHistory).values({
				title,
				indexerId,
				indexerName,
				protocol: 'streaming',
				movieId,
				status: 'streaming',
				size: stats.size,
				quality,
				importedPath: result.filePath,
				movieFileId: fileId,
				grabbedAt: new Date().toISOString(),
				importedAt: new Date().toISOString()
			});

			logger.info('[Grab] Added streaming movie file to database', {
				movieId,
				fileId,
				relativePath
			});
		} else if (
			mediaType === 'tv' &&
			seriesId &&
			parsed.season !== undefined &&
			parsed.episode !== undefined
		) {
			// Get series for root folder path
			const show = await db.query.series.findFirst({
				where: eq(series.id, seriesId),
				with: { rootFolder: true }
			});

			if (!show || !show.rootFolder) {
				return json(
					{ success: false, error: 'Series or root folder not found' } satisfies GrabResponse,
					{ status: 404 }
				);
			}

			const allowStrmProbe = show.scoringProfileId !== 'streamer';
			const mediaInfo = await mediaInfoService.extractMediaInfo(result.filePath, {
				allowStrmProbe
			});

			// Find the episode
			const episodeRow = await db.query.episodes.findFirst({
				where: and(
					eq(episodes.seriesId, seriesId),
					eq(episodes.seasonNumber, parsed.season),
					eq(episodes.episodeNumber, parsed.episode)
				)
			});

			if (!episodeRow) {
				return json(
					{
						success: false,
						error: `Episode S${parsed.season}E${parsed.episode} not found`
					} satisfies GrabResponse,
					{ status: 404 }
				);
			}

			// Calculate relative path from root folder
			const relativePath = relative(show.rootFolder.path, result.filePath);

			// Create/update episode file record
			fileId = await upsertEpisodeFileByPath({
				seriesId,
				seasonNumber: parsed.season,
				episodeIds: [episodeRow.id],
				relativePath,
				size: stats.size,
				dateAdded: new Date().toISOString(),
				sceneName: title,
				releaseGroup: parsedRelease.releaseGroup ?? 'Streaming',
				quality,
				mediaInfo
			});

			// Update episode hasFile flag
			await db.update(episodes).set({ hasFile: true }).where(eq(episodes.id, episodeRow.id));

			// Create history record
			await db.insert(downloadHistory).values({
				title,
				indexerId,
				indexerName,
				protocol: 'streaming',
				seriesId,
				episodeIds: [episodeRow.id],
				seasonNumber: parsed.season,
				status: 'streaming',
				size: stats.size,
				quality,
				importedPath: result.filePath,
				episodeFileIds: [fileId],
				grabbedAt: new Date().toISOString(),
				importedAt: new Date().toISOString()
			});

			logger.info('[Grab] Added streaming episode file to database', {
				seriesId,
				episodeId: episodeRow.id,
				fileId,
				relativePath
			});
		} else {
			return json(
				{
					success: false,
					error: 'Invalid media type or missing required IDs'
				} satisfies GrabResponse,
				{ status: 400 }
			);
		}

		return json({
			success: true,
			data: {
				queueId: fileId || 'streaming',
				hash: 'streaming',
				clientId: 'streaming',
				clientName: 'Streaming',
				category: mediaType === 'movie' ? 'movies' : 'tv',
				wasDuplicate: false,
				isUpgrade: false
			}
		} satisfies GrabResponse);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		logger.error('[Grab] Failed to add streaming file to database', {
			title,
			error: message
		});
		return json({ success: false, error: `Database error: ${message}` } satisfies GrabResponse, {
			status: 500
		});
	}
}

/**
 * Handle streaming season pack - create .strm files for all episodes in a season
 */
async function handleStreamingSeasonPack(
	data: GrabRequest,
	parsed: {
		mediaType: 'movie' | 'tv';
		tmdbId: string;
		season?: number;
		episode?: number;
		isSeasonPack?: boolean;
	},
	baseUrl: string
): Promise<Response> {
	const { seriesId, title, indexerId, indexerName } = data;
	const seasonNumber = parsed.season!;

	logger.info('[Grab] Handling streaming season pack', {
		seriesId,
		seasonNumber,
		title
	});

	if (!seriesId) {
		return json(
			{ success: false, error: 'seriesId is required for season pack' } satisfies GrabResponse,
			{ status: 400 }
		);
	}

	// Get series for root folder path
	const show = await db.query.series.findFirst({
		where: eq(series.id, seriesId),
		with: { rootFolder: true }
	});

	if (!show || !show.rootFolder) {
		return json(
			{ success: false, error: 'Series or root folder not found' } satisfies GrabResponse,
			{ status: 404 }
		);
	}
	const allowStrmProbe = show.scoringProfileId !== 'streamer';

	// Create .strm files for all episodes in the season
	const strmResult = await strmService.createSeasonStrmFiles({
		seriesId,
		seasonNumber,
		tmdbId: parsed.tmdbId,
		baseUrl
	});

	if (!strmResult.success || strmResult.results.length === 0) {
		logger.error('[Grab] Failed to create season pack .strm files', {
			seriesId,
			seasonNumber,
			error: strmResult.error
		});
		return json(
			{
				success: false,
				error: strmResult.error || 'Failed to create .strm files'
			} satisfies GrabResponse,
			{ status: 500 }
		);
	}

	// Parse quality from release title
	const parsedRelease = parser.parse(title);
	const quality = {
		resolution: parsedRelease.resolution ?? '1080p',
		source: 'Streaming',
		codec: 'HLS',
		hdr: undefined
	};

	// Collect all records to batch insert
	const fileRecords: Array<{
		id: string;
		seriesId: string;
		seasonNumber: number;
		episodeIds: string[];
		relativePath: string;
		size: number;
		dateAdded: string;
		sceneName: string;
		releaseGroup: string;
		quality: typeof quality;
		mediaInfo: Awaited<ReturnType<typeof mediaInfoService.extractMediaInfo>>;
	}> = [];
	const episodeIdsToUpdate: string[] = [];
	let totalSize = 0;
	const dateAdded = new Date().toISOString();
	const releaseGroup = parsedRelease.releaseGroup ?? 'Streaming';

	// Collect all file records (no DB operations in this loop)
	for (const epResult of strmResult.results) {
		if (!epResult.filePath) {
			logger.warn('[Grab] Skipping episode without .strm file', {
				episodeId: epResult.episodeId,
				episodeNumber: epResult.episodeNumber,
				error: epResult.error
			});
			continue;
		}

		try {
			const stats = statSync(epResult.filePath);
			const mediaInfo = await mediaInfoService.extractMediaInfo(epResult.filePath, {
				allowStrmProbe
			});
			const relativePath = relative(show.rootFolder.path, epResult.filePath);
			const fileId = randomUUID();

			fileRecords.push({
				id: fileId,
				seriesId,
				seasonNumber,
				episodeIds: [epResult.episodeId],
				relativePath,
				size: stats.size,
				dateAdded,
				sceneName: title,
				releaseGroup,
				quality,
				mediaInfo
			});

			episodeIdsToUpdate.push(epResult.episodeId);
			totalSize += stats.size;
		} catch (error) {
			logger.error('[Grab] Failed to prepare DB record for episode', {
				episodeId: epResult.episodeId,
				episodeNumber: epResult.episodeNumber,
				error: error instanceof Error ? error.message : 'Unknown error'
			});
		}
	}

	if (fileRecords.length === 0) {
		return json(
			{ success: false, error: 'Failed to create any episode file records' } satisfies GrabResponse,
			{ status: 500 }
		);
	}

	// Upsert all episode files by series/path to avoid duplicate rows
	const createdFileIds: string[] = [];
	for (const record of fileRecords) {
		const resolvedId = await upsertEpisodeFileByPath(record);
		if (!createdFileIds.includes(resolvedId)) {
			createdFileIds.push(resolvedId);
		}
	}

	// Batch update all episode hasFile flags
	await db.update(episodes).set({ hasFile: true }).where(inArray(episodes.id, episodeIdsToUpdate));

	const createdEpisodeIds = episodeIdsToUpdate;

	logger.debug('[Grab] Batch inserted episode file records', {
		count: fileRecords.length
	});

	// Create single history record for the entire season pack
	await db.insert(downloadHistory).values({
		title,
		indexerId,
		indexerName,
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

	logger.info('[Grab] Created streaming season pack files', {
		seriesId,
		seasonNumber,
		episodesCreated: createdFileIds.length,
		totalEpisodes: strmResult.results.length
	});

	return json({
		success: true,
		data: {
			queueId: createdFileIds[0] || 'streaming',
			hash: 'streaming',
			clientId: 'streaming',
			clientName: 'Streaming',
			category: 'tv',
			wasDuplicate: false,
			isUpgrade: false
		}
	} satisfies GrabResponse);
}

/**
 * Handle streaming complete series - create .strm files for all episodes in all seasons
 */
async function handleStreamingCompleteSeries(
	data: GrabRequest,
	parsed: {
		mediaType: 'movie' | 'tv';
		tmdbId: string;
		season?: number;
		episode?: number;
		isSeasonPack?: boolean;
		isCompleteSeries?: boolean;
	},
	baseUrl: string
): Promise<Response> {
	const { seriesId, title, indexerId, indexerName } = data;

	logger.info('[Grab] Handling streaming complete series', {
		seriesId,
		title
	});

	if (!seriesId) {
		return json(
			{ success: false, error: 'seriesId is required for complete series' } satisfies GrabResponse,
			{ status: 400 }
		);
	}

	// Get series for root folder path
	const show = await db.query.series.findFirst({
		where: eq(series.id, seriesId),
		with: { rootFolder: true }
	});

	if (!show || !show.rootFolder) {
		return json(
			{ success: false, error: 'Series or root folder not found' } satisfies GrabResponse,
			{ status: 404 }
		);
	}
	const allowStrmProbe = show.scoringProfileId !== 'streamer';

	// Create .strm files for all episodes in all seasons
	const strmResult = await strmService.createSeriesStrmFiles({
		seriesId,
		tmdbId: parsed.tmdbId,
		baseUrl
	});

	if (!strmResult.success || strmResult.results.length === 0) {
		logger.error('[Grab] Failed to create complete series .strm files', {
			seriesId,
			error: strmResult.error
		});
		return json(
			{
				success: false,
				error: strmResult.error || 'Failed to create .strm files'
			} satisfies GrabResponse,
			{ status: 500 }
		);
	}

	// Parse quality from release title
	const parsedRelease = parser.parse(title);
	const quality = {
		resolution: parsedRelease.resolution ?? '1080p',
		source: 'Streaming',
		codec: 'HLS',
		hdr: undefined
	};

	// Collect all records to batch insert
	const fileRecords: Array<{
		id: string;
		seriesId: string;
		seasonNumber: number;
		episodeIds: string[];
		relativePath: string;
		size: number;
		dateAdded: string;
		sceneName: string;
		releaseGroup: string;
		quality: typeof quality;
		mediaInfo: Awaited<ReturnType<typeof mediaInfoService.extractMediaInfo>>;
	}> = [];
	const episodeIdsToUpdate: string[] = [];
	let totalSize = 0;
	const dateAdded = new Date().toISOString();
	const releaseGroup = parsedRelease.releaseGroup ?? 'Streaming';

	// Collect all file records across all seasons (no DB operations in this loop)
	for (const seasonResult of strmResult.results) {
		for (const epResult of seasonResult.episodeResults) {
			if (!epResult.filePath) {
				logger.warn('[Grab] Skipping episode without .strm file', {
					seasonNumber: seasonResult.seasonNumber,
					episodeId: epResult.episodeId,
					episodeNumber: epResult.episodeNumber,
					error: epResult.error
				});
				continue;
			}

			try {
				const stats = statSync(epResult.filePath);
				const mediaInfo = await mediaInfoService.extractMediaInfo(epResult.filePath, {
					allowStrmProbe
				});
				const relativePath = relative(show.rootFolder.path, epResult.filePath);
				const fileId = randomUUID();

				fileRecords.push({
					id: fileId,
					seriesId,
					seasonNumber: seasonResult.seasonNumber,
					episodeIds: [epResult.episodeId],
					relativePath,
					size: stats.size,
					dateAdded,
					sceneName: title,
					releaseGroup,
					quality,
					mediaInfo
				});

				episodeIdsToUpdate.push(epResult.episodeId);
				totalSize += stats.size;
			} catch (error) {
				logger.error('[Grab] Failed to prepare DB record for episode', {
					seasonNumber: seasonResult.seasonNumber,
					episodeId: epResult.episodeId,
					episodeNumber: epResult.episodeNumber,
					error: error instanceof Error ? error.message : 'Unknown error'
				});
			}
		}
	}

	if (fileRecords.length === 0) {
		return json(
			{ success: false, error: 'Failed to create any episode file records' } satisfies GrabResponse,
			{ status: 500 }
		);
	}

	// Upsert all episode files by series/path to avoid duplicate rows
	const createdFileIds: string[] = [];
	for (const record of fileRecords) {
		const resolvedId = await upsertEpisodeFileByPath(record);
		if (!createdFileIds.includes(resolvedId)) {
			createdFileIds.push(resolvedId);
		}
	}

	// Batch update all episode hasFile flags
	await db.update(episodes).set({ hasFile: true }).where(inArray(episodes.id, episodeIdsToUpdate));

	const createdEpisodeIds = episodeIdsToUpdate;

	logger.debug('[Grab] Batch inserted episode file records', {
		count: fileRecords.length,
		seasons: strmResult.results.length
	});

	// Create single history record for the entire complete series
	await db.insert(downloadHistory).values({
		title,
		indexerId,
		indexerName,
		protocol: 'streaming',
		seriesId,
		episodeIds: createdEpisodeIds,
		seasonNumber: undefined, // null indicates complete series
		status: 'streaming',
		size: totalSize,
		quality,
		episodeFileIds: createdFileIds,
		grabbedAt: new Date().toISOString(),
		importedAt: new Date().toISOString()
	});

	logger.info('[Grab] Created streaming complete series files', {
		seriesId,
		seasonsProcessed: strmResult.results.length,
		episodesCreated: createdFileIds.length
	});

	return json({
		success: true,
		data: {
			queueId: createdFileIds[0] || 'streaming',
			hash: 'streaming',
			clientId: 'streaming',
			clientName: 'Streaming',
			category: 'tv',
			wasDuplicate: false,
			isUpgrade: false
		}
	} satisfies GrabResponse);
}

/**
 * Handle NZB streaming grab - fetch NZB and create mount for direct NNTP streaming
 */
async function handleNzbStreamingGrab(data: GrabRequest): Promise<Response> {
	const {
		mediaType,
		movieId,
		seriesId,
		downloadUrl: rawDownloadUrl,
		title,
		indexerId,
		indexerName,
		episodeIds,
		seasonNumber
	} = data;

	logger.info('[Grab] Handling NZB streaming release', {
		title,
		downloadUrl: rawDownloadUrl ? redactUrl(rawDownloadUrl) : null,
		movieId,
		seriesId
	});

	if (!rawDownloadUrl) {
		return json(
			{ success: false, error: 'Download URL required for NZB streaming' } satisfies GrabResponse,
			{ status: 400 }
		);
	}

	try {
		// Fetch NZB content through indexer (handles auth/cookies)
		const indexerManager = await getIndexerManager();
		const indexer = await indexerManager.getIndexerInstance(indexerId || '');

		// Reconstruct download URL if it was redacted (contains [REDACTED] or URL-encoded %5BREDACTED%5D)
		// This happens when the URL came from the frontend which received redacted URLs for security
		let downloadUrl = rawDownloadUrl;
		const isRedacted =
			rawDownloadUrl.includes('[REDACTED]') || rawDownloadUrl.includes('%5BREDACTED%5D');
		if (isRedacted && indexer && 'reconstructDownloadUrl' in indexer) {
			downloadUrl = (
				indexer as { reconstructDownloadUrl: (url: string) => string }
			).reconstructDownloadUrl(rawDownloadUrl);
			logger.debug('[Grab] Reconstructed redacted download URL');
		}

		let nzbContent: Buffer | null = null;

		if (indexer && indexer.downloadTorrent) {
			// Use indexer's download method (works for NZB too)
			const result = await indexer.downloadTorrent(downloadUrl);
			if (result.success && result.data) {
				nzbContent = result.data;
			}
		}

		if (!nzbContent) {
			// Fallback to direct fetch
			const response = await fetch(downloadUrl);
			if (response.ok) {
				nzbContent = Buffer.from(await response.arrayBuffer());
			}
		}

		if (!nzbContent || nzbContent.length === 0) {
			return json({ success: false, error: 'Failed to fetch NZB content' } satisfies GrabResponse, {
				status: 500
			});
		}

		// Create streaming mount
		const nzbMountManager = getNzbMountManager();
		const mount = await nzbMountManager.createMount({
			nzbContent,
			title,
			indexerId,
			downloadUrl,
			movieId,
			seriesId,
			seasonNumber,
			episodeIds
		});

		// Check if content is streamable
		const streamService = getUsenetStreamService();
		const streamability = await streamService.checkStreamability(mount.id);

		logger.info('[Grab] Streamability check result', {
			title,
			mountId: mount.id,
			canStream: streamability.canStream,
			archiveType: streamability.archiveType,
			error: streamability.error
		});

		// If content cannot be streamed (e.g., RAR-compressed), return error
		if (!streamability.canStream) {
			logger.info('[Grab] NZB content not streamable', {
				title,
				mountId: mount.id,
				archiveType: streamability.archiveType,
				error: streamability.error
			});

			// Clean up the mount since it won't be used
			await nzbMountManager.deleteMount(mount.id);

			return json(
				{
					success: false,
					error: streamability.error || 'Cannot stream this release'
				} satisfies GrabResponse,
				{ status: 400 }
			);
		}

		// Determine base URL for .strm files
		const baseUrl = await getStreamingBaseUrl('http://localhost:5173');

		// Parse quality from release title
		const parsedRelease = parser.parse(title);
		const quality = {
			resolution: parsedRelease.resolution ?? undefined,
			source: parsedRelease.source ?? 'Usenet',
			codec: parsedRelease.codec ?? undefined,
			hdr: parsedRelease.hdr ?? undefined
		};

		// Create .strm files for each media file in the mount
		const createdFiles: string[] = [];

		if (mediaType === 'movie' && movieId) {
			// Get movie for file path calculation
			const movie = await db.query.movies.findFirst({
				where: eq(movies.id, movieId),
				with: { rootFolder: true }
			});

			if (!movie || !movie.rootFolder) {
				return json(
					{ success: false, error: 'Movie or root folder not found' } satisfies GrabResponse,
					{ status: 404 }
				);
			}
			const allowStrmProbe = movie.scoringProfileId !== 'streamer';

			// Create .strm file for the primary media file (first in list)
			if (mount.mediaFiles.length > 0) {
				const mediaFile = mount.mediaFiles[0];
				const strmResult = await strmService.createNzbStrmFile({
					mountId: mount.id,
					fileIndex: mediaFile.index,
					movieId,
					baseUrl
				});

				if (strmResult.success && strmResult.filePath) {
					const stats = statSync(strmResult.filePath);
					const mediaInfo = await mediaInfoService.extractMediaInfo(strmResult.filePath, {
						allowStrmProbe
					});
					const relativePath = relative(movie.rootFolder.path, strmResult.filePath);
					const fileId = randomUUID();

					// Create movie file record
					await db.insert(movieFiles).values({
						id: fileId,
						movieId,
						relativePath,
						size: stats.size,
						dateAdded: new Date().toISOString(),
						sceneName: title,
						releaseGroup: parsedRelease.releaseGroup ?? 'NZB',
						quality,
						mediaInfo
					});

					// Update movie hasFile flag
					await db.update(movies).set({ hasFile: true }).where(eq(movies.id, movieId));

					// Create history record
					await db.insert(downloadHistory).values({
						title,
						indexerId,
						indexerName,
						protocol: 'usenet',
						movieId,
						status: 'streaming',
						size: mount.totalSize,
						quality,
						importedPath: strmResult.filePath,
						movieFileId: fileId,
						grabbedAt: new Date().toISOString(),
						importedAt: new Date().toISOString()
					});

					createdFiles.push(fileId);
				}
			}
		} else if (mediaType === 'tv' && seriesId) {
			// Get series for file path calculation
			const show = await db.query.series.findFirst({
				where: eq(series.id, seriesId),
				with: { rootFolder: true }
			});

			if (!show || !show.rootFolder) {
				return json(
					{ success: false, error: 'Series or root folder not found' } satisfies GrabResponse,
					{ status: 404 }
				);
			}
			const allowStrmProbe = show.scoringProfileId !== 'streamer';

			// For each media file, try to match it to an episode
			for (const mediaFile of mount.mediaFiles) {
				// Parse the media file name to extract season/episode
				const fileParsed = parser.parse(mediaFile.name);
				const season = fileParsed.episode?.season ?? seasonNumber;
				const episode = fileParsed.episode?.episodes?.[0];

				if (season === undefined || episode === undefined) {
					logger.debug('[Grab] Could not determine episode for NZB file', {
						fileName: mediaFile.name,
						season,
						episode
					});
					continue;
				}

				// Find the episode
				const episodeRow = await db.query.episodes.findFirst({
					where: and(
						eq(episodes.seriesId, seriesId),
						eq(episodes.seasonNumber, season),
						eq(episodes.episodeNumber, episode)
					)
				});

				if (!episodeRow) {
					logger.debug('[Grab] Episode not found for NZB file', {
						fileName: mediaFile.name,
						season,
						episode
					});
					continue;
				}

				// Create .strm file
				const strmResult = await strmService.createNzbStrmFile({
					mountId: mount.id,
					fileIndex: mediaFile.index,
					seriesId,
					seasonNumber: season,
					episodeId: episodeRow.id,
					baseUrl
				});

				if (strmResult.success && strmResult.filePath) {
					const stats = statSync(strmResult.filePath);
					const mediaInfo = await mediaInfoService.extractMediaInfo(strmResult.filePath, {
						allowStrmProbe
					});
					const relativePath = relative(show.rootFolder.path, strmResult.filePath);
					// Create/update episode file record
					const fileId = await upsertEpisodeFileByPath({
						seriesId,
						seasonNumber: season,
						episodeIds: [episodeRow.id],
						relativePath,
						size: stats.size,
						dateAdded: new Date().toISOString(),
						sceneName: title,
						releaseGroup: parsedRelease.releaseGroup ?? 'NZB',
						quality,
						mediaInfo
					});

					// Update episode hasFile flag
					await db.update(episodes).set({ hasFile: true }).where(eq(episodes.id, episodeRow.id));

					createdFiles.push(fileId);
				}
			}

			// Create single history record for the grab
			if (createdFiles.length > 0) {
				await db.insert(downloadHistory).values({
					title,
					indexerId,
					indexerName,
					protocol: 'usenet',
					seriesId,
					episodeIds: episodeIds ?? [],
					seasonNumber,
					status: 'streaming',
					size: mount.totalSize,
					quality,
					episodeFileIds: createdFiles,
					grabbedAt: new Date().toISOString(),
					importedAt: new Date().toISOString()
				});
			}
		}

		if (createdFiles.length === 0) {
			return json(
				{ success: false, error: 'Failed to create any .strm files' } satisfies GrabResponse,
				{ status: 500 }
			);
		}

		logger.info('[Grab] Created NZB streaming mount and .strm files', {
			title,
			mountId: mount.id,
			filesCreated: createdFiles.length,
			mediaFiles: mount.mediaFiles.length
		});

		return json({
			success: true,
			data: {
				queueId: mount.id,
				hash: mount.nzbHash,
				clientId: 'nzb-streaming',
				clientName: 'NZB Streaming',
				category: mediaType === 'movie' ? 'movies' : 'tv',
				wasDuplicate: false,
				isUpgrade: false
			}
		} satisfies GrabResponse);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		logger.error('[Grab] Failed to handle NZB streaming grab', {
			title,
			error: message
		});
		return json({ success: false, error: message } satisfies GrabResponse, { status: 500 });
	}
}
