/**
 * Addic7ed Provider Module
 *
 * Specialized TV show subtitle provider.
 */

import { Addic7edProvider } from './Addic7edProvider';
import type { ProviderInfo } from '../registry';

export { Addic7edProvider } from './Addic7edProvider';

/** Supported languages */
const ADDIC7ED_SUPPORTED_LANGUAGES = [
	'en',
	'es',
	'fr',
	'de',
	'it',
	'pt',
	'pt-br',
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
	'bg',
	'hr',
	'sr',
	'sk',
	'sl',
	'uk',
	'ca',
	'eu'
];

/**
 * Provider information for auto-registration
 */
export const PROVIDER_INFO: ProviderInfo = {
	implementation: 'addic7ed',
	providerClass: Addic7edProvider,
	definition: {
		implementation: 'addic7ed',
		name: 'Addic7ed',
		description: 'Specialized TV show subtitle provider with high-quality translations.',
		website: 'https://www.addic7ed.com',
		requiresApiKey: false,
		requiresCredentials: false,
		accessType: 'free-account',
		supportedLanguages: ADDIC7ED_SUPPORTED_LANGUAGES,
		supportsHashSearch: false,
		features: ['TV shows only', 'High quality', 'Quick releases'],
		settings: [
			{
				key: 'username',
				label: 'Username',
				type: 'string',
				required: false,
				description: 'Optional: For higher download limits'
			},
			{
				key: 'password',
				label: 'Password',
				type: 'string',
				required: false,
				description: 'Optional: Required if username is provided'
			}
		]
	}
};
