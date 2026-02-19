import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { indexerCreateSchema, indexerUpdateSchema } from '$lib/validation/schemas';
import { getIndexerManager } from '$lib/server/indexers/IndexerManager';
import { toUIDefinition } from '$lib/server/indexers/loader';
import { getPersistentStatusTracker } from '$lib/server/indexers/status';
import { CINEPHAGE_STREAM_DEFINITION_ID } from '$lib/server/indexers/types';
import type { IndexerDefinition, IndexerWithStatus } from '$lib/types/indexer';

export const load: PageServerLoad = async () => {
	const manager = await getIndexerManager();
	const indexerConfigs = await manager.getIndexers();
	const statusTracker = getPersistentStatusTracker();

	// Load runtime health status for each indexer from persistent tracker.
	const statusEntries = await Promise.all(
		indexerConfigs.map(
			async (config) => [config.id, await statusTracker.getStatus(config.id)] as const
		)
	);
	const statusByIndexerId = new Map(statusEntries);

	// Helper to convert settings to string values only
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

	// For the built-in streaming indexer, display the configured external host (if present)
	// instead of the static internal base URL.
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

	// Map to UI types
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

			// Search capability toggles
			enableAutomaticSearch: config.enableAutomaticSearch,
			enableInteractiveSearch: config.enableInteractiveSearch,

			// Torrent seeding settings
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

	// Get all definitions from manager and convert to UI format
	const allDefinitions = manager.getUnifiedDefinitions();
	const definitions: IndexerDefinition[] = allDefinitions
		.map(toUIDefinition)
		.sort((a, b) => a.name.localeCompare(b.name));

	// Get any definition loading errors to surface to UI
	const definitionErrors = manager.getDefinitionErrors();

	return {
		indexers,
		definitions,
		definitionErrors
	};
};

