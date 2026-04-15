import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSubtitleDownloadService } from '$lib/server/subtitles/services/SubtitleDownloadService';
import { subtitleDownloadSchema } from '$lib/validation/schemas';
import { db } from '$lib/server/db';
import { movies, episodes } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { SubtitleSearchResult, SubtitleFormat } from '$lib/server/subtitles/types';
import { libraryMediaEvents } from '$lib/server/library/LibraryMediaEvents';
import { parseBody, assertFound } from '$lib/server/api/validate.js';

/**
 * POST /api/subtitles/download
 * Download a subtitle from a provider.
 */
export const POST: RequestHandler = async ({ request }) => {
	const validated = await parseBody(request, subtitleDownloadSchema);
	const downloadService = getSubtitleDownloadService();

	// Build a minimal search result object for the download service
	const searchResult: SubtitleSearchResult = {
		providerId: validated.providerId,
		providerName: 'Unknown', // Will be resolved by download service
		providerSubtitleId: validated.providerSubtitleId,
		language: validated.language,
		title: 'Downloaded subtitle',
		isForced: validated.isForced,
		isHearingImpaired: validated.isHearingImpaired,
		format: 'srt' as SubtitleFormat, // Will be determined by actual file
		isHashMatch: false,
		matchScore: 0
	};

	// Download for movie
	if (validated.movieId) {
		const movie = await db.query.movies.findFirst({
			where: eq(movies.id, validated.movieId)
		});

		assertFound(movie, 'Movie', validated.movieId);

		const downloadResult = await downloadService.downloadForMovie(validated.movieId, searchResult);
		libraryMediaEvents.emitMovieUpdated(validated.movieId);

		return json({
			success: true,
			subtitle: downloadResult
		});
	}

	// Download for episode
	if (validated.episodeId) {
		const episode = assertFound(
			await db.query.episodes.findFirst({
				where: eq(episodes.id, validated.episodeId)
			}),
			'Episode',
			validated.episodeId
		);

		const downloadResult = await downloadService.downloadForEpisode(
			validated.episodeId,
			searchResult
		);
		libraryMediaEvents.emitSeriesUpdated(episode.seriesId);

		return json({
			success: true,
			subtitle: downloadResult
		});
	}

	return json({ error: 'Either movieId or episodeId is required' }, { status: 400 });
};
