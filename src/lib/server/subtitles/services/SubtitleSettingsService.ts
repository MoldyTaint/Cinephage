/**
 * Subtitle Settings Service
 *
 * Manages global subtitle system configuration.
 * Settings are stored in the subtitle_settings table as key-value pairs.
 *
 * NOTE: Scheduling-related settings (search intervals, trigger timing) have been
 * consolidated into MonitoringScheduler. This service now only handles:
 * - autoSyncEnabled: ffsubsync auto-sync toggle
 * - defaultLanguageProfileId: default profile for new media
 * - defaultFallbackLanguage: fallback when subtitle language can't be detected
 */

import { db } from '$lib/server/db';
import { subtitleSettings } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '$lib/logging';

/** All available subtitle settings (non-scheduler related) */
export interface SubtitleSettingsData {
	/** Whether to auto-sync downloaded subtitles with ffsubsync */
	autoSyncEnabled: boolean;
	/** Default language profile ID for new media */
	defaultLanguageProfileId: string | null;
	/** Fallback language code when subtitle file language cannot be detected (ISO 639-1) */
	defaultFallbackLanguage: string;
}

/** Default settings values */
const DEFAULT_SETTINGS: SubtitleSettingsData = {
	autoSyncEnabled: true,
	defaultLanguageProfileId: null,
	defaultFallbackLanguage: 'en'
};

/** Mapping between camelCase and database keys */
const SETTING_KEY_MAP: Record<keyof SubtitleSettingsData, string> = {
	autoSyncEnabled: 'auto_sync_enabled',
	defaultLanguageProfileId: 'default_language_profile_id',
	defaultFallbackLanguage: 'default_fallback_language'
};

/**
 * Service for managing subtitle settings
 */
export class SubtitleSettingsService {
	private static instance: SubtitleSettingsService | null = null;
	private cache: Partial<SubtitleSettingsData> = {};
	private cacheInitialized = false;

	private constructor() {}

	static getInstance(): SubtitleSettingsService {
		if (!SubtitleSettingsService.instance) {
			SubtitleSettingsService.instance = new SubtitleSettingsService();
		}
		return SubtitleSettingsService.instance;
	}

	/**
	 * Get all settings
	 */
	async getAll(): Promise<SubtitleSettingsData> {
		await this.ensureCacheLoaded();
		return {
			...DEFAULT_SETTINGS,
			...this.cache
		};
	}

	/**
	 * Get a single setting value
	 */
	async get<K extends keyof SubtitleSettingsData>(key: K): Promise<SubtitleSettingsData[K]> {
		await this.ensureCacheLoaded();
		return (this.cache[key] ?? DEFAULT_SETTINGS[key]) as SubtitleSettingsData[K];
	}

	/**
	 * Set a single setting value
	 */
	async set<K extends keyof SubtitleSettingsData>(
		key: K,
		value: SubtitleSettingsData[K]
	): Promise<void> {
		const dbKey = SETTING_KEY_MAP[key];
		const stringValue = this.serializeValue(value);

		await db
			.insert(subtitleSettings)
			.values({ key: dbKey, value: stringValue })
			.onConflictDoUpdate({
				target: subtitleSettings.key,
				set: { value: stringValue }
			});

		// Update cache
		this.cache[key] = value;

		logger.debug('Subtitle setting updated', { key, value });
	}

	/**
	 * Update multiple settings at once
	 */
	async update(updates: Partial<SubtitleSettingsData>): Promise<SubtitleSettingsData> {
		for (const [key, value] of Object.entries(updates)) {
			if (value !== undefined) {
				await this.set(key as keyof SubtitleSettingsData, value as never);
			}
		}
		return this.getAll();
	}

	/**
	 * Reset all settings to defaults
	 */
	async resetToDefaults(): Promise<SubtitleSettingsData> {
		// Delete all settings
		for (const dbKey of Object.values(SETTING_KEY_MAP)) {
			await db.delete(subtitleSettings).where(eq(subtitleSettings.key, dbKey));
		}

		// Clear cache
		this.cache = {};
		this.cacheInitialized = true;

		logger.info('Subtitle settings reset to defaults');
		return { ...DEFAULT_SETTINGS };
	}

	/**
	 * Get the fallback language for subtitle files with no detectable language
	 */
	async getFallbackLanguage(): Promise<string> {
		return this.get('defaultFallbackLanguage');
	}

	/**
	 * Load all settings from database into cache
	 */
	private async ensureCacheLoaded(): Promise<void> {
		if (this.cacheInitialized) return;

		const rows = await db.select().from(subtitleSettings);

		for (const row of rows) {
			// Find the corresponding key in our map
			const entry = Object.entries(SETTING_KEY_MAP).find(([, dbKey]) => dbKey === row.key);
			if (entry) {
				const [camelKey] = entry;
				const key = camelKey as keyof SubtitleSettingsData;
				const value = this.deserializeValue(row.value, key);
				// Type assertion needed because Partial<T> allows undefined but deserializeValue returns T[K]
				(
					this.cache as Record<
						keyof SubtitleSettingsData,
						SubtitleSettingsData[keyof SubtitleSettingsData]
					>
				)[key] = value;
			}
		}

		this.cacheInitialized = true;
	}

	/**
	 * Serialize a value for storage
	 */
	private serializeValue(value: unknown): string {
		if (value === null) return 'null';
		if (typeof value === 'boolean') return value ? 'true' : 'false';
		return String(value);
	}

	/**
	 * Deserialize a stored value
	 */
	private deserializeValue<K extends keyof SubtitleSettingsData>(
		value: string,
		key: K
	): SubtitleSettingsData[K] {
		const defaultValue = DEFAULT_SETTINGS[key];

		if (value === 'null') {
			return null as SubtitleSettingsData[K];
		}

		if (typeof defaultValue === 'boolean') {
			return (value === 'true') as SubtitleSettingsData[K];
		}

		return value as SubtitleSettingsData[K];
	}

	/**
	 * Invalidate cache (for testing or manual refresh)
	 */
	invalidateCache(): void {
		this.cache = {};
		this.cacheInitialized = false;
	}
}

/**
 * Get the singleton SubtitleSettingsService
 */
export function getSubtitleSettingsService(): SubtitleSettingsService {
	return SubtitleSettingsService.getInstance();
}
