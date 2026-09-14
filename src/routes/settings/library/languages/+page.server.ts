import { tmdb } from '$lib/server/tmdb';
import { createChildLogger } from '$lib/logging';
import { getLanguageSettingsService } from '$lib/server/subtitles/services/LanguageSettingsService';
import { LanguageProfileService } from '$lib/server/subtitles/services/LanguageProfileService';
import { ALL_LANGUAGE_OPTIONS } from '$lib/shared/languages';
import type { PageServerLoad } from './$types';

const logger = createChildLogger({ module: 'LanguagesSettingsPage', logDomain: 'system' });

/**
 * Library > Languages tab. Loads the language-settings singleton, the
 * language profiles (for the manager and the default-profile selector) and
 * the TMDB language/country catalogues used by the locale and region selects.
 */
export const load: PageServerLoad = async () => {
	const [settings, profiles] = await Promise.all([
		getLanguageSettingsService().get(),
		LanguageProfileService.getInstance().getProfiles()
	]);

	const tmdbConfigured = await tmdb.isConfigured();

	let countries: { code: string; name: string }[] = [];
	let languages: { code: string; name: string }[] = [];

	if (tmdbConfigured) {
		try {
			const [countriesData, languagesData] = await Promise.all([
				tmdb.getCountries(),
				tmdb.getLanguages()
			]);

			if (countriesData) {
				countries = countriesData
					.map((c) => ({ code: c.iso_3166_1, name: c.english_name }))
					.sort((a, b) => a.name.localeCompare(b.name));
			}

			if (languagesData) {
				languages = languagesData
					.map((l) => ({ code: l.iso_639_1, name: l.english_name }))
					.sort((a, b) => a.name.localeCompare(b.name));
			}
		} catch (e) {
			logger.error({ err: e }, 'Failed to fetch TMDB languages/countries');
		}
	}

	if (languages.length === 0) {
		// Fall back to the shared registry so the locale selects stay usable
		// without a configured TMDB connection.
		languages = ALL_LANGUAGE_OPTIONS.map((l) => ({ code: l.code, name: l.name }));
	}

	return { settings, profiles, countries, languages, tmdbConfigured };
};
