import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { settings } from '$lib/server/db/schema.js';
import type { MetadataProviderConfig } from './providers/types.js';

const PROVIDER_SETTINGS_KEY = 'metadata_providers';

const DEFAULT_PROVIDER_CONFIG: MetadataProviderConfig = {
	animeEnrichmentEnabled: true,
	source: 'cinephage'
};

async function resolveDefaultSource(): Promise<'cinephage' | 'tmdb'> {
	const row = await db.query.settings.findFirst({
		where: eq(settings.key, 'tmdb_api_key')
	});
	return row ? 'tmdb' : 'cinephage';
}

export async function getMetadataProviderConfig(): Promise<MetadataProviderConfig> {
	const row = await db.query.settings.findFirst({
		where: eq(settings.key, PROVIDER_SETTINGS_KEY)
	});

	if (!row) {
		const source = await resolveDefaultSource();
		const config = { ...DEFAULT_PROVIDER_CONFIG, source };
		await db
			.insert(settings)
			.values({ key: PROVIDER_SETTINGS_KEY, value: JSON.stringify(config) })
			.onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(config) } });
		return config;
	}

	try {
		const parsed = JSON.parse(row.value) as Partial<MetadataProviderConfig> & {
			anilistEnabled?: boolean;
			malClientId?: string;
			animeProviderPriority?: unknown;
		};

		let source: 'cinephage' | 'tmdb' = DEFAULT_PROVIDER_CONFIG.source;

		if (parsed.source === 'tmdb' || parsed.source === 'cinephage') {
			source = parsed.source;
		} else {
			source = await resolveDefaultSource();
			const updated = JSON.stringify({ ...parsed, source });
			await db
				.insert(settings)
				.values({ key: PROVIDER_SETTINGS_KEY, value: updated })
				.onConflictDoUpdate({ target: settings.key, set: { value: updated } });
		}

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
		source:
			config.source === 'tmdb' || config.source === 'cinephage' ? config.source : current.source
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
