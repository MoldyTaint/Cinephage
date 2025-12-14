/**
 * Streaming Provider Settings
 *
 * Provides utilities to retrieve streaming provider configuration
 * from the database and manage provider enablement.
 */

import { db } from '$lib/server/db';
import { indexers } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { CINEPHAGE_STREAM_DEFINITION_ID } from '../indexers/types';

// ============================================================================
// Provider Types
// ============================================================================

/**
 * All supported streaming provider IDs
 */
export type StreamingProvider =
	| 'videasy'
	| 'vidlink'
	| 'xprime'
	| 'smashy'
	| 'hexa'
	| 'yflix'
	| 'mapple'
	| 'onetouchtv'
	| 'animekai'
	| 'kisskh';

/**
 * Default enabled providers (primary movie/TV sources)
 */
const DEFAULT_ENABLED_PROVIDERS: StreamingProvider[] = [
	'videasy',
	'vidlink',
	'xprime',
	'smashy',
	'hexa'
];

// ============================================================================
// Settings Interface
// ============================================================================

export interface StreamingIndexerSettings {
	/** Base URL for streaming endpoints */
	baseUrl?: string;

	/** Comma-separated list of enabled providers */
	enabledProviders?: string;

	/** Individual provider toggles (for backward compatibility) */
	enableVideasy?: 'true' | 'false';
	enableVidlink?: 'true' | 'false';
	enableXprime?: 'true' | 'false';
	enableSmashy?: 'true' | 'false';
	enableHexa?: 'true' | 'false';
	enableYflix?: 'true' | 'false';
	enableMapple?: 'true' | 'false';
	enableOnetouchtv?: 'true' | 'false';
	enableAnimekai?: 'true' | 'false';
	enableKisskh?: 'true' | 'false';

	// Legacy settings (deprecated)
	/** @deprecated Use enabledProviders instead */
	enableVidsrc?: string;
	/** @deprecated Use enabledProviders instead */
	enableMoviesapi?: string;
	/** @deprecated Use enabledProviders instead */
	enable2embed?: string;
}

// ============================================================================
// Settings Functions
// ============================================================================

/**
 * Get the streaming indexer's settings from the database.
 * Returns undefined if indexer not found or has no settings.
 *
 * Priority for baseUrl:
 * 1. JSON settings field (user-configured in indexer settings form)
 * 2. indexer's base_url column (selected from links array)
 */
export async function getStreamingIndexerSettings(): Promise<StreamingIndexerSettings | undefined> {
	const rows = await db
		.select({
			settings: indexers.settings,
			baseUrl: indexers.baseUrl
		})
		.from(indexers)
		.where(eq(indexers.definitionId, CINEPHAGE_STREAM_DEFINITION_ID))
		.limit(1);

	if (rows.length === 0) {
		return undefined;
	}

	const settings = (rows[0].settings as StreamingIndexerSettings) ?? {};

	// Use JSON settings baseUrl if configured, otherwise fall back to column
	// This allows users to override the base URL in the indexer settings form
	if (!settings.baseUrl && rows[0].baseUrl) {
		settings.baseUrl = rows[0].baseUrl;
	}

	return settings;
}

/**
 * Get the base URL for streaming, with fallback chain:
 * 1. Indexer settings (from DB)
 * 2. PUBLIC_BASE_URL environment variable
 * 3. Provided fallback (usually from request headers)
 *
 * @param fallback - Required fallback URL if no other source is configured
 */
export async function getStreamingBaseUrl(fallback: string): Promise<string> {
	const settings = await getStreamingIndexerSettings();

	if (settings?.baseUrl) {
		// Remove trailing slash for consistency
		return settings.baseUrl.replace(/\/$/, '');
	}

	const envUrl = process.env.PUBLIC_BASE_URL;
	if (envUrl) {
		return envUrl.replace(/\/$/, '');
	}

	return fallback;
}

/**
 * Provider toggle configuration for individual settings.
 * Maps provider ID to its settings key and default state.
 */
