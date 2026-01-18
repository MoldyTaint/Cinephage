/**
 * Subscene Provider Module
 *
 * Large community-driven subtitle database.
 */

import { SubsceneProvider } from './SubsceneProvider';
import type { ProviderInfo } from '../registry';

export { SubsceneProvider } from './SubsceneProvider';

/** Supported languages */
const SUBSCENE_LANGUAGES = [
	'en',
	'es',
	'fr',
	'de',
	'it',
	'pt',
	'nl',
	'pl',
	'ru',
	'ar',
	'he',
	'tr',
	'el',
	'hu',
	'ro',
	'cs',
	'sv',
	'da',
	'fi',
	'no',
	'ja',
	'ko',
	'zh',
	'vi',
	'th',
	'id',
	'ms',
	'fa',
	'hi',
	'bn',
	'uk',
	'bg',
	'hr',
	'sr',
	'sk',
	'sl'
];

/**
 * Provider information for auto-registration
 */
export const PROVIDER_INFO: ProviderInfo = {
	implementation: 'subscene',
	providerClass: SubsceneProvider,
	definition: {
		implementation: 'subscene',
		name: 'Subscene',
		description: 'Large community-driven subtitle database with extensive coverage.',
		website: 'https://subscene.com',
		requiresApiKey: false,
		requiresCredentials: false,
		accessType: 'free',
		supportedLanguages: SUBSCENE_LANGUAGES,
		supportsHashSearch: false,
		features: ['Large catalog', 'Community translations', 'No API key required', 'Many languages'],
		settings: []
	}
};
