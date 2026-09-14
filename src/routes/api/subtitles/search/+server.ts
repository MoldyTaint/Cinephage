import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSubtitleSearchService } from '$lib/server/subtitles/services/SubtitleSearchService';
import {
	LanguageProfileService,
	type LanguageProfile
} from '$lib/server/subtitles/services/LanguageProfileService';
import { normalizeLanguageCode } from '$lib/shared/languages';
import {
	selectBestCandidate,
	type CandidateRejectionReason,
	type SearchResultLike
} from '$lib/server/subtitles/acquisition';
import { subtitleSearchSchema } from '$lib/validation/schemas';
import { db } from '$lib/server/db';
import { movies, episodes, series } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { SubtitleSearchCriteria } from '$lib/server/subtitles/types';
import { parseBody } from '$lib/server/api/validate.js';

/** Why no result would be auto-downloaded for the effective profile. */
interface RejectionSummary {
	effectiveMinimumScore?: number;
	bestRejectedScore?: number;
	bestRejectedReason?: CandidateRejectionReason;
}

/**
 * Search languages for the effective profile: the canonicalized tags of its
 * subtitle requirements, deduped in requirement order (v2 shape — there is no
 * v1 preference list anymore).
 */
function profileSearchLanguages(profile: LanguageProfile): string[] {
	const seen = new Set<string>();
	const languages: string[] = [];
	for (const requirement of profile.subtitles) {
		const code = normalizeLanguageCode(requirement.tag);
		if (code === '' || seen.has(code)) continue;
		seen.add(code);
		languages.push(code);
	}
	return languages;
}

/**
 * Best score that failed the effective profile, so the UI can say
 * "N results, best score X below threshold Y" instead of "No subtitles found"
 * when results exist but none is acceptable.
 *
 * A result is acceptable when it satisfies a requirement tuple AND clears
 * `minimumScore`; if any requirement has an acceptable candidate there is
 * nothing to report. Otherwise the highest-scoring rejected result (across all
 * requirements) is returned with the reason it lost.
 */
function summarizeRejections(
	results: readonly SearchResultLike[],
	profile?: LanguageProfile
): RejectionSummary {
	if (!profile || results.length === 0) return {};

	const minimumScore = profile.minimumScore;
	let bestRejected: { score: number; reason: CandidateRejectionReason } | undefined;

	for (const requirement of profile.subtitles) {
		const selection = selectBestCandidate(results, requirement, minimumScore);
		if (selection.best) {
			return { effectiveMinimumScore: minimumScore };
		}
		if (selection.bestRejected) {
			const { result, reason } = selection.bestRejected;
			if (!bestRejected || result.matchScore > bestRejected.score) {
				bestRejected = { score: result.matchScore, reason };
			}
		}
	}

	return bestRejected
		? {
				effectiveMinimumScore: minimumScore,
				bestRejectedScore: bestRejected.score,
				bestRejectedReason: bestRejected.reason
			}
		: { effectiveMinimumScore: minimumScore };
}

/**
 * POST /api/subtitles/search
 * Search for subtitles across configured providers.
 */
export const POST: RequestHandler = async ({ request }) => {
	const validated = await parseBody(request, subtitleSearchSchema);
	const searchService = getSubtitleSearchService();
	const profileService = LanguageProfileService.getInstance();

	// Search for movie subtitles
	if (validated.movieId) {
		const movie = await db.query.movies.findFirst({
			where: eq(movies.id, validated.movieId)
		});

		if (!movie) {
			return json({ error: 'Movie not found' }, { status: 404 });
		}

		// Resolve languages and the rejection summary from the effective profile.
		const profile = await profileService.getProfileForMovie(validated.movieId);
		let languages = validated.languages || [];
		if (languages.length === 0 && profile) {
			languages = profileSearchLanguages(profile);
		}
		if (languages.length === 0) {
			languages = ['en']; // Default to English
		}

		const results = await searchService.searchForMovie(validated.movieId, languages, {
			providerIds: validated.providerIds,
			includeForced: validated.includeForced,
			includeHearingImpaired: validated.includeHearingImpaired,
			excludeHearingImpaired: validated.excludeHearingImpaired
		});

		return json({
			...results,
			languages,
			...summarizeRejections(results.results, profile)
		});
	}

	// Search for episode subtitles
	if (validated.episodeId) {
		const episode = await db.query.episodes.findFirst({
			where: eq(episodes.id, validated.episodeId)
		});

		if (!episode) {
			return json({ error: 'Episode not found' }, { status: 404 });
		}

		const seriesData = await db.query.series.findFirst({
			where: eq(series.id, episode.seriesId)
		});

		if (!seriesData) {
			return json({ error: 'Series not found' }, { status: 404 });
		}

		// Resolve languages and the rejection summary from the effective profile.
		const profile = await profileService.getProfileForSeries(seriesData.id);
		let languages = validated.languages || [];
		if (languages.length === 0 && profile) {
			languages = profileSearchLanguages(profile);
		}
		if (languages.length === 0) {
			languages = ['en']; // Default to English
		}

		const results = await searchService.searchForEpisode(validated.episodeId, languages, {
			providerIds: validated.providerIds,
			includeForced: validated.includeForced,
			includeHearingImpaired: validated.includeHearingImpaired,
			excludeHearingImpaired: validated.excludeHearingImpaired
		});

		return json({
			...results,
			languages,
			...summarizeRejections(results.results, profile)
		});
	}

	// Manual search with provided parameters
	if (!validated.title) {
		return json({ error: 'Either movieId, episodeId, or title is required' }, { status: 400 });
	}

	const languages = validated.languages?.length ? validated.languages : ['en'];
	const criteria: SubtitleSearchCriteria = {
		title: validated.title,
		year: validated.year,
		imdbId: validated.imdbId,
		tmdbId: validated.tmdbId,
		seriesTitle: validated.seriesTitle,
		season: validated.season,
		episode: validated.episode,
		languages,
		includeForced: validated.includeForced,
		includeHearingImpaired: validated.includeHearingImpaired,
		excludeHearingImpaired: validated.excludeHearingImpaired
	};

	const results = await searchService.search(
		criteria,
		{},
		{
			providerIds: validated.providerIds
		}
	);

	// Manual title search has no owning media item, so no effective profile.
	return json({ ...results, languages });
};
