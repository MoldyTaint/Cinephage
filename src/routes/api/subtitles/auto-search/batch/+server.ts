import type { RequestHandler } from './$types.js';
import { getSubtitleSearchService } from '$lib/server/subtitles/services/SubtitleSearchService.js';
import { getSubtitleDownloadService } from '$lib/server/subtitles/services/SubtitleDownloadService.js';
import { LanguageProfileService } from '$lib/server/subtitles/services/LanguageProfileService.js';
import { db } from '$lib/server/db/index.js';
import { episodes, series, movies } from '$lib/server/db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { subtitleBatchAutoSearchSchema } from '$lib/validation/schemas.js';
import type { SubtitleBatchAutoSearchRequest } from '$lib/validation/schemas.js';
import { parseBody } from '$lib/server/api/validate.js';
import { createSSEOperationStream } from '$lib/server/sse.js';
import { logger } from '$lib/logging/index.js';
import type { SubtitleSearchResult } from '$lib/server/subtitles/types.js';

interface BatchProgressEvent {
	current: number;
	total: number;
	episodeId?: string;
	movieId?: string;
	title: string;
	status: 'searching' | 'downloaded' | 'not_found' | 'error';
	seasonNumber?: number;
	episodeNumber?: number;
	subtitle?: {
		language: string;
		matchScore: number;
		providerName: string;
	};
}

interface BatchCompletedEvent {
	success: boolean;
	total: number;
	downloaded: number;
	notFound: number;
	errors: number;
	error?: string;
}

function getLanguages(
	profile:
		| {
				languages: Array<{ code: string }>;
		  }
		| undefined
): string[] {
	if (profile && profile.languages && profile.languages.length > 0) {
		return profile.languages.map((l) => l.code);
	}
	return ['en'];
}

async function autoSearchAndDownloadEpisode(episodeId: string): Promise<{
	downloaded: boolean;
	subtitle?: { language: string; matchScore: number; providerName: string };
}> {
	const searchService = getSubtitleSearchService();
	const downloadService = getSubtitleDownloadService();
	const profileService = LanguageProfileService.getInstance();

	const episode = await db.query.episodes.findFirst({
		where: eq(episodes.id, episodeId)
	});
	if (!episode) return { downloaded: false };

	const seriesData = await db.query.series.findFirst({
		where: eq(series.id, episode.seriesId)
	});
	if (!seriesData) return { downloaded: false };

	const profile = await profileService.getProfileForSeries(seriesData.id);
	const languages = getLanguages(profile);
	const minScore = profile?.minimumScore ?? 60;

	const searchResults = await searchService.searchForEpisode(episodeId, languages);

	if (!searchResults.results || searchResults.results.length === 0) {
		return { downloaded: false };
	}

	const bestResult = searchResults.results
		.filter((r: SubtitleSearchResult) => r.matchScore >= minScore)
		.sort((a: SubtitleSearchResult, b: SubtitleSearchResult) => b.matchScore - a.matchScore)[0];

	if (!bestResult) {
		return { downloaded: false };
	}

	await downloadService.downloadForEpisode(episodeId, bestResult);

	return {
		downloaded: true,
		subtitle: {
			language: bestResult.language,
			matchScore: bestResult.matchScore,
			providerName: bestResult.providerName
		}
	};
}

async function autoSearchAndDownloadMovie(movieId: string): Promise<{
	downloaded: boolean;
	subtitle?: { language: string; matchScore: number; providerName: string };
}> {
	const searchService = getSubtitleSearchService();
	const downloadService = getSubtitleDownloadService();
	const profileService = LanguageProfileService.getInstance();

	const movie = await db.query.movies.findFirst({
		where: eq(movies.id, movieId)
	});
	if (!movie) return { downloaded: false };

	const profile = await profileService.getProfileForMovie(movieId);
	const languages = getLanguages(profile);
	const minScore = profile?.minimumScore ?? 60;

	const searchResults = await searchService.searchForMovie(movieId, languages);

	if (!searchResults.results || searchResults.results.length === 0) {
		return { downloaded: false };
	}

	const bestResult = searchResults.results
		.filter((r: SubtitleSearchResult) => r.matchScore >= minScore)
		.sort((a: SubtitleSearchResult, b: SubtitleSearchResult) => b.matchScore - a.matchScore)[0];

	if (!bestResult) {
		return { downloaded: false };
	}

	await downloadService.downloadForMovie(movieId, bestResult);

	return {
		downloaded: true,
		subtitle: {
			language: bestResult.language,
			matchScore: bestResult.matchScore,
			providerName: bestResult.providerName
		}
	};
}

interface EpisodeBatchItem {
	id: string;
	title: string;
	seasonNumber: number;
	episodeNumber: number;
}

interface MovieBatchItem {
	id: string;
	title: string;
}

type BatchItem = EpisodeBatchItem | MovieBatchItem;

function isEpisodeItem(item: BatchItem): item is EpisodeBatchItem {
	return 'seasonNumber' in item;
}

