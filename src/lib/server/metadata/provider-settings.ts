import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { settings } from '$lib/server/db/schema.js';
import type { MetadataProviderConfig } from './providers/types.js';

const PROVIDER_SETTINGS_KEY = 'metadata_providers';

const DEFAULT_PROVIDER_CONFIG: MetadataProviderConfig = {
	animeEnrichmentEnabled: true,
	source: 'tmdb'
};

/**
 * The Cinephage metadata source is currently locked (upcoming feature).
 * Always resolves to 'tmdb' regardless of stored value or API key presence.
 * Remove this clamp to re-enable the Cinephage source.
 */
const LOCKED_SOURCE: MetadataProviderConfig['source'] = 'tmdb';

async function resolveDefaultSource(): Promise<'cinephage' | 'tmdb'> {
	return LOCKED_SOURCE;
}

export async function getMetadataProviderConfig(): Promise<MetadataProviderConfig> {
	const row = await db.query.settings.findFirst({
		where: eq(settings.key, PROVIDER_SETTINGS_KEY)
	});

	if (!row) {
		const source = await resolveDefaultSource();
		return { ...DEFAULT_PROVIDER_CONFIG, source };
	}

	try {
		const parsed = JSON.parse(row.value) as Partial<MetadataProviderConfig> & {
			anilistEnabled?: boolean;
			malClientId?: string;
			animeProviderPriority?: unknown;
		};

		const source = LOCKED_SOURCE;

		return {
			animeEnrichmentEnabled:
				typeof parsed.animeEnrichmentEnabled === 'boolean'
					? parsed.animeEnrichmentEnabled
					: Boolean(parsed.anilistEnabled) || Boolean(parsed.malClientId)
						? true
						: DEFAULT_PROVIDER_CONFIG.animeEnrichmentEnabled,
			source
		};
	} catch {
		const source = await resolveDefaultSource();
		return { ...DEFAULT_PROVIDER_CONFIG, source };
	}
}

export async function setMetadataProviderConfig(
	config: Partial<MetadataProviderConfig>
): Promise<MetadataProviderConfig> {
	const current = await getMetadataProviderConfig();
	const next: MetadataProviderConfig = {
		animeEnrichmentEnabled:
			typeof config.animeEnrichmentEnabled === 'boolean'
				? config.animeEnrichmentEnabled
				: current.animeEnrichmentEnabled,
		source: LOCKED_SOURCE
	};

	await db
		.insert(settings)
		.values({ key: PROVIDER_SETTINGS_KEY, value: JSON.stringify(next) })
		.onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(next) } });

	return next;
}

export function getDefaultMetadataProviderConfig(): MetadataProviderConfig {
	return DEFAULT_PROVIDER_CONFIG;
}
