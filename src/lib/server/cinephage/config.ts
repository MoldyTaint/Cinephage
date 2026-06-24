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

interface StoredBackendConfig {
	version?: string;
	commit?: string;
	baseUrl?: string;
}

let _cachedOverrides: StoredBackendConfig | null = null;
let _overridesTimestamp = 0;
let _overridesPromise: Promise<StoredBackendConfig> | null = null;

async function loadStoredConfig(): Promise<StoredBackendConfig> {
	const now = Date.now();
	if (_cachedOverrides !== null && now - _overridesTimestamp < CONFIG_CACHE_TTL_MS) {
		return _cachedOverrides;
	}

	if (!_overridesPromise) {
		_overridesPromise = (async () => {
			try {
				const config: StoredBackendConfig = {};
				const row = await db.query.settings.findFirst({
					where: eq(settings.key, CINEPHAGE_BACKEND_SETTINGS_KEY)
				});

				if (row) {
					try {
						const parsed = JSON.parse(row.value) as unknown;
						if (isRecord(parsed)) {
							const baseUrl = getFirstString(parsed.baseUrl);
							if (baseUrl) config.baseUrl = baseUrl;
							const version = getFirstString(parsed.version);
							if (version) config.version = version;
							const commit = getFirstString(parsed.commit);
							if (commit) config.commit = commit;
						}
					} catch (error) {
						logger.error({ err: error }, 'Failed to parse cinephage_backend settings');
					}
				}

				_cachedOverrides = config;
				_overridesTimestamp = Date.now();
				return config;
			} finally {
				_overridesPromise = null;
			}
		})();
	}

	return _overridesPromise;
}

export async function getCinephageBackendConfig(): Promise<CinephageBackendConfig> {
	const [stored, streamingSettings] = await Promise.all([
		loadStoredConfig(),
		getStreamingIndexerSettings()
	]);

	const version =
		stored.version?.trim() || streamingSettings?.cinephageVersion?.trim() || undefined;
	const commit = stored.commit?.trim() || streamingSettings?.cinephageCommit?.trim() || undefined;
	const baseUrl = (stored.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');

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
