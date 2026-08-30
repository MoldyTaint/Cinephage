import { randomUUID } from 'node:crypto';
import { grabDecisionPipeline } from '$lib/server/filters/GrabDecisionPipeline.js';
import { qualityFilter } from '$lib/server/quality/QualityFilter.js';
import { db } from '$lib/server/db/index.js';
import {
	movies,
	series,
	episodes,
	movieFiles,
	episodeFiles,
	rootFolders,
	rejectedReleases
} from '$lib/server/db/schema.js';
import { and, eq, ne } from 'drizzle-orm';
import type { GrabRequest, GrabResult, ResolvedContext, HandlerResult } from './grab-types.js';
import type { GrabDecisionContext, ExistingFile } from '$lib/server/filters/stages/grab/types.js';
import { mediaOccupancyService } from '$lib/server/acquisition/MediaOccupancyService.js';
import { TorrentHandler } from './handlers/TorrentHandler.js';
import { UsenetHandler } from './handlers/UsenetHandler.js';
import { StreamingHandler } from './handlers/StreamingHandler.js';
import { NzbStreamingHandler } from './handlers/NzbStreamingHandler.js';
import { DebridHandler } from './handlers/DebridHandler.js';
import { getDefaultAcquisitionProtocol } from '$lib/server/settings/acquisition.js';
import { createChildLogger, getRequestId } from '$lib/logging/index.js';
import { grabRejectionLogLevel } from './grab-rejection-log-level.js';

const logger = createChildLogger({ module: 'GrabService', logDomain: 'downloads' });

class GrabServiceImpl {
	private static instance: GrabServiceImpl;

	static getInstance(): GrabServiceImpl {
		if (!GrabServiceImpl.instance) {
			GrabServiceImpl.instance = new GrabServiceImpl();
		}
		return GrabServiceImpl.instance;
	}

	async grab(request: GrabRequest, opts?: { forceOverride?: boolean }): Promise<GrabResult> {
		return mediaOccupancyService.runExclusive(request.target, () =>
			this.grabUnlocked(request, opts?.forceOverride ?? false)
		);
	}

