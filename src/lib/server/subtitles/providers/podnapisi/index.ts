/**
 * Podnapisi Provider Module
 *
 * Slovenian subtitle database with good European language coverage.
 */

import { PodnapisiProvider } from './PodnapisiProvider';
import type { ProviderInfo } from '../registry';

export { PodnapisiProvider } from './PodnapisiProvider';

/** Supported languages */
const PODNAPISI_LANGUAGES = [
	'en',
	'sl',
	'hr',
	'sr',
	'bs',
	'mk',
	'bg',
	'cs',
	'sk',
	'pl',
	'hu',
	'ro',
	'de',
	'es',
	'fr',
	'it',
	'pt',
	'nl',
	'ru',
	'el',
	'tr',
	'ar',
	'he',
	'vi',
	'zh',
	'ja',
	'ko',
	'sv',
	'no',
	'da',
	'fi',
	'uk',
	'fa',
	'id',
	'th',
	'et',
	'lv',
	'lt'
];

/**
 * Provider information for auto-registration
 */
export const PROVIDER_INFO: ProviderInfo = {
	implementation: 'podnapisi',
	providerClass: PodnapisiProvider,
	definition: {
		implementation: 'podnapisi',
		name: 'Podnapisi',
		description: 'Slovenian subtitle database with excellent European language coverage.',
		website: 'https://www.podnapisi.net',
		requiresApiKey: false,
		requiresCredentials: false,
		accessType: 'free',
		supportedLanguages: PODNAPISI_LANGUAGES,
		supportsHashSearch: false,
		features: ['European languages', 'Slovenian focus', 'No API key required', 'Good quality'],
		settings: []
	}
};
