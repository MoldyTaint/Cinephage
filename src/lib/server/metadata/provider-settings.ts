import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { settings } from '$lib/server/db/schema.js';
import type { MetadataProviderConfig } from './providers/types.js';

const PROVIDER_SETTINGS_KEY = 'metadata_providers';

const DEFAULT_PROVIDER_CONFIG: MetadataProviderConfig = {
	anilistEnabled: false,
	malClientId: '',
	animeProviderPriority: ['anilist', 'mal', 'tmdb']
};

function normalizePriority(value: unknown): MetadataProviderConfig['animeProviderPriority'] {
	const allowed = new Set(['anilist', 'mal', 'tmdb']);
	const configured = Array.isArray(value)
		? value.filter((entry) => allowed.has(String(entry)))
		: [];
	const deduped = [...new Set(configured)] as MetadataProviderConfig['animeProviderPriority'];
	for (const fallback of DEFAULT_PROVIDER_CONFIG.animeProviderPriority) {
		if (!deduped.includes(fallback)) deduped.push(fallback);
	}
	return deduped;
}

export async function getMetadataProviderConfig(): Promise<MetadataProviderConfig> {
	const row = await db.query.settings.findFirst({
		where: eq(settings.key, PROVIDER_SETTINGS_KEY)
	});

	if (!row) return DEFAULT_PROVIDER_CONFIG;

	try {
		const parsed = JSON.parse(row.value) as Partial<MetadataProviderConfig>;
		return {
			anilistEnabled: Boolean(parsed.anilistEnabled),
			malClientId: String(parsed.malClientId ?? '').trim(),
			animeProviderPriority: normalizePriority(parsed.animeProviderPriority)
		};
	} catch {
		return DEFAULT_PROVIDER_CONFIG;
	}
}

export async function setMetadataProviderConfig(
	config: Partial<MetadataProviderConfig>
): Promise<MetadataProviderConfig> {
	const current = await getMetadataProviderConfig();
	const next: MetadataProviderConfig = {
		anilistEnabled:
			typeof config.anilistEnabled === 'boolean' ? config.anilistEnabled : current.anilistEnabled,
		malClientId:
			typeof config.malClientId === 'string' ? config.malClientId.trim() : current.malClientId,
		animeProviderPriority: normalizePriority(
			config.animeProviderPriority ?? current.animeProviderPriority
		)
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
