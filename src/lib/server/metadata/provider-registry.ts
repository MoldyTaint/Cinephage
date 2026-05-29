import { getMetadataProviderConfig } from './provider-settings.js';
import { AniListProvider } from './providers/anilist.js';
import { MalProvider } from './providers/mal.js';
import { TmdbMetadataProvider } from './providers/tmdb.js';
import type { MetadataProvider, MetadataProviderId } from './providers/types.js';

export interface MetadataProviderRegistry {
	providers: Map<MetadataProviderId, MetadataProvider>;
	animePriority: Array<Extract<MetadataProviderId, 'mal' | 'anilist' | 'tmdb'>>;
}

export async function buildMetadataProviderRegistry(): Promise<MetadataProviderRegistry> {
	const config = await getMetadataProviderConfig();
	const providers = new Map<MetadataProviderId, MetadataProvider>();

	providers.set('tmdb', new TmdbMetadataProvider());
	providers.set('anilist', new AniListProvider(config.anilistEnabled));
	providers.set('mal', new MalProvider(config.malClientId));

	return { providers, animePriority: config.animeProviderPriority };
}
