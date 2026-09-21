/**
 * OpenSubtitles.com Provider Module
 *
 * Modern REST API provider with hash matching.
 */

import { OpenSubtitlesProvider } from './OpenSubtitlesProvider';
import { OPENSUBTITLES_LANGUAGES } from './types';
import type { ProviderInfo } from '../registry';

export { OpenSubtitlesProvider } from './OpenSubtitlesProvider';
export * from './types';
export * from './hash';

/**
 * Provider information for auto-registration
 */
export const PROVIDER_INFO: ProviderInfo = {
	implementation: 'opensubtitles',
	providerClass: OpenSubtitlesProvider,
	definition: {
		implementation: 'opensubtitles',
		name: 'OpenSubtitles',
		description: 'The largest subtitle database with hash-matching support for accurate results.',
		website: 'https://www.opensubtitles.com',
		requiresApiKey: true,
		requiresCredentials: false,
		accessType: 'api-key',
		supportedLanguages: OPENSUBTITLES_LANGUAGES,
		supportsHashSearch: true,
		features: ['Hash matching', 'IMDB search', 'TMDB search', 'High accuracy'],
		settings: [
			{
				key: 'apiKey',
				label: 'API Key',
				type: 'string',
				required: true,
				description: 'Get your API key from opensubtitles.com'
			},
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
		],
		defaultRequestsPerMinute: 40
	}
};
