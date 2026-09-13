import type { PageServerLoad } from './$types';
import { LanguageProfileService } from '$lib/server/subtitles/services/LanguageProfileService';
import { LanguageSettingsService } from '$lib/server/subtitles/services/LanguageSettingsService';

export const load: PageServerLoad = async () => {
	const profileService = LanguageProfileService.getInstance();
	const settingsService = LanguageSettingsService.getInstance();

	const profiles = await profileService.getProfiles();
	const settings = await settingsService.get();

	return {
		profiles,
		defaultProfileId: settings.defaultProfileId
	};
};
