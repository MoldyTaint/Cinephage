import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth/authorization.js';
import { grabService } from '$lib/server/downloads/GrabService.js';
import { parseBody } from '$lib/server/api/validate.js';
import { grabRequestSchema } from '$lib/validation/schemas.js';
import type { GrabResponse } from '$lib/types/queue';
import type { GrabRequest as ServiceGrabRequest } from '$lib/server/downloads/grab-types.js';
import type { GrabTarget } from '$lib/server/filters/stages/grab/types.js';
import { categoryMatchesSearchType, getCategoryContentType } from '$lib/server/indexers/types';
import { ReleaseParser } from '$lib/server/indexers/parser/ReleaseParser.js';
import { db } from '$lib/server/db';
import { series } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '$lib/logging';

const parser = new ReleaseParser();

export const POST: RequestHandler = async (event) => {
	const authError = requireAuth(event);
	if (authError) return authError;

	const data = await parseBody(event.request, grabRequestSchema);

	if (data.categories && data.categories.length > 0) {
		const searchType = data.mediaType === 'movie' ? 'movie' : 'tv';
		const hasMatchingCategory = data.categories.some((cat) =>
			categoryMatchesSearchType(cat, searchType)
		);

		if (!hasMatchingCategory) {
			const actualContentType = getCategoryContentType(data.categories[0]);
			logger.error(
				{
					title: data.title,
					expectedType: data.mediaType,
					actualContentType,
					categories: data.categories
				},
				'[Grab] BLOCKED: Release category mismatch - potential wrong content type'
			);
			return json(
				{
					success: false,
					error: `Category mismatch: ${actualContentType} release cannot be grabbed for ${data.mediaType}`
				} satisfies GrabResponse,
				{ status: 422 }
			);
		}
	}

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

			const titlesMatch =
				parsedTitle === targetTitle ||
				(parsedTitle.length > 3 && targetTitle.includes(parsedTitle)) ||
				(targetTitle.length > 3 && parsedTitle.includes(targetTitle));

			if (!titlesMatch && parsedTitle.length > 0) {
				logger.error(
					{
						releaseTitle: data.title,
						parsedTitle: parsed.cleanTitle,
						normalizedParsed: parsedTitle,
						targetTitle: targetSeries[0].title,
						normalizedTarget: targetTitle,
						seriesId: data.seriesId
					},
					'[Grab] BLOCKED: Release title does not match target series'
				);
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

	const force = data.isAutomatic ? (data.force ?? false) : (data.force ?? true);

	const target = buildTarget(data);

	const serviceRequest: ServiceGrabRequest = {
		release: {
			title: data.title,
			downloadUrl: data.downloadUrl,
			magnetUrl: data.magnetUrl,
			infoHash: data.infoHash,
			indexerId: data.indexerId,
			indexerName: data.indexerName,
			size: data.size,
			protocol: data.protocol as 'torrent' | 'usenet' | 'streaming' | undefined,
			guid: data.guid,
			commentsUrl: data.commentsUrl,
			categories: data.categories,
			releaseGroup: undefined
		},
		target,
		options: {
			force,
			skipBlocklist: false,
			allowSidegrade: false,
			isAutomatic: data.isAutomatic ?? false,
			downloadClientId: undefined,
			isUpgrade: data.isUpgrade,
			streamUsenet: data.streamUsenet
		}
	};

	let result:
		| {
				success: false;
				decision: Awaited<ReturnType<typeof grabService.grab>>['decision'];
				error: string;
		  }
		| Awaited<ReturnType<typeof grabService.grab>>;
	try {
		result = await grabService.grab(serviceRequest);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		logger.error({ error: message, title: data.title }, 'Failed to grab release');
		return json({ success: false, error: message } satisfies GrabResponse, { status: 500 });
	}

	if (!result.success) {
		if (result.error) {
			return json(
				{
					success: false,
					error: result.error,
					decision: result.decision
				} satisfies GrabResponse,
				{ status: 500 }
			);
		}

		return json(
			{
				success: false,
				error: result.decision.reason || 'Release does not meet requirements',
				rejectionType: result.decision.rejectionType,
				decision: result.decision
			} satisfies GrabResponse,
			{ status: 422 }
		);
	}

	return json({
		success: true,
		data: {
			...result.download!,
			hash: result.download!.hash ?? ''
		},
		decision: result.decision
	} satisfies GrabResponse);
};

function buildTarget(data: {
	movieId?: string;
	seriesId?: string;
	episodeIds?: string[];
	seasonNumber?: number;
}): GrabTarget {
	if (data.movieId) {
		return { type: 'movie', movieId: data.movieId };
	}

	const seriesId = data.seriesId!;

	if (data.seasonNumber != null && (!data.episodeIds || data.episodeIds.length === 0)) {
		return { type: 'season', seriesId, seasonNumber: data.seasonNumber, episodeIds: [] };
	}

	if (data.episodeIds && data.episodeIds.length === 1) {
		return { type: 'episode', episodeId: data.episodeIds[0], seriesId };
	}

	if (data.episodeIds && data.episodeIds.length > 1 && data.seasonNumber != null) {
		return {
			type: 'season',
			seriesId,
			seasonNumber: data.seasonNumber,
			episodeIds: data.episodeIds
		};
	}

	return { type: 'series', seriesId, episodeIds: data.episodeIds ?? [] };
}
