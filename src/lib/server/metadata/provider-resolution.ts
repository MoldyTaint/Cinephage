/**
 * Anime metadata enrichment helpers.
 *
 * Anime providers (AniList, Jikan) are supplementary to TMDB. They contribute:
 *   - adult/hentai flag (WP-Q)
 *   - alternate / romaji titles (feeds alternate-title store for search)
 *   - additive genre tags (merged onto TMDB genres, never replacing)
 *
 * TMDB is always the canonical identity/overview/display record.
 */

import { randomUUID } from 'node:crypto';
import { buildMetadataProviderRegistry } from './provider-registry.js';
import { resolveAnimeProviderRef } from './provider-ref-resolver.js';
import type { MetadataDetails, MetadataMediaType } from './providers/types.js';
import { createChildLogger } from '$lib/logging';
import { db } from '$lib/server/db/index.js';
import { metadataConflicts } from '$lib/server/db/schema.js';

const logger = createChildLogger({ logDomain: 'system' as const });

export interface AnimeEnrichmentInput {
	tmdbTitle: string;
	aliases: string[];
	year?: number | null;
	/** TMDB id of the media being enriched - used for conflict tracking */
	tmdbId?: number;
}

export interface AnimeEnrichmentResult {
	/** Refs keyed by provider id ('anilist', 'mal') for storage in providerRefs */
	refs: Record<string, string>;
	/** Provider details from each provider that resolved, for adult flag and alt-title extraction */
	details: Record<string, MetadataDetails>;
}

/**
 * Fetch supplementary anime enrichment from AniList and Jikan.
 * Returns empty if enrichment is disabled in config.
 * Always fails soft: a provider outage does not throw.
 */
export async function enrichAnimeMetadata(
	input: AnimeEnrichmentInput,
	mediaType: MetadataMediaType
): Promise<AnimeEnrichmentResult> {
	const result: AnimeEnrichmentResult = { refs: {}, details: {} };

	const registry = await buildMetadataProviderRegistry();
	if (!registry.enrichmentEnabled) return result;

	const providerIds = ['anilist', 'mal'] as const;
	const providerResults: Record<string, { found: boolean; error?: string }> = {};
	const configuredProviders: string[] = [];

	await Promise.all(
		providerIds.map(async (providerId) => {
			const provider = registry.providers.get(providerId);
			if (!provider?.isConfigured()) return;
			configuredProviders.push(providerId);

			try {
				const ref = await resolveAnimeProviderRef({
					providerId,
					title: input.tmdbTitle,
					aliases: input.aliases,
					year: input.year ?? undefined
				});
				if (!ref) {
					providerResults[providerId] = { found: false };
					return;
				}

				const details = await provider.getDetails(ref, mediaType);
				if (!details) {
					providerResults[providerId] = { found: false };
					return;
				}

				result.refs[providerId] = ref;
				result.details[providerId] = details;
				providerResults[providerId] = { found: true };
			} catch (err) {
				const error = err instanceof Error ? err.message : String(err);
				providerResults[providerId] = { found: false, error };
				logger.warn(
					{ providerId, title: input.tmdbTitle, error },
					'[AnimeEnrichment] Provider failed - skipping'
				);
			}
		})
	);

	// Record a metadata conflict when all configured providers failed to resolve
	if (
		input.tmdbId &&
		configuredProviders.length > 0 &&
		configuredProviders.every((id) => !providerResults[id]?.found)
	) {
		const hasErrors = configuredProviders.some((id) => providerResults[id]?.error);
		db.insert(metadataConflicts)
			.values({
				id: randomUUID(),
				correlationId: randomUUID(),
				tmdbId: input.tmdbId,
				mediaType: mediaType === 'tv' || mediaType === 'anime' ? 'tv' : 'movie',
				mediaTitle: input.tmdbTitle,
				conflictType: hasErrors ? 'provider_error' : 'missing_provider',
				providersChecked: configuredProviders,
				providerResults,
				detectedAt: new Date().toISOString(),
				status: 'unresolved'
			})
			.catch((err) =>
				logger.warn({ err }, '[AnimeEnrichment] Failed to persist metadata conflict record')
			);
	}

	return result;
}