	private async grabUnlocked(request: GrabRequest, forceOverride = false): Promise<GrabResult> {
		const { release, target, options } = request;

		const resolved = await this.resolveTarget(request);

		// When force-overriding, skip the decision pipeline entirely
		if (forceOverride) {
			const handlerResult = await this.routeByProtocol(request, resolved);
			if (!handlerResult.success) {
				logger.error(
					{ title: release.title, error: handlerResult.error },
					'[Grab] Override handler failed'
				);
				return {
					success: false,
					decision: {
						accepted: false,
						reason: handlerResult.error ?? 'Handler failed',
						upgradeStatus: 'rejected',
						scores: { candidate: 0 },
						audit: { stages: [], finalResult: { accepted: false }, totalDurationMs: 0 }
					},
					error: handlerResult.error
				};
			}
			return {
				success: true,
				decision: {
					accepted: true,
					reason: 'force_override',
					upgradeStatus: 'new',
					scores: { candidate: 0 },
					audit: { stages: [], finalResult: { accepted: true }, totalDurationMs: 0 }
				},
				download: {
					queueId: handlerResult.queueId!,
					hash: handlerResult.hash,
					clientId: handlerResult.clientId!,
					clientName: handlerResult.clientName!,
					category: handlerResult.category ?? (resolved.mediaType === 'movie' ? 'movies' : 'tv'),
					addedToQueue: handlerResult.wasDuplicate !== true,
					wasDuplicate: handlerResult.wasDuplicate ?? false,
					isUpgrade: false
				}
			};
		}

		const existingFiles = await this.getExistingFiles(request);

		const ctx: GrabDecisionContext = {
			release,
			target,
			existingFiles,
			profile: resolved.profile,
			options,
			desiredQualities: resolved.desiredQualities,
			computed: {}
		};

		const decision = await grabDecisionPipeline.evaluate(ctx);

		if (!decision.accepted) {
			const rejectionCtx = {
				title: release.title,
				rejectionType: decision.rejectionType,
				reason: decision.reason,
				stage: decision.audit.stages.find((s) => !s.skipped && s.result && !s.result.accepted)
					?.name,
				indexerId: release.indexerId,
				indexerName: release.indexerName,
				protocol: release.protocol,
				mediaType: resolved.mediaType,
				candidateScore: decision.scores.candidate,
				existingScore: decision.scores.existing,
				isAutomatic: options.isAutomatic,
				target
			};
			const level = grabRejectionLogLevel(options.isAutomatic);
			if (level === 'warn') {
				logger.warn(rejectionCtx, '[Grab] Release rejected');
			} else {
				logger.debug(rejectionCtx, '[Grab] Release rejected (automated search)');
			}

			// Persist rejection for diagnostic reports (fire-and-forget)
			this.persistRejectedRelease(release, resolved, decision).catch((err) =>
				logger.warn({ err }, '[Grab] Failed to persist rejected release record')
			);

			return { success: false, decision };
		}

		const handlerResult = await this.routeByProtocol(request, resolved);

		if (!handlerResult.success) {
			logger.error(
				{
					title: release.title,
					error: handlerResult.error,
					protocol: release.protocol,
					indexerId: release.indexerId,
					isAutomatic: options.isAutomatic
				},
				'[Grab] Handler failed to add release to download client'
			);
			return { success: false, decision, error: handlerResult.error };
		}

		return {
			success: true,
			decision,
			download: {
				queueId: handlerResult.queueId!,
				hash: handlerResult.hash,
				clientId: handlerResult.clientId!,
				clientName: handlerResult.clientName!,
				category: handlerResult.category ?? (resolved.mediaType === 'movie' ? 'movies' : 'tv'),
				addedToQueue: handlerResult.wasDuplicate !== true,
				wasDuplicate: handlerResult.wasDuplicate ?? false,
				isUpgrade: decision.upgradeStatus === 'upgrade'
			}
		};
	}

	private async resolveTarget(request: GrabRequest): Promise<ResolvedContext> {
		const { target } = request;
		let profileId: string | null;
		let rootFolderId: string | null;
		let mediaPath: string | undefined;
		let movieId: string | undefined;
		let seriesId: string | undefined;
		let episodeIds: string[] | undefined;
		let seasonNumber: number | undefined;
		let mediaType: 'movie' | 'tv' = 'movie';
		let movieDesiredQualities: ResolvedContext['desiredQualities'];

		if (target.type === 'movie') {
			const movie = await db.query.movies.findFirst({ where: eq(movies.id, target.movieId) });
			if (!movie) throw new Error(`Movie not found: ${target.movieId}`);
			profileId = movie.scoringProfileId;
			rootFolderId = movie.rootFolderId;
			mediaPath = movie.path ?? undefined;
			movieId = movie.id;
			movieDesiredQualities = movie.desiredQualities ?? undefined;
		} else {
			seriesId = 'seriesId' in target ? target.seriesId : undefined;
			const show = seriesId
				? await db.query.series.findFirst({ where: eq(series.id, seriesId) })
				: null;
			if (!show && seriesId) throw new Error(`Series not found: ${seriesId}`);
			profileId = show?.scoringProfileId ?? null;
			rootFolderId = show?.rootFolderId ?? null;
			mediaPath = show?.path ?? undefined;
			mediaType = 'tv';

			if (target.type === 'episode') {
				episodeIds = [target.episodeId];
			} else if (target.type === 'season') {
				seasonNumber = target.seasonNumber;
				episodeIds = target.episodeIds;
			} else {
				episodeIds = target.episodeIds;
				if (episodeIds.length === 0 && seriesId) {
					const conditions = [
						eq(episodes.seriesId, seriesId),
						eq(episodes.hasFile, false),
						ne(episodes.seasonNumber, 0)
					];
					if (request.options.isAutomatic) conditions.push(eq(episodes.monitored, true));
					const missingEpisodes = await db.query.episodes.findMany({
						where: and(...conditions)
					});
					episodeIds = missingEpisodes.map((episode) => episode.id);
				}
			}
		}

		let rootFolderPath: string | undefined;
		if (rootFolderId) {
			const folder = await db.query.rootFolders.findFirst({
				where: eq(rootFolders.id, rootFolderId)
			});
			rootFolderPath = folder?.path ?? undefined;
		}

		const profile = profileId
			? ((await qualityFilter.getProfile(profileId)) ??
				(await qualityFilter.getDefaultScoringProfile()))
			: await qualityFilter.getDefaultScoringProfile();

		return {
			movieId,
			seriesId,
			episodeIds,
			seasonNumber,
			mediaType,
			profile,
			rootFolderPath,
			mediaPath,
			seriesPath: mediaType === 'tv' ? mediaPath : undefined,
			desiredQualities: movieDesiredQualities
		};
	}

