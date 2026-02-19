import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getIndexerManager } from '$lib/server/indexers/IndexerManager';
import { indexerCreateSchema } from '$lib/validation/schemas';

/**
 * GET /api/indexers
 * List all configured indexers.
 * Note: API keys are redacted for security.
 */
export const GET: RequestHandler = async () => {
	const manager = await getIndexerManager();
	const all = await manager.getIndexers();

	// Redact sensitive settings (api keys, passwords, cookies)
	const redactedIndexers = all.map((indexer) => ({
		...indexer,
		settings: Object.fromEntries(
			Object.entries(indexer.settings ?? {}).map(([key, value]) => {
				const lowerKey = key.toLowerCase();
				if (
					lowerKey.includes('key') ||
					lowerKey.includes('password') ||
					lowerKey.includes('secret') ||
					lowerKey.includes('token') ||
					lowerKey.includes('cookie')
				) {
					return [key, value ? '[REDACTED]' : null];
				}
				return [key, value];
			})
		)
	}));

	return json(redactedIndexers);
};

export const POST: RequestHandler = async ({ request }) => {
	let data: unknown;
	try {
		data = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const result = indexerCreateSchema.safeParse(data);

	if (!result.success) {
		return json(
			{
				error: 'Validation failed',
				details: result.error.flatten()
			},
			{ status: 400 }
		);
	}

	const validated = result.data;

	const manager = await getIndexerManager();

	// Verify the definition exists
	const definition = manager.getDefinition(validated.definitionId);
	if (!definition) {
		return json(
			{
				error: 'Invalid definition',
				details: `Unknown indexer definition: ${validated.definitionId}`
			},
			{ status: 400 }
		);
	}

	try {
		const created = await manager.createIndexer({
			name: validated.name,
			definitionId: validated.definitionId,
			baseUrl: validated.baseUrl,
			alternateUrls: validated.alternateUrls,
			enabled: validated.enabled,
			priority: validated.priority,
			settings: (validated.settings ?? {}) as Record<string, string>,

			// Search capability toggles
			enableAutomaticSearch: validated.enableAutomaticSearch,
			enableInteractiveSearch: validated.enableInteractiveSearch,

			// Torrent seeding settings (stored in protocolSettings)
			minimumSeeders: validated.minimumSeeders,
			seedRatio: validated.seedRatio ?? null,
			seedTime: validated.seedTime ?? null,
			packSeedTime: validated.packSeedTime ?? null
		});

		return json({ success: true, indexer: created });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json({ error: message }, { status: 500 });
	}
};
