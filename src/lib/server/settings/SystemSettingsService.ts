import { db } from '$lib/server/db';
import { settings } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

const SETTINGS_KEY_EXTERNAL_URL = 'external_url';

/**
 * System-wide settings service
 * Manages application-level configuration stored in the settings table
 */
export class SystemSettingsService {
	/**
	 * Get the external URL setting
	 * This is the public-facing URL used for auth callbacks, links, etc.
	 * @returns The external URL or null if not set
	 */
	async getExternalUrl(): Promise<string | null> {
		const result = await db
			.select({ value: settings.value })
			.from(settings)
			.where(eq(settings.key, SETTINGS_KEY_EXTERNAL_URL))
			.get();

		return result?.value ?? null;
	}

	/**
	 * Set the external URL setting
	 * @param url The external URL to save (or null to remove)
	 */
	async setExternalUrl(url: string | null): Promise<void> {
		if (url === null) {
			// Delete the setting
			await db.delete(settings).where(eq(settings.key, SETTINGS_KEY_EXTERNAL_URL));
		} else {
			// Upsert the setting
			await db
				.insert(settings)
				.values({ key: SETTINGS_KEY_EXTERNAL_URL, value: url })
				.onConflictDoUpdate({
					target: settings.key,
					set: { value: url }
				});
		}
	}
}

// Singleton instance
let _instance: SystemSettingsService | null = null;

export function getSystemSettingsService(): SystemSettingsService {
	if (!_instance) {
		_instance = new SystemSettingsService();
	}
	return _instance;
}

// Export for testing
export { SETTINGS_KEY_EXTERNAL_URL };