	private async getExistingFiles(request: GrabRequest): Promise<ExistingFile[]> {
		const { target } = request;

		if (target.type === 'movie') {
			const files = await db.query.movieFiles.findMany({
				where: eq(movieFiles.movieId, target.movieId)
			});
			return files.map((f) => ({
				id: f.id,
				relativePath: f.relativePath,
				sceneName: f.sceneName,
				size: f.size,
				quality: f.quality as ExistingFile['quality'],
				releaseGroup: f.releaseGroup
			}));
		}

		const seriesId = 'seriesId' in target ? target.seriesId : undefined;
		if (!seriesId) return [];

		const files = await db.query.episodeFiles.findMany({
			where: eq(episodeFiles.seriesId, seriesId)
		});

		if (target.type === 'episode') {
			return files
				.filter((f) => f.episodeIds?.includes(target.episodeId))
				.map((f) => ({
					id: f.id,
					relativePath: f.relativePath,
					sceneName: f.sceneName,
					size: f.size,
					quality: f.quality as ExistingFile['quality'],
					releaseGroup: f.releaseGroup,
					episodeIds: f.episodeIds
				}));
		}

		if (target.type === 'season' || target.type === 'series') {
			const episodeIdSet = new Set(target.episodeIds);
			return files
				.filter((f) => f.episodeIds?.some((id) => episodeIdSet.has(id)))
				.map((f) => ({
					id: f.id,
					relativePath: f.relativePath,
					sceneName: f.sceneName,
					size: f.size,
					quality: f.quality as ExistingFile['quality'],
					releaseGroup: f.releaseGroup,
					episodeIds: f.episodeIds
				}));
		}

		return files.map((f) => ({
			id: f.id,
			relativePath: f.relativePath,
			sceneName: f.sceneName,
			size: f.size,
			quality: f.quality as ExistingFile['quality'],
			releaseGroup: f.releaseGroup,
			episodeIds: f.episodeIds
		}));
	}

	private async routeByProtocol(
		request: GrabRequest,
		resolved: ResolvedContext
	): Promise<HandlerResult> {
		const protocol = request.release.protocol;
		const requestedAcquisition = request.options.acquisitionProtocol;

		if (requestedAcquisition === 'debrid' && protocol !== 'torrent') {
			return {
				success: false,
				error: 'Debrid acquisition requires a torrent release'
			};
		}

		if (protocol === 'torrent') {
			const acquisitionProtocol =
				requestedAcquisition === 'default'
					? getDefaultAcquisitionProtocol()
					: (requestedAcquisition ??
						(request.options.isAutomatic ? getDefaultAcquisitionProtocol() : 'torrent'));

			if (acquisitionProtocol === 'debrid') {
				return new DebridHandler().handle(request, resolved);
			}
		}

		switch (protocol) {
			case 'torrent': {
				const handler = new TorrentHandler();
				return handler.handle(request, resolved);
			}
			case 'usenet': {
				if (request.options.streamUsenet) {
					const handler = new NzbStreamingHandler();
					return handler.handle(request, resolved);
				}
				const handler = new UsenetHandler();
				return handler.handle(request, resolved);
			}
			case 'streaming': {
				const handler = new StreamingHandler();
				return handler.handle(request, resolved);
			}
			default:
				logger.error(
					{ protocol, title: request.release.title },
					'Unknown or missing protocol in grab request'
				);
				return {
					success: false,
					error: `Unknown protocol: ${protocol ?? 'undefined'}`
				};
		}
	}

