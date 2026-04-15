/**
 * Streaming settings for the active Cinephage API resolver.
 */

import { db } from '$lib/server/db';
import { indexers } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '$lib/logging';
import { CINEPHAGE_STREAM_DEFINITION_ID } from '../indexers/types';

const STREAMING_INDEXER_SETTING_KEYS = [
	'useHttps',
	'externalHost',
	'cinephageCommit',
	'cinephageVersion'
] as const;

type StreamingIndexerSettingKey = (typeof STREAMING_INDEXER_SETTING_KEYS)[number];
type StreamingIndexerSettingValue = string;

export interface StreamingIndexerSettings {
	/** Whether to use HTTPS (new split URL format) */
	useHttps?: 'true' | 'false';

	/** External host:port (new split URL format) */
	externalHost?: string;

	/** Base URL for streaming endpoints, resolved from current settings */
	baseUrl?: string;

	/** Build commit sent with upstream authentication headers */
	cinephageCommit?: string;

	/** Build version sent with upstream authentication headers */
	cinephageVersion?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeStreamingSettingValue(
	key: StreamingIndexerSettingKey,
	value: unknown
): StreamingIndexerSettingValue | undefined {
	if (key === 'useHttps') {
		if (typeof value === 'boolean') {
			return value ? 'true' : 'false';
		}

		if (typeof value !== 'string') {
			return undefined;
		}

		const normalized = value.trim().toLowerCase();
		if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
			return 'true';
		}

		if (normalized === 'false' || normalized === '0' || normalized === 'no') {
			return 'false';
		}

		return undefined;
	}

	if (typeof value !== 'string') {
		return undefined;
	}

	const normalized = value.trim();
	if (!normalized) {
		return undefined;
	}

	return normalized;
}

function needsStreamingSettingsCleanup(
	rawSettings: Record<string, unknown> | null | undefined,
	sanitizedSettings: Record<string, StreamingIndexerSettingValue>
): boolean {
	if (!isRecord(rawSettings)) {
		return Object.keys(sanitizedSettings).length > 0;
	}

	if (Object.keys(rawSettings).length !== Object.keys(sanitizedSettings).length) {
		return true;
	}

	for (const key of STREAMING_INDEXER_SETTING_KEYS) {
		if (rawSettings[key] !== sanitizedSettings[key]) {
			return true;
		}
	}

	return false;
}

export function sanitizeStreamingIndexerSettings(
	settings: Record<string, unknown> | null | undefined
): Record<string, StreamingIndexerSettingValue> {
	const rawSettings = isRecord(settings) ? settings : {};
	const sanitizedSettings: Record<string, StreamingIndexerSettingValue> = {};

	for (const key of STREAMING_INDEXER_SETTING_KEYS) {
		const normalizedValue = normalizeStreamingSettingValue(key, rawSettings[key]);
		if (normalizedValue !== undefined) {
			sanitizedSettings[key] = normalizedValue;
		}
	}

	return sanitizedSettings;
}

/**
 * Get the streaming indexer's settings from the database.
 * Returns undefined if indexer not found or has no settings.
 *
 * Priority for baseUrl:
 * 1. externalHost + useHttps in settings JSON
 * 2. indexer's base_url column
 */
export async function getStreamingIndexerSettings(): Promise<StreamingIndexerSettings | undefined> {
	const rows = await db
		.select({
			id: indexers.id,
			settings: indexers.settings,
			baseUrl: indexers.baseUrl
		})
		.from(indexers)
		.where(eq(indexers.definitionId, CINEPHAGE_STREAM_DEFINITION_ID))
		.limit(1);

	if (rows.length === 0) {
		return undefined;
	}

	const rawSettings = rows[0].settings as Record<string, unknown> | null | undefined;
	const sanitizedSettings = sanitizeStreamingIndexerSettings(rawSettings);

	if (needsStreamingSettingsCleanup(rawSettings, sanitizedSettings)) {
		if (rawSettings && Object.keys(rawSettings).length > Object.keys(sanitizedSettings).length) {
			logger.warn('Streaming settings cleanup removing keys', {
				indexerId: rows[0].id,
				removedKeys: Object.keys(rawSettings).filter((k) => !(k in sanitizedSettings))
			});
		}
		logger.debug('Streaming settings cleanup', {
			indexerId: rows[0].id,
			rawSettings,
			sanitizedSettings
		});
		await db
			.update(indexers)
			.set({
				settings: sanitizedSettings,
				updatedAt: new Date().toISOString()
			})
			.where(eq(indexers.id, rows[0].id));
	}

	const settings: StreamingIndexerSettings = sanitizedSettings;

	// Reconstruct baseUrl from new split fields (useHttps + externalHost)
	if (settings.externalHost) {
		const host = settings.externalHost.replace(/^https?:\/\//, ''); // Strip protocol if accidentally included
		const useHttps = settings.useHttps === 'true';
		const protocol = useHttps ? 'https' : 'http';
		settings.baseUrl = `${protocol}://${host}`;
	}
	// Fall back to the current indexer baseUrl column
	else if (rows[0].baseUrl) {
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
