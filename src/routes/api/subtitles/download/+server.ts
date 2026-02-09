import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSubtitleDownloadService } from '$lib/server/subtitles/services/SubtitleDownloadService';
import { subtitleDownloadSchema } from '$lib/validation/schemas';
import { db } from '$lib/server/db';
import { movies, episodes } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { SubtitleSearchResult, SubtitleFormat } from '$lib/server/subtitles/types';
import { libraryMediaEvents } from '$lib/server/library/LibraryMediaEvents';

/**
 * POST /api/subtitles/download
 * Download a subtitle from a provider.
 */
export const POST: RequestHandler = async ({ request }) => {
	let data: unknown;
	try {
		data = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const result = subtitleDownloadSchema.safeParse(data);

	if (!result.success) {
		return json(
			{
				error: 'Validation failed',
				details: result.error.flatten()
			},
			{ status: 400 }
		);
	}

	const validated = result.data;
	const downloadService = getSubtitleDownloadService();

	try {
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

			if (!movie) {
				return json({ error: 'Movie not found' }, { status: 404 });
			}

			const downloadResult = await downloadService.downloadForMovie(
				validated.movieId,
				searchResult
			);
			libraryMediaEvents.emitMovieUpdated(validated.movieId);

			return json({
				success: true,
				subtitle: downloadResult
			});
		}

		// Download for episode
		if (validated.episodeId) {
			const episode = await db.query.episodes.findFirst({
				where: eq(episodes.id, validated.episodeId)
			});

			if (!episode) {
				return json({ error: 'Episode not found' }, { status: 404 });
			}

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
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json({ error: message }, { status: 500 });
	}
};
