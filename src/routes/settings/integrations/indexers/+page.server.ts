import type { PageServerLoad } from './$types';
import { getIndexerManager } from '$lib/server/indexers/IndexerManager';
import { toUIDefinition } from '$lib/server/indexers/loader';
import { getPersistentStatusTracker } from '$lib/server/indexers/status';
import { CINEPHAGE_STREAM_DEFINITION_ID } from '$lib/server/indexers/types';
import type { IndexerDefinition, IndexerWithStatus } from '$lib/types/indexer';

export const load: PageServerLoad = async () => {
	const manager = await getIndexerManager();
	const indexerConfigs = await manager.getIndexers();
	const statusTracker = getPersistentStatusTracker();

	const statusEntries = await Promise.all(
		indexerConfigs.map(
			async (config) => [config.id, await statusTracker.getStatus(config.id)] as const
		)
	);
	const statusByIndexerId = new Map(statusEntries);

	const toStringSettings = (
		settings: Record<string, unknown> | undefined
	): Record<string, string> | null => {
		if (!settings) return null;
		const result: Record<string, string> = {};
		for (const [key, value] of Object.entries(settings)) {
			if (value !== undefined && value !== null) {
				result[key] = String(value);
			}
		}
		return Object.keys(result).length > 0 ? result : null;
	};

	const getDisplayBaseUrl = (
		config: (typeof indexerConfigs)[number],
		settings: Record<string, string> | null
	): string => {
		if (config.definitionId !== CINEPHAGE_STREAM_DEFINITION_ID || !settings?.externalHost) {
			return config.baseUrl;
		}

		const host = settings.externalHost.trim().replace(/^https?:\/\//i, '');
		if (!host) return config.baseUrl;

		const useHttps =
			settings.useHttps === 'true' ||
			settings.useHttps === '1' ||
			settings.useHttps?.toLowerCase() === 'yes';
		const protocol = useHttps ? 'https' : 'http';

		return `${protocol}://${host}`.replace(/\/$/, '');
	};

	const indexers: IndexerWithStatus[] = indexerConfigs.map((config) => {
		const status = statusByIndexerId.get(config.id);
		const settings = toStringSettings(config.settings);
		const displayBaseUrl = getDisplayBaseUrl(config, settings);

		return {
			id: config.id,
			name: config.name,
			definitionId: config.definitionId,
			enabled: config.enabled,
			baseUrl: displayBaseUrl,
			alternateUrls: config.alternateUrls,
			priority: config.priority,
			protocol: config.protocol,
			settings,
			enableAutomaticSearch: config.enableAutomaticSearch,
			enableInteractiveSearch: config.enableInteractiveSearch,
			minimumSeeders: config.minimumSeeders,
			seedRatio: config.seedRatio,
			seedTime: config.seedTime,
			packSeedTime: config.packSeedTime,
			rejectDeadTorrents: config.rejectDeadTorrents,
			status: status
				? {
						healthy: status.health === 'healthy',
						enabled: status.isEnabled,
						consecutiveFailures: status.consecutiveFailures,
						lastFailure: status.lastFailure?.toISOString(),
						disabledUntil: status.disabledUntil?.toISOString(),
						averageResponseTime: status.avgResponseTime
					}
				: undefined
		};
	});

	const definitions: IndexerDefinition[] = manager
		.getUnifiedDefinitions()
		.map(toUIDefinition)
		.sort((a, b) => a.name.localeCompare(b.name));

	return {
		indexers,
		definitions,
		definitionErrors: manager.getDefinitionErrors()
	};
};
