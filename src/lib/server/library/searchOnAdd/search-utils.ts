/**
 * Search On Add — shared utilities and constants
 */

import {
	CINEPHAGE_STREAM_DEFINITION_ID,
	indexerHasCategoriesForSearchType
} from '$lib/server/indexers/types';
import type { IndexerCapabilities, IndexerConfig } from '$lib/server/indexers/types';

export const AUTO_GRAB_MIN_SCORE = 0;

export function isRuTrackerIndexerName(indexerName: string | undefined): boolean {
	if (typeof indexerName !== 'string') return false;
	const normalized = indexerName.toLowerCase();
	return normalized.includes('rutracker') || normalized.includes('kinozal');
}

export function isRuTrackerHost(baseUrl: string | undefined): boolean {
	if (!baseUrl) return false;
	try {
		const hostname = new URL(baseUrl).hostname.toLowerCase();
		return hostname.includes('rutracker') || hostname.includes('kinozal');
	} catch {
		const host = baseUrl.toLowerCase();
		return host.includes('rutracker') || host.includes('kinozal');
	}
}

export function resolveAutoMissingSearchStrategy(
	indexerConfigs: IndexerConfig[],
	options: {
		searchSource: 'interactive' | 'automatic';
		scoringProfileId?: string | null;
		getDefinitionCapabilities: (definitionId: string) => IndexerCapabilities | undefined;
	}
): 'pack-first' | 'episode-only' {
	const isStreamerProfile = options.scoringProfileId === 'streamer';
	const profileScoped = isStreamerProfile
		? indexerConfigs.filter((config) => config.definitionId === CINEPHAGE_STREAM_DEFINITION_ID)
		: indexerConfigs;

	const eligibleTvIndexers = profileScoped.filter((config) => {
		if (!config.enabled) return false;
		if (options.searchSource === 'interactive' && config.enableInteractiveSearch === false)
			return false;
		if (options.searchSource === 'automatic' && config.enableAutomaticSearch === false)
			return false;

		const capabilities = options.getDefinitionCapabilities(config.definitionId);
		return Boolean(
			capabilities?.tvSearch?.available &&
			indexerHasCategoriesForSearchType(capabilities.categories, 'tv')
		);
	});

	const hasRuTracker = eligibleTvIndexers.some(
		(config) => isRuTrackerIndexerName(config.name) || isRuTrackerHost(config.baseUrl)
	);
	const hasNonRuTracker = eligibleTvIndexers.some(
		(config) => !(isRuTrackerIndexerName(config.name) || isRuTrackerHost(config.baseUrl))
	);

	return hasRuTracker && !hasNonRuTracker ? 'episode-only' : 'pack-first';
}
