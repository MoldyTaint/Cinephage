import type { IndexerCapabilities, IndexerConfig, SearchType } from '../types';
import { CINEPHAGE_STREAM_DEFINITION_ID, indexerHasCategoriesForSearchType } from '../types';

export type IndexerAvailabilityCode =
	| 'OK'
	| 'NO_INDEXER_CONFIGURED'
	| 'NO_INDEXER_ENABLED'
	| 'NO_INDEXER_SEARCH_DISABLED'
	| 'NO_INDEXER_COMPATIBLE';

export interface IndexerAvailabilityResult {
	ok: boolean;
	code: IndexerAvailabilityCode;
	message?: string;
}

interface EvaluateIndexerAvailabilityOptions {
	searchType: SearchType;
	searchSource: 'interactive' | 'automatic';
	protocolFilter?: string[];
	scoringProfileId?: string | null;
	getDefinitionCapabilities: (definitionId: string) => IndexerCapabilities | undefined;
}

function supportsSearchType(
	capabilities: IndexerCapabilities | undefined,
	searchType: SearchType
): boolean {
	if (!capabilities) return false;

	switch (searchType) {
		case 'movie':
			return (
				(capabilities.movieSearch?.available ?? false) &&
				indexerHasCategoriesForSearchType(capabilities.categories, 'movie')
			);
		case 'tv':
			return (
				(capabilities.tvSearch?.available ?? false) &&
				indexerHasCategoriesForSearchType(capabilities.categories, 'tv')
			);
		case 'music':
			return (
				(capabilities.musicSearch?.available ?? false) &&
				indexerHasCategoriesForSearchType(capabilities.categories, 'music')
			);
		case 'book':
			return (
				(capabilities.bookSearch?.available ?? false) &&
				indexerHasCategoriesForSearchType(capabilities.categories, 'book')
			);
		case 'basic':
			return capabilities.search?.available ?? true;
		default:
			return false;
	}
}

export function evaluateIndexerSearchAvailability(
	configs: IndexerConfig[],
	options: EvaluateIndexerAvailabilityOptions
): IndexerAvailabilityResult {
	const isStreamerProfile = options.scoringProfileId === 'streamer';

	if (configs.length === 0) {
		return {
			ok: false,
			code: 'NO_INDEXER_CONFIGURED',
			message: 'No indexers are configured. Add an indexer in Settings -> Integrations -> Indexers.'
		};
	}

	const protocolFiltered =
		options.protocolFilter && options.protocolFilter.length > 0
			? configs.filter((config) => options.protocolFilter!.includes(config.protocol))
			: configs;

	if (protocolFiltered.length === 0) {
		return {
			ok: false,
			code: 'NO_INDEXER_CONFIGURED',
			message:
				'No indexers are configured for the selected protocol/profile. Add or adjust indexers in Settings -> Integrations -> Indexers.'
		};
	}

	const profileScoped = isStreamerProfile
		? protocolFiltered.filter((config) => config.definitionId === CINEPHAGE_STREAM_DEFINITION_ID)
		: protocolFiltered;

	if (isStreamerProfile && profileScoped.length === 0) {
		return {
			ok: false,
			code: 'NO_INDEXER_CONFIGURED',
			message:
				'Streamer profile requires the Cinephage Library indexer. Add or restore it in Settings -> Integrations -> Indexers.'
		};
	}

	const searchTypeCompatible = profileScoped.filter((config) =>
		supportsSearchType(options.getDefinitionCapabilities(config.definitionId), options.searchType)
	);

	if (searchTypeCompatible.length === 0) {
		return {
			ok: false,
			code: 'NO_INDEXER_COMPATIBLE',
			message: isStreamerProfile
				? `Cinephage Library indexer does not support this ${options.searchType} search.`
				: `No configured indexers support ${options.searchType} searches.`
		};
	}

	const sourceEnabled = searchTypeCompatible.filter((config) =>
		options.searchSource === 'interactive'
			? config.enableInteractiveSearch !== false
			: config.enableAutomaticSearch !== false
	);

	if (sourceEnabled.length === 0) {
		return {
			ok: false,
			code: 'NO_INDEXER_SEARCH_DISABLED',
			message: isStreamerProfile
				? `Cinephage Library indexer has ${options.searchSource} search disabled. Enable it for Streamer profile searches.`
				: `No indexers are enabled for ${options.searchSource} search. Enable ${options.searchSource} search on at least one indexer.`
		};
	}

	const activelyEnabled = sourceEnabled.filter((config) => config.enabled);
	if (activelyEnabled.length === 0) {
		return {
			ok: false,
			code: 'NO_INDEXER_ENABLED',
			message: isStreamerProfile
				? 'Cinephage Library indexer is disabled. Enable it in Settings -> Integrations -> Indexers for Streamer profile.'
				: 'No enabled indexers are available. Enable at least one indexer in Settings -> Integrations -> Indexers.'
		};
	}

	return { ok: true, code: 'OK' };
}
