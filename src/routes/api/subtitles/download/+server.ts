import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSubtitleDownloadService } from '$lib/server/subtitles/services/SubtitleDownloadService';
import { subtitleDownloadSchema } from '$lib/validation/schemas';
import { db } from '$lib/server/db';
import { movies, episodes } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { SubtitleSearchResult } from '$lib/server/subtitles/types';
import { libraryMediaEvents } from '$lib/server/library/LibraryMediaEvents';
import { parseBody, assertFound } from '$lib/server/api/validate.js';

/**
 * POST /api/subtitles/download
 * Download a subtitle from a provider.
 *
 * The body is the full search result selected in the interactive modal. It is
 * forwarded verbatim (minus the media ids) to the download service, which owns
 * format detection, atomic writes, history and media-server notification. In
 * particular `downloadUrl`/`pageLink` must survive: providers such as
 * BetaSeries need a direct download URL that is not reconstructible from ids.
 */
export const POST: RequestHandler = async ({ request }) => {
	const validated = await parseBody(request, subtitleDownloadSchema);
	const downloadService = getSubtitleDownloadService();

	const searchResult: SubtitleSearchResult = {
		providerId: validated.providerId,
		providerName: validated.providerName,
		providerSubtitleId: validated.providerSubtitleId,
		language: validated.language,
		title: validated.title,
		releaseName: validated.releaseName,
		fileName: validated.fileName,
		isForced: validated.isForced,
		isHearingImpaired: validated.isHearingImpaired,
		format: validated.format,
		isHashMatch: validated.isHashMatch,
		matchScore: validated.matchScore,
		downloadUrl: validated.downloadUrl,
		pageLink: validated.pageLink,
		fileSize: validated.fileSize,
		uploadDate: validated.uploadDate,
		downloadCount: validated.downloadCount,
		movieFileId: validated.movieFileId
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
