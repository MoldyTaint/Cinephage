import { buildMetadataProviderRegistry } from './provider-registry.js';
import type {
	MetadataMediaType,
	MetadataProvider,
	MetadataProviderId,
	MetadataProviderSelection
} from './providers/types.js';

type AnimePriorityId = Extract<MetadataProviderId, 'mal' | 'anilist' | 'tmdb'>;

export interface MetadataResolutionInput {
	mediaType: MetadataMediaType;
	seriesProvider?: MetadataProviderSelection | null;
	libraryProvider?: MetadataProviderSelection | null;
}

export async function resolveProviderWithFallback(
	input: MetadataResolutionInput
): Promise<{ selectedProviderId: MetadataProviderId; provider: MetadataProvider }> {
	const { providers, animePriority } = await buildMetadataProviderRegistry();
	const isAnime = input.mediaType === 'anime';
	const normalizedSeriesProvider = normalizeSelection(input.seriesProvider);
	const normalizedLibraryProvider = normalizeSelection(input.libraryProvider);
	const pickedExplicit =
		filterSelectionForMediaType(normalizedSeriesProvider, isAnime) ??
		filterSelectionForMediaType(normalizedLibraryProvider, isAnime);
	if (pickedExplicit) {
		const explicitProvider = providers.get(pickedExplicit);
		if (explicitProvider?.isConfigured()) {
			return { selectedProviderId: pickedExplicit, provider: explicitProvider };
		}
	}

	if (isAnime) {
		for (const providerId of animePriority) {
			const provider = providers.get(providerId as AnimePriorityId);
			if (provider?.isConfigured()) {
				return { selectedProviderId: providerId, provider };
			}
		}
	}

	const fallback = providers.get('tmdb');
	if (!fallback) {
		throw new Error('TMDB provider is not registered');
	}
	return { selectedProviderId: 'tmdb', provider: fallback };
}

function normalizeSelection(
	value: MetadataProviderSelection | null | undefined
): MetadataProviderId | null {
	if (!value || value === 'auto') return null;
	return value;
}

function filterSelectionForMediaType(
	value: MetadataProviderId | null,
	isAnime: boolean
): MetadataProviderId | null {
	if (!value) return null;
	if (!isAnime && (value === 'anilist' || value === 'mal')) {
		return null;
	}
	return value;
}