export const actions: Actions = {
	createIndexer: async ({ request }) => {
		const data = await request.formData();
		const jsonData = data.get('data');

		if (!jsonData || typeof jsonData !== 'string') {
			return fail(400, { indexerError: 'Invalid request data' });
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(jsonData);
		} catch {
			return fail(400, { indexerError: 'Invalid JSON data' });
		}

		const result = indexerCreateSchema.safeParse(parsed);
		if (!result.success) {
			return fail(400, {
				indexerError: result.error.issues[0]?.message ?? 'Validation failed'
			});
		}

		const manager = await getIndexerManager();

		// Verify definition exists
		const definition = manager.getDefinition(result.data.definitionId);
		if (!definition) {
			return fail(400, { indexerError: 'Unknown indexer definition' });
		}

		try {
			await manager.createIndexer({
				name: result.data.name,
				definitionId: result.data.definitionId,
				baseUrl: result.data.baseUrl,
				alternateUrls: result.data.alternateUrls,
				enabled: result.data.enabled,
				priority: result.data.priority,
				settings: (result.data.settings ?? {}) as Record<string, string>,

				// Search capability toggles
				enableAutomaticSearch: result.data.enableAutomaticSearch,
				enableInteractiveSearch: result.data.enableInteractiveSearch,

				// Torrent seeding settings
				minimumSeeders: result.data.minimumSeeders,
				seedRatio: result.data.seedRatio ?? null,
				seedTime: result.data.seedTime ?? null,
				packSeedTime: result.data.packSeedTime ?? null,
				rejectDeadTorrents: result.data.rejectDeadTorrents
			});

			return { indexerSuccess: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return fail(500, { indexerError: message });
		}
	},

	updateIndexer: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id');
		const jsonData = data.get('data');

		if (!id || typeof id !== 'string') {
			return fail(400, { indexerError: 'Missing indexer ID' });
		}

		if (!jsonData || typeof jsonData !== 'string') {
			return fail(400, { indexerError: 'Invalid request data' });
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(jsonData);
		} catch {
			return fail(400, { indexerError: 'Invalid JSON data' });
		}

		const result = indexerUpdateSchema.safeParse(parsed);
		if (!result.success) {
			return fail(400, {
				indexerError: result.error.issues[0]?.message ?? 'Validation failed'
			});
		}

		const manager = await getIndexerManager();

		try {
			await manager.updateIndexer(id, {
				name: result.data.name,
				enabled: result.data.enabled,
				baseUrl: result.data.baseUrl,
				alternateUrls: result.data.alternateUrls,
				priority: result.data.priority,
				settings: result.data.settings as Record<string, string> | undefined,

				// Search capability toggles
				enableAutomaticSearch: result.data.enableAutomaticSearch,
				enableInteractiveSearch: result.data.enableInteractiveSearch,

				// Torrent seeding settings
				minimumSeeders: result.data.minimumSeeders,
				seedRatio: result.data.seedRatio,
				seedTime: result.data.seedTime,
				packSeedTime: result.data.packSeedTime,
				rejectDeadTorrents: result.data.rejectDeadTorrents
			});

			return { indexerSuccess: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return fail(500, { indexerError: message });
		}
	},

	deleteIndexer: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id');

		if (!id || typeof id !== 'string') {
			return fail(400, { indexerError: 'Missing indexer ID' });
		}

		const manager = await getIndexerManager();

		try {
			await manager.deleteIndexer(id);
			return { indexerSuccess: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return fail(500, { indexerError: message });
		}
	},

	toggleIndexer: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id');
		const enabled = data.get('enabled') === 'true';

		if (!id || typeof id !== 'string') {
			return fail(400, { indexerError: 'Missing indexer ID' });
		}

		const manager = await getIndexerManager();

		try {
			await manager.updateIndexer(id, { enabled });
			return { indexerSuccess: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return fail(500, { indexerError: message });
		}
	},

	reorderPriorities: async ({ request }) => {
		const data = await request.formData();
		const idsJson = data.get('ids');

		if (!idsJson || typeof idsJson !== 'string') {
			return fail(400, { indexerError: 'Missing indexer IDs' });
		}

		let ids: unknown;
		try {
			ids = JSON.parse(idsJson);
		} catch {
			return fail(400, { indexerError: 'Invalid IDs format' });
		}

		if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) {
			return fail(400, { indexerError: 'Invalid IDs payload' });
		}

		const manager = await getIndexerManager();

		try {
			for (const [index, id] of ids.entries()) {
				await manager.updateIndexer(id, { priority: index + 1 });
			}
			return { indexerSuccess: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return fail(500, { indexerError: message });
		}
	},

	bulkEnable: async ({ request }) => {
		const data = await request.formData();
		const idsJson = data.get('ids');

		if (!idsJson || typeof idsJson !== 'string') {
			return fail(400, { indexerError: 'Missing indexer IDs' });
		}

		let ids: string[];
		try {
			ids = JSON.parse(idsJson);
		} catch {
			return fail(400, { indexerError: 'Invalid IDs format' });
		}

		const manager = await getIndexerManager();

		try {
			for (const id of ids) {
				await manager.updateIndexer(id, { enabled: true });
			}
			return { indexerSuccess: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return fail(500, { indexerError: message });
		}
	},

	bulkDisable: async ({ request }) => {
		const data = await request.formData();
		const idsJson = data.get('ids');

		if (!idsJson || typeof idsJson !== 'string') {
			return fail(400, { indexerError: 'Missing indexer IDs' });
		}

		let ids: string[];
		try {
			ids = JSON.parse(idsJson);
		} catch {
			return fail(400, { indexerError: 'Invalid IDs format' });
		}

		const manager = await getIndexerManager();

		try {
			for (const id of ids) {
				await manager.updateIndexer(id, { enabled: false });
			}
			return { indexerSuccess: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return fail(500, { indexerError: message });
		}
	},

	bulkDelete: async ({ request }) => {
		const data = await request.formData();
		const idsJson = data.get('ids');

		if (!idsJson || typeof idsJson !== 'string') {
			return fail(400, { indexerError: 'Missing indexer IDs' });
		}

		let ids: string[];
		try {
			ids = JSON.parse(idsJson);
		} catch {
			return fail(400, { indexerError: 'Invalid IDs format' });
		}

		const manager = await getIndexerManager();

		try {
			for (const id of ids) {
				await manager.deleteIndexer(id);
			}
			return { indexerSuccess: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return fail(500, { indexerError: message });
		}
	}
};
