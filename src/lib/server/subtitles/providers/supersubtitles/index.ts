/**
 * Super Subtitles (feliratok.eu) provider module.
 *
 * The request flow follows Bazarr's proven provider while accepting the site's
 * current array-shaped episode response in addition to the legacy object shape.
 */

import { SuperSubtitlesProvider } from './SuperSubtitlesProvider';
import { SUPERSUBTITLES_LANGUAGES } from './types';
import type { ProviderInfo } from '../registry';

export { SuperSubtitlesProvider } from './SuperSubtitlesProvider';
export * from './types';

export const PROVIDER_INFO: ProviderInfo = {
	implementation: 'supersubtitles',
	providerClass: SuperSubtitlesProvider,
	definition: {
		implementation: 'supersubtitles',
		name: 'Super Subtitles',
		description: 'Hungarian and English subtitles from feliratok.eu.',
		website: 'https://feliratok.eu',
		requiresApiKey: false,
		requiresCredentials: false,
		accessType: 'free',
		supportedLanguages: SUPERSUBTITLES_LANGUAGES,
		supportsHashSearch: false,
		features: ['Hungarian & English', 'Movies & TV', 'Forced subtitles', 'Season packs'],
		settings: []
	}
};
