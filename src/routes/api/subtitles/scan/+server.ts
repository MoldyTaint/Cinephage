import { json, type RequestEvent } from '@sveltejs/kit';
import { getSubtitleScannerService } from '$lib/server/subtitles/services/SubtitleScannerService';
import { subtitleScanSchema } from '$lib/validation/schemas';
import { parseOptionalBody } from '$lib/server/api/validate.js';

type RequestHandler = (event: RequestEvent) => Promise<Response>;

/**
 * POST /api/subtitles/scan
 * Trigger subtitle discovery scan.
 */
export const POST: RequestHandler = async ({ request }) => {
	const data = await parseOptionalBody(request, subtitleScanSchema);
	const scanner = getSubtitleScannerService();

	if (data.movieId) {
		const result = await scanner.scanMovieSubtitles(data.movieId);
		return json({
			success: true,
			type: 'movie',
			...result
		});
	}

	if (data.seriesId) {
		const result = await scanner.scanSeriesSubtitles(data.seriesId);
		return json({
			success: true,
			type: 'series',
			...result
		});
	}

	if (data.scanAll) {
		const result = await scanner.scanAll();
		return json({
			success: true,
			type: 'all',
			movies: result.movies,
			series: result.series
		});
	}

	return json({ error: 'Specify movieId, seriesId, or scanAll: true' }, { status: 400 });
};
