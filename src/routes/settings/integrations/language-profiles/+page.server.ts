import type { PageServerLoad } from './$types';
import { LanguageProfileService } from '$lib/server/subtitles/services/LanguageProfileService';
import { getSubtitleSettingsService } from '$lib/server/subtitles/services/SubtitleSettingsService';

export const load: PageServerLoad = async () => {
	const profileService = LanguageProfileService.getInstance();
	const settingsService = getSubtitleSettingsService();

	const profiles = await profileService.getProfiles();
	const settings = await settingsService.getAll();

	return {
		profiles,
		defaultProfileId: settings.defaultLanguageProfileId,
		defaultFallbackLanguage: settings.defaultFallbackLanguage
	};
};
