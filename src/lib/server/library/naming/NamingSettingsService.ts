/**
 * Naming Settings Service
 *
 * Database-backed configuration for the naming service.
 * Loads and saves naming preferences from the namingSettings table.
 */

import { logger } from '$lib/logging';
import { db } from '$lib/server/db';
import { namingSettings } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { DEFAULT_NAMING_CONFIG, type NamingConfig } from './NamingService';

/**
 * Database key to config property mapping
 */
const KEY_MAP: Record<string, keyof NamingConfig> = {
	movie_folder_format: 'movieFolderFormat',
	movie_file_format: 'movieFileFormat',
	series_folder_format: 'seriesFolderFormat',
	season_folder_format: 'seasonFolderFormat',
	episode_file_format: 'episodeFileFormat',
	daily_episode_format: 'dailyEpisodeFormat',
	anime_episode_format: 'animeEpisodeFormat',
	multi_episode_style: 'multiEpisodeStyle',
	colon_replacement: 'colonReplacement',
	replace_spaces_with: 'replaceSpacesWith',
	media_server_id_format: 'mediaServerIdFormat',
	include_quality: 'includeQuality',
	include_media_info: 'includeMediaInfo',
	include_release_group: 'includeReleaseGroup'
};

/**
 * Reverse mapping from config property to database key
 */
const REVERSE_KEY_MAP: Record<keyof NamingConfig, string> = Object.fromEntries(
	Object.entries(KEY_MAP).map(([k, v]) => [v, k])
) as Record<keyof NamingConfig, string>;

/**
 * Boolean settings that need special handling
 */
const BOOLEAN_KEYS = new Set(['include_quality', 'include_media_info', 'include_release_group']);

/**
 * Helper to set a config value by key
 */
function setConfigValue(
	config: NamingConfig,
	key: keyof NamingConfig,
	value: string | boolean | undefined
): void {
	// Use type assertion with explicit any to work around strict typing
	// This is safe because we control the key-value mapping
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(config as any)[key] = value;
}

/**
 * Naming Settings Service
 */
export class NamingSettingsService {
	private static instance: NamingSettingsService;
	private cachedConfig: NamingConfig | null = null;

	private constructor() { }

	static getInstance(): NamingSettingsService {
		if (!NamingSettingsService.instance) {
			NamingSettingsService.instance = new NamingSettingsService();
		}
		return NamingSettingsService.instance;
	}

	/**
	 * Get the current naming configuration
	 * Returns cached config if available, otherwise loads from database
	 */
	async getConfig(): Promise<NamingConfig> {
		if (this.cachedConfig) {
			return { ...this.cachedConfig };
		}

		let settings: { key: string; value: string }[] = [];
		try {
			settings = db.select().from(namingSettings).all();
		} catch (error) {
			logger.warn('[NamingSettingsService] Failed to load settings from DB (using defaults)', {
				error: error instanceof Error ? error.message : String(error)
			});
			// Determine if table is missing
			if (String(error).includes('no such table')) {
				logger.error('[NamingSettingsService] CRITICAL: naming_settings table is missing! Please run migrations.');
			}
		}

		const settingsMap = new Map(settings.map((s) => [s.key, s.value]));

		// Build config from database settings, falling back to defaults
		const config: NamingConfig = { ...DEFAULT_NAMING_CONFIG };

		for (const [dbKey, configKey] of Object.entries(KEY_MAP)) {
			const value = settingsMap.get(dbKey);
			if (value !== undefined) {
				if (BOOLEAN_KEYS.has(dbKey)) {
					// Parse boolean values
					setConfigValue(config, configKey, value === 'true');
				} else if (value === 'null' || value === '') {
					// Handle null/empty values for optional fields
					setConfigValue(config, configKey, undefined);
				} else {
					setConfigValue(config, configKey, value);
				}
			}
		}

		this.cachedConfig = config;
		return { ...config };
	}

	/**
	 * Get the current config synchronously (uses cache or defaults)
	 * Use getConfig() for guaranteed up-to-date values
	 */
	getConfigSync(): NamingConfig {
		if (this.cachedConfig) {
			return { ...this.cachedConfig };
		}

		// Load synchronously for immediate use
		let settings: { key: string; value: string }[] = [];
		try {
			settings = db.select().from(namingSettings).all();
		} catch (error) {
			// Cannot log async here easily if logger.warn is async, but usually it's safe.
			// Just suppress specifically for missing table or sync issues.
			if (String(error).includes('no such table')) {
				console.error('[NamingSettingsService] CRITICAL: naming_settings table missing (sync load)');
			}
		}

		const settingsMap = new Map(settings.map((s) => [s.key, s.value]));

		const config: NamingConfig = { ...DEFAULT_NAMING_CONFIG };

		for (const [dbKey, configKey] of Object.entries(KEY_MAP)) {
			const value = settingsMap.get(dbKey);
			if (value !== undefined) {
				if (BOOLEAN_KEYS.has(dbKey)) {
					setConfigValue(config, configKey, value === 'true');
				} else if (value === 'null' || value === '') {
					setConfigValue(config, configKey, undefined);
				} else {
					setConfigValue(config, configKey, value);
				}
			}
		}

		this.cachedConfig = config;
		return { ...config };
	}

	/**
	 * Update the naming configuration
	 * Only updates the provided fields, leaves others unchanged
	 */
	async updateConfig(updates: Partial<NamingConfig>): Promise<NamingConfig> {
		for (const [configKey, value] of Object.entries(updates)) {
			const dbKey = REVERSE_KEY_MAP[configKey as keyof NamingConfig];
			if (!dbKey) continue;

			// Convert value to string for storage
			let stringValue: string;
			if (value === undefined || value === null) {
				stringValue = '';
			} else if (typeof value === 'boolean') {
				stringValue = value.toString();
			} else {
				stringValue = String(value);
			}

			// Upsert the setting
			const existing = db.select().from(namingSettings).where(eq(namingSettings.key, dbKey)).get();

			if (existing) {
				db.update(namingSettings).set({ value: stringValue }).where(eq(namingSettings.key, dbKey)).run();
			} else {
				db.insert(namingSettings).values({ key: dbKey, value: stringValue }).run();
			}
		}

		// Invalidate cache and return updated config
		this.invalidateCache();
		return this.getConfig();
	}

	/**
	 * Reset all naming settings to defaults
	 */
	async resetToDefaults(): Promise<NamingConfig> {
		// Delete all naming settings
		db.delete(namingSettings).run();

		// Invalidate cache
		this.invalidateCache();

		return { ...DEFAULT_NAMING_CONFIG };
	}

	/**
	 * Invalidate the cached configuration
	 * Call this when settings may have changed externally
	 */
	invalidateCache(): void {
		this.cachedConfig = null;
	}
}

/**
 * Singleton instance
 */
export const namingSettingsService = NamingSettingsService.getInstance();
