import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getLanguageProfileService } from '$lib/server/subtitles/services/LanguageProfileService';

/**
 * GET /api/subtitles/language-settings/effective?mediaType=movie|series
 *
 * Resolve the effective subtitle language profile for a NEW library item,
 * i.e. one that has not been added yet (add flow: discover, import,
 * calendar, TMDB hero).
 *
 * Documented simplification: a new item has no per-item override and no
 * owning library yet, so the only applicable resolution level is the
 * instance default (language_settings.default_profile_id) — source is
 * therefore always 'default', and the response is `null` when no default
 * profile is configured. The `mediaType` query parameter is validated for
 * forward compatibility but does not change resolution today: movies and
 * series share the same instance default. Full resolution
 * (override > library > default) for EXISTING items is exposed by
 * GET /api/library/movies/[id] and GET /api/library/series/[id] via
 * `effectiveLanguageProfile`.
 *
 * Read-only like GET /api/subtitles/language-settings: authentication is
 * enforced by the global hooks, no admin gate (non-admin users see the add
 * forms).
 */
export const GET: RequestHandler = async (event) => {
	const mediaType = event.url.searchParams.get('mediaType');
	if (mediaType !== null && mediaType !== 'movie' && mediaType !== 'series') {
		return json({ error: 'mediaType must be "movie" or "series"' }, { status: 400 });
	}

	const defaultProfile = await getLanguageProfileService().getDefaultProfile();
	if (!defaultProfile) {
		return json(null);
	}

	return json({ profile: defaultProfile, source: 'default' });
};