async function resolveEpisodeItems(
	body: SubtitleBatchAutoSearchRequest
): Promise<EpisodeBatchItem[]> {
	switch (body.type) {
		case 'season': {
			const eps = await db
				.select()
				.from(episodes)
				.where(
					and(eq(episodes.seriesId, body.seriesId), eq(episodes.seasonNumber, body.seasonNumber))
				);
			return eps.map((ep) => ({
				id: ep.id,
				title: ep.title || `Episode ${ep.episodeNumber}`,
				seasonNumber: ep.seasonNumber,
				episodeNumber: ep.episodeNumber
			}));
		}
		case 'series': {
			const profileService = LanguageProfileService.getInstance();
			const missingIds = await profileService.getSeriesEpisodesMissingSubtitles(body.seriesId);
			const eps = await db.select().from(episodes).where(eq(episodes.seriesId, body.seriesId));
			const missingSet = new Set(missingIds);
			return eps
				.filter((ep) => missingSet.has(ep.id))
				.map((ep) => ({
					id: ep.id,
					title: ep.title || `Episode ${ep.episodeNumber}`,
					seasonNumber: ep.seasonNumber,
					episodeNumber: ep.episodeNumber
				}));
		}
		case 'episodes': {
			const eps = await db.select().from(episodes).where(inArray(episodes.id, body.episodeIds));
			const episodesById = new Map(eps.map((ep) => [ep.id, ep]));
			return body.episodeIds
				.map((id) => {
					const ep = episodesById.get(id);
					if (!ep) return null;
					return {
						id: ep.id,
						title: ep.title || `Episode ${ep.episodeNumber}`,
						seasonNumber: ep.seasonNumber,
						episodeNumber: ep.episodeNumber
					};
				})
				.filter((item): item is EpisodeBatchItem => item !== null);
		}
		default:
			return [];
	}
}

async function resolveMovieItems(body: SubtitleBatchAutoSearchRequest): Promise<MovieBatchItem[]> {
	if (body.type !== 'collection') return [];

	const collectionMovies = await db
		.select()
		.from(movies)
		.where(eq(movies.tmdbCollectionId, body.collectionId));
	return collectionMovies.map((m) => ({
		id: m.id,
		title: m.title
	}));
}

/**
 * POST /api/subtitles/auto-search/batch
 * Batch auto-search and download subtitles for seasons, series, collections, or selected episodes.
 * Returns SSE stream for real-time progress.
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await parseBody(request, subtitleBatchAutoSearchSchema);

		return createSSEOperationStream(
			request,
			async ({ send, close, isAborted }) => {
				const sendEvent = (event: string, data: unknown) => {
					if (isAborted()) return;
					send(event, data);
				};

				const isMovie = body.type === 'collection';
				const items: BatchItem[] = isMovie
					? await resolveMovieItems(body)
					: await resolveEpisodeItems(body);

				if (items.length === 0) {
					sendEvent('subtitle:completed', {
						success: true,
						total: 0,
						downloaded: 0,
						notFound: 0,
						errors: 0
					} satisfies BatchCompletedEvent);
					close();
					return;
				}

				sendEvent('subtitle:started', { total: items.length, type: body.type });

				let downloaded = 0;
				let notFound = 0;
				let errors = 0;

				for (let i = 0; i < items.length; i++) {
					if (isAborted()) return;

					const item = items[i];
					const isEpisode = isEpisodeItem(item);

					sendEvent('subtitle:progress', {
						current: i + 1,
						total: items.length,
						episodeId: isEpisode ? item.id : undefined,
						movieId: !isEpisode ? item.id : undefined,
						title: item.title,
						status: 'searching',
						seasonNumber: isEpisode ? item.seasonNumber : undefined,
						episodeNumber: isEpisode ? item.episodeNumber : undefined
					} satisfies BatchProgressEvent);

					try {
						const result = isEpisode
							? await autoSearchAndDownloadEpisode(item.id)
							: await autoSearchAndDownloadMovie(item.id);

						if (result.downloaded) {
							downloaded++;
							sendEvent('subtitle:progress', {
								current: i + 1,
								total: items.length,
								episodeId: isEpisode ? item.id : undefined,
								movieId: !isEpisode ? item.id : undefined,
								title: item.title,
								status: 'downloaded',
								seasonNumber: isEpisode ? item.seasonNumber : undefined,
								episodeNumber: isEpisode ? item.episodeNumber : undefined,
								subtitle: result.subtitle
							} satisfies BatchProgressEvent);
						} else {
							notFound++;
							sendEvent('subtitle:progress', {
								current: i + 1,
								total: items.length,
								episodeId: isEpisode ? item.id : undefined,
								movieId: !isEpisode ? item.id : undefined,
								title: item.title,
								status: 'not_found',
								seasonNumber: isEpisode ? item.seasonNumber : undefined,
								episodeNumber: isEpisode ? item.episodeNumber : undefined
							} satisfies BatchProgressEvent);
						}
					} catch (error) {
						errors++;
						logger.error(
							{
								itemId: item.id,
								title: item.title,
								error: error instanceof Error ? error.message : String(error)
							},
							'[SubtitleBatch] Failed to auto-search subtitle'
						);
						sendEvent('subtitle:progress', {
							current: i + 1,
							total: items.length,
							episodeId: isEpisode ? item.id : undefined,
							movieId: !isEpisode ? item.id : undefined,
							title: item.title,
							status: 'error',
							seasonNumber: isEpisode ? item.seasonNumber : undefined,
							episodeNumber: isEpisode ? item.episodeNumber : undefined
						} satisfies BatchProgressEvent);
					}

					if (i < items.length - 1) {
						await new Promise((resolve) => setTimeout(resolve, 1000));
					}
				}

				sendEvent('subtitle:completed', {
					success: true,
					total: items.length,
					downloaded,
					notFound,
					errors
				} satisfies BatchCompletedEvent);
			},
			{ heartbeatInterval: 25000 }
		);
	} catch (error) {
		logger.error(
			'[SubtitleBatch] Batch auto-search error',
			error instanceof Error ? error : undefined
		);
		return new Response(
			JSON.stringify({
				success: false,
				error:
					error instanceof Error ? error.message : 'Failed to perform batch subtitle auto-search'
			}),
			{ status: 500, headers: { 'Content-Type': 'application/json' } }
		);
	}
};
