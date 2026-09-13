/**
 * Assrt Provider Module
 *
 * Chinese subtitle provider.
 */

import { AssrtProvider } from './AssrtProvider';
import { ASSRT_LANGUAGES } from './types';
import type { ProviderInfo } from '../registry';

export { AssrtProvider } from './AssrtProvider';
export * from './types';

/**
 * Provider information for auto-registration
 */
export const PROVIDER_INFO: ProviderInfo = {
	implementation: 'assrt',
	providerClass: AssrtProvider,
	definition: {
		implementation: 'assrt',
		name: 'Assrt',
		description: 'Chinese subtitle provider with rate-limited API.',
		website: 'https://assrt.net',
		requiresApiKey: true,
		requiresCredentials: false,
		accessType: 'api-key',
		supportedLanguages: ASSRT_LANGUAGES,
		supportsHashSearch: false,
		features: ['Chinese/English', 'API-based', 'Movies & TV', 'Anime'],
		settings: [
			{
				key: 'token',
				label: 'API Token',
				type: 'string',
				required: true,
				description: 'Your Assrt API token'
			}
		],
		defaultRequestsPerMinute: 30
	}
};