	private async persistRejectedRelease(
		release: GrabRequest['release'],
		resolved: ResolvedContext,
		decision: import('./grab-types.js').GrabResult['decision']
	): Promise<void> {
		// Resolve tmdbId from the linked movie or series
		let tmdbId: number | undefined;
		let mediaTitle: string | undefined;
		if (resolved.movieId) {
			const movie = await db.query.movies.findFirst({ where: eq(movies.id, resolved.movieId) });
			tmdbId = movie?.tmdbId ?? undefined;
			mediaTitle = movie?.title ?? undefined;
		} else if (resolved.seriesId) {
			const show = await db.query.series.findFirst({ where: eq(series.id, resolved.seriesId) });
			tmdbId = show?.tmdbId ?? undefined;
			mediaTitle = show?.title ?? undefined;
		}

		const rejectingStage = decision?.audit?.stages?.find(
			(s) => !s.skipped && s.result && !s.result.accepted
		);

		// Build structured rejection checks from all evaluated stages
		const rejectionReasons = decision?.audit?.stages
			?.filter((s) => !s.skipped && s.result != null)
			.map((s) => ({
				type: s.name,
				rule: s.result?.reason ?? s.name,
				passed: s.result?.accepted ?? true,
				detail: s.result?.details ? JSON.stringify(s.result.details) : undefined
			}));

		// Derive primary_reason category from the rejection type
		const primaryReason = (() => {
			switch (decision?.rejectionType) {
				case 'missing_required_format':
				case 'banned':
					return 'required_format_mismatch';
				case 'below_minimum':
				case 'not_upgrade':
				case 'upgrades_disabled':
				case 'size_rejected':
					return 'quality_profile_mismatch';
				case 'pending_delay':
					return 'delay_profile_pending';
				default:
					return decision?.rejectionType ?? 'other';
			}
		})();

		await db.insert(rejectedReleases).values({
			id: randomUUID(),
			correlationId: getRequestId() ?? randomUUID(),
			releaseTitle: release.title,
			indexerName: release.indexerName ?? undefined,
			protocol: release.protocol ?? undefined,
			tmdbId: tmdbId ?? null,
			mediaType: resolved.mediaType,
			mediaTitle: mediaTitle ?? undefined,
			rejectionReasons:
				rejectionReasons && rejectionReasons.length > 0 ? rejectionReasons : undefined,
			primaryReason,
			ruleFired: rejectingStage?.result?.reason ?? decision?.reason ?? undefined,
			qualityProfileName: resolved.profile?.name ?? undefined,
			releaseSize: release.size ?? undefined,
			releaseGroup: release.releaseGroup ?? undefined,
			// Grab fields for future override
			downloadUrl: release.downloadUrl ?? undefined,
			magnetUrl: release.magnetUrl ?? undefined,
			infoHash: release.infoHash ?? undefined,
			indexerGuid: release.guid ?? undefined,
			indexerId: release.indexerId ?? undefined,
			rejectedAt: new Date().toISOString(),
			status: 'rejected'
		});
	}
}

export const grabService = GrabServiceImpl.getInstance();
export { GrabServiceImpl as GrabService };
