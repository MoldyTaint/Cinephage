import { grabDecisionPipeline } from '$lib/server/filters/GrabDecisionPipeline.js';
import { qualityFilter } from '$lib/server/quality/QualityFilter.js';
import { db } from '$lib/server/db/index.js';
import { movies, series, movieFiles, episodeFiles, rootFolders } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { createChildLogger } from '$lib/logging/index.js';
import type { GrabRequest, GrabResult, ResolvedContext, HandlerResult } from './grab-types.js';
import type { GrabDecisionContext, ExistingFile } from '$lib/server/filters/stages/grab/types.js';

const logger = createChildLogger({ module: 'GrabService' });

class GrabServiceImpl {
	private static instance: GrabServiceImpl;

	static getInstance(): GrabServiceImpl {
		if (!GrabServiceImpl.instance) {
			GrabServiceImpl.instance = new GrabServiceImpl();
		}
		return GrabServiceImpl.instance;
	}

	async grab(request: GrabRequest): Promise<GrabResult> {
		const { release, target, options } = request;

		const resolved = await this.resolveTarget(request);
		const existingFiles = await this.getExistingFiles(request);

		const ctx: GrabDecisionContext = {
			release,
			target,
			existingFiles,
			profile: resolved.profile,
			options,
			computed: {}
		};

		const decision = await grabDecisionPipeline.evaluate(ctx);

		if (!decision.accepted) {
			return { success: false, decision };
		}

		const handlerResult = await this.routeByProtocol(request, resolved);

		if (!handlerResult.success) {
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
				wasDuplicate: handlerResult.wasDuplicate ?? false,
				isUpgrade: decision.upgradeStatus === 'upgrade'
			}
		};
	}

	private async resolveTarget(request: GrabRequest): Promise<ResolvedContext> {
		const { target } = request;
		let profileId: string | null = null;
		let rootFolderId: string | null = null;
		let mediaPath: string | undefined;
		let movieId: string | undefined;
		let seriesId: string | undefined;
		let episodeIds: string[] | undefined;
		let seasonNumber: number | undefined;
		let mediaType: 'movie' | 'tv' = 'movie';

		if (target.type === 'movie') {
			const movie = await db.query.movies.findFirst({ where: eq(movies.id, target.movieId) });
			if (!movie) throw new Error(`Movie not found: ${target.movieId}`);
			profileId = movie.scoringProfileId;
			rootFolderId = movie.rootFolderId;
			mediaPath = movie.path ?? undefined;
			movieId = movie.id;
			mediaType = 'movie';
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
			seriesPath: mediaType === 'tv' ? mediaPath : undefined
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
		_resolved: ResolvedContext
	): Promise<HandlerResult> {
		logger.warn(
			{ protocol: request.release.protocol },
			'[GrabService] Protocol handler not yet implemented'
		);
		return {
			success: false,
			error: `Protocol handler for ${request.release.protocol ?? 'unknown'} not yet implemented`
		};
	}
}

export const grabService = GrabServiceImpl.getInstance();
export { GrabServiceImpl as GrabService };
