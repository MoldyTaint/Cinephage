import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { indexerCreateSchema, indexerUpdateSchema } from '$lib/validation/schemas';
import { getIndexerManager } from '$lib/server/indexers/IndexerManager';
import {
	getDefinitionLoader,
	initializeDefinitions,
	toUIDefinition
} from '$lib/server/indexers/loader';
import type { IndexerDefinition, Indexer } from '$lib/types/indexer';

export const load: PageServerLoad = async () => {
	const manager = await getIndexerManager();
	const indexerConfigs = await manager.getIndexers();

	// Initialize definition loader (if not already)
	const definitionLoader = getDefinitionLoader();
	if (!definitionLoader.isLoaded()) {
		await initializeDefinitions();
	}

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

	// Map to UI types
	const indexers: Indexer[] = indexerConfigs.map((config) => ({
		id: config.id,
		name: config.name,
		definitionId: config.definitionId,
		enabled: config.enabled,
		baseUrl: config.baseUrl,
		alternateUrls: config.alternateUrls,
		priority: config.priority,
		protocol: config.protocol,
		settings: toStringSettings(config.settings),

		// Search capability toggles
		enableAutomaticSearch: config.enableAutomaticSearch,
		enableInteractiveSearch: config.enableInteractiveSearch,

		// Torrent seeding settings
		minimumSeeders: config.minimumSeeders,
		seedRatio: config.seedRatio,
		seedTime: config.seedTime,
		packSeedTime: config.packSeedTime,
		preferMagnetUrl: config.preferMagnetUrl
	}));

	// Get all definitions from unified loader and convert to UI format
	const allDefinitions = definitionLoader.getAll();
	const definitions: IndexerDefinition[] = allDefinitions
		.map(toUIDefinition)
		.sort((a, b) => a.name.localeCompare(b.name));

	return {
		indexers,
		definitions
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
				preferMagnetUrl: result.data.preferMagnetUrl
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
				preferMagnetUrl: result.data.preferMagnetUrl
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
