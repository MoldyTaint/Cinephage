import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { settings } from '$lib/server/db/schema';
import { logger } from '$lib/logging';
import { getStreamingIndexerSettings } from '$lib/server/streaming/settings.js';
import { getFirstString, isRecord } from './shared.js';

export const CINEPHAGE_BACKEND_SETTINGS_KEY = 'cinephage_backend';
const DEFAULT_BASE_URL = 'https://api.cinephage.net';
const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;

export interface CinephageBackendConfig {
	version?: string;
	commit?: string;
	baseUrl: string;
	configured: boolean;
	missing: string[];
}

interface StoredBackendOverrides {
	baseUrl?: string;
}

let _cachedOverrides: StoredBackendOverrides | null = null;
let _overridesTimestamp = 0;
let _overridesPromise: Promise<StoredBackendOverrides> | null = null;

async function loadOverrides(): Promise<StoredBackendOverrides> {
	const now = Date.now();
	if (_cachedOverrides !== null && now - _overridesTimestamp < CONFIG_CACHE_TTL_MS) {
		return _cachedOverrides;
	}

	if (!_overridesPromise) {
		_overridesPromise = (async () => {
			try {
				let overrides: StoredBackendOverrides = {};
				const row = await db.query.settings.findFirst({
					where: eq(settings.key, CINEPHAGE_BACKEND_SETTINGS_KEY)
				});

				if (row) {
					try {
						const parsed = JSON.parse(row.value) as unknown;
						if (isRecord(parsed)) {
							const baseUrl = getFirstString(parsed.baseUrl);
							if (baseUrl) {
								overrides = { baseUrl };
							}
						}
					} catch (error) {
						logger.error({ err: error }, 'Failed to parse cinephage_backend settings');
					}
				}

				_cachedOverrides = overrides;
				_overridesTimestamp = Date.now();
				return overrides;
			} finally {
				_overridesPromise = null;
			}
		})();
	}

	return _overridesPromise;
}

export async function getCinephageBackendConfig(): Promise<CinephageBackendConfig> {
	const [overrides, streamingSettings] = await Promise.all([
		loadOverrides(),
		getStreamingIndexerSettings()
	]);

	const version = streamingSettings?.cinephageVersion?.trim() || undefined;
	const commit = streamingSettings?.cinephageCommit?.trim() || undefined;
	const baseUrl = (overrides.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');

	const missing: string[] = [];
	if (!version) {
		missing.push('cinephageVersion');
	}
	if (!commit) {
		missing.push('cinephageCommit');
	}

	return {
		version,
		commit,
		baseUrl,
		configured: missing.length === 0,
		missing
	};
}

export function invalidateCinephageBackendConfig(): void {
	_cachedOverrides = null;
	_overridesTimestamp = 0;
	_overridesPromise = null;
}
