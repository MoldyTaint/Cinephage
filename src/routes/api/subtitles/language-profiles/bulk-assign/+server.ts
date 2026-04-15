import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { movies, series, episodes } from '$lib/server/db/schema';
import { inArray, and, eq } from 'drizzle-orm';
import { LanguageProfileService } from '$lib/server/subtitles/services/LanguageProfileService';
import { searchSubtitlesForMediaBatch } from '$lib/server/subtitles/services/SubtitleImportService';
import { monitoringScheduler } from '$lib/server/monitoring/MonitoringScheduler';
import { logger } from '$lib/logging';
import { parseBody, assertFound } from '$lib/server/api/validate.js';

/**
 * Schema for bulk profile assignment request
 */
const bulkAssignSchema = z.object({
	/** Target media type */
	mediaType: z.enum(['movie', 'series']),
	/** IDs of media items to update */
	mediaIds: z.array(z.string().uuid()).min(1, 'At least one media ID is required'),
	/** Language profile ID to assign (null to remove profile) */
	languageProfileId: z.string().uuid().nullable(),
	/** Whether to enable subtitle searching for these items */
	wantsSubtitles: z.boolean().optional()
});

/**
 * POST /api/subtitles/language-profiles/bulk-assign
 * Assign a language profile to multiple movies or series at once.
 */
export const POST: RequestHandler = async ({ request }) => {
	const { mediaType, mediaIds, languageProfileId, wantsSubtitles } = await parseBody(
		request,
		bulkAssignSchema
	);

	// Validate profile exists if provided
	if (languageProfileId) {
		const profileService = LanguageProfileService.getInstance();
		const profile = await profileService.getProfile(languageProfileId);
		assertFound(profile, 'Language profile', languageProfileId);
	}

	const updateData: Record<string, unknown> = {
		languageProfileId
	};

	// If wantsSubtitles is explicitly set, include it
	if (wantsSubtitles !== undefined) {
		updateData.wantsSubtitles = wantsSubtitles;
	} else if (languageProfileId) {
		// Default to enabling subtitles when assigning a profile
		updateData.wantsSubtitles = true;
	}

	// Determine if we should trigger subtitle searches
	const shouldEnableSubtitles = languageProfileId && (wantsSubtitles ?? true);

	if (mediaType === 'movie') {
		await db.update(movies).set(updateData).where(inArray(movies.id, mediaIds));

		logger.info(
			{
				count: mediaIds.length,
				languageProfileId
			},
			'[BulkAssign] Updated movies with language profile'
		);

		// Trigger subtitle search for movies with files
		if (shouldEnableSubtitles) {
			const settings = await monitoringScheduler.getSettings();
			if (settings.subtitleSearchOnImportEnabled) {
				// Get movies that have files
				const moviesWithFiles = await db
					.select({ id: movies.id })
					.from(movies)
					.where(and(inArray(movies.id, mediaIds), eq(movies.hasFile, true)));

				if (moviesWithFiles.length > 0) {
					logger.info(
						{
							count: moviesWithFiles.length
						},
						'[BulkAssign] Triggering subtitle search for movies'
					);

					const items = moviesWithFiles.map((m) => ({
						mediaType: 'movie' as const,
						mediaId: m.id
					}));

					// Fire-and-forget
					searchSubtitlesForMediaBatch(items).catch((err) => {
						logger.warn(
							{
								error: err instanceof Error ? err.message : String(err)
							},
							'[BulkAssign] Background subtitle search failed for movies'
						);
					});
				}
			}
		}
	} else {
		await db.update(series).set(updateData).where(inArray(series.id, mediaIds));

		logger.info(
			{
				count: mediaIds.length,
				languageProfileId
			},
			'[BulkAssign] Updated series with language profile'
		);

		// Trigger subtitle search for episodes with files
		if (shouldEnableSubtitles) {
			const settings = await monitoringScheduler.getSettings();
			if (settings.subtitleSearchOnImportEnabled) {
				// Get all episodes with files from these series
				const episodesWithFiles = await db
					.select({ id: episodes.id })
					.from(episodes)
					.where(and(inArray(episodes.seriesId, mediaIds), eq(episodes.hasFile, true)));

				if (episodesWithFiles.length > 0) {
					logger.info(
						{
							seriesCount: mediaIds.length,
							episodeCount: episodesWithFiles.length
						},
						'[BulkAssign] Triggering subtitle search for episodes'
					);

					const items = episodesWithFiles.map((ep) => ({
						mediaType: 'episode' as const,
						mediaId: ep.id
					}));

					// Fire-and-forget
					searchSubtitlesForMediaBatch(items).catch((err) => {
						logger.warn(
							{
								error: err instanceof Error ? err.message : String(err)
							},
							'[BulkAssign] Background subtitle search failed for episodes'
						);
					});
				}
			}
		}
	}

	return json({
		success: true,
		updated: mediaIds.length
	});
};