const PROVIDER_TOGGLES: Array<{
	id: StreamingProvider;
	settingsKey: keyof StreamingIndexerSettings;
	enabledByDefault: boolean;
}> = [
	{ id: 'videasy', settingsKey: 'enableVideasy', enabledByDefault: true },
	{ id: 'vidlink', settingsKey: 'enableVidlink', enabledByDefault: true },
	{ id: 'xprime', settingsKey: 'enableXprime', enabledByDefault: true },
	{ id: 'smashy', settingsKey: 'enableSmashy', enabledByDefault: true },
	{ id: 'hexa', settingsKey: 'enableHexa', enabledByDefault: true },
	{ id: 'yflix', settingsKey: 'enableYflix', enabledByDefault: false },
	{ id: 'mapple', settingsKey: 'enableMapple', enabledByDefault: false },
	{ id: 'onetouchtv', settingsKey: 'enableOnetouchtv', enabledByDefault: false },
	{ id: 'animekai', settingsKey: 'enableAnimekai', enabledByDefault: false },
	{ id: 'kisskh', settingsKey: 'enableKisskh', enabledByDefault: false }
];

/**
 * Get list of enabled streaming providers based on indexer settings.
 */
export async function getEnabledProviders(): Promise<StreamingProvider[]> {
	const settings = await getStreamingIndexerSettings();

	// If enabledProviders is set, use it directly
	if (settings?.enabledProviders) {
		const enabled = settings.enabledProviders
			.split(',')
			.map((p) => p.trim().toLowerCase() as StreamingProvider)
			.filter((p) => isValidProvider(p));

		if (enabled.length > 0) {
			return enabled;
		}
	}

	// Check individual toggles using provider configuration
	const providers: StreamingProvider[] = [];

	for (const toggle of PROVIDER_TOGGLES) {
		const settingValue = settings?.[toggle.settingsKey];

		if (toggle.enabledByDefault) {
			// Enabled by default: only exclude if explicitly set to 'false'
			if (settingValue !== 'false') {
				providers.push(toggle.id);
			}
		} else {
			// Disabled by default: only include if explicitly set to 'true'
			if (settingValue === 'true') {
				providers.push(toggle.id);
			}
		}
	}

	// If no providers enabled from settings, use defaults
	if (providers.length === 0) {
		return DEFAULT_ENABLED_PROVIDERS;
	}

	return providers;
}

/**
 * Check if a provider ID is valid
 */
function isValidProvider(provider: string): provider is StreamingProvider {
	const validProviders: StreamingProvider[] = [
		'videasy',
		'vidlink',
		'xprime',
		'smashy',
		'hexa',
		'yflix',
		'mapple',
		'onetouchtv',
		'animekai',
		'kisskh'
	];
	return validProviders.includes(provider as StreamingProvider);
}

/**
 * Get provider display name
 */
export function getProviderDisplayName(provider: StreamingProvider): string {
	const names: Record<StreamingProvider, string> = {
		videasy: 'Videasy',
		vidlink: 'Vidlink',
		xprime: 'XPrime',
		smashy: 'Smashystream',
		hexa: 'Hexa',
		yflix: 'YFlix',
		mapple: 'Mapple',
		onetouchtv: 'OneTouchTV',
		animekai: 'AnimeKai',
		kisskh: 'KissKH'
	};
	return names[provider] ?? provider;
}

/**
 * Get all available providers with their default status
 */
export function getAllProviders(): Array<{
	id: StreamingProvider;
	name: string;
	enabledByDefault: boolean;
	description: string;
}> {
	return [
		{
			id: 'videasy',
			name: 'Videasy',
			enabledByDefault: true,
			description: 'Multiple servers with multi-language support'
		},
		{
			id: 'vidlink',
			name: 'Vidlink',
			enabledByDefault: true,
			description: 'Simple and fast provider'
		},
		{
			id: 'xprime',
			name: 'XPrime',
			enabledByDefault: true,
			description: 'High quality streams with turnstile protection'
		},
		{
			id: 'smashy',
			name: 'Smashystream',
			enabledByDefault: true,
			description: 'Multiple player types with subtitles'
		},
		{
			id: 'hexa',
			name: 'Hexa',
			enabledByDefault: true,
			description: 'Fast provider with API key encryption'
		},
		{
			id: 'yflix',
			name: 'YFlix',
			enabledByDefault: false,
			description: 'Requires content ID lookup (1Movies compatible)'
		},
		{
			id: 'mapple',
			name: 'Mapple',
			enabledByDefault: false,
			description: 'Session-based provider with 4K support'
		},
		{
			id: 'onetouchtv',
			name: 'OneTouchTV',
			enabledByDefault: false,
			description: 'TV shows only, requires content ID lookup'
		},
		{
			id: 'animekai',
			name: 'AnimeKai',
			enabledByDefault: false,
			description: 'Anime only, requires content ID lookup'
		},
		{
			id: 'kisskh',
			name: 'KissKH',
			enabledByDefault: false,
			description: 'Asian dramas, requires content ID lookup'
		}
	];
}
