import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getIndexerManager } from '$lib/server/indexers/IndexerManager';
import { CINEPHAGE_STREAM_DEFINITION_ID } from '$lib/server/indexers/types';
import { sanitizeStreamingIndexerSettings } from '$lib/server/streaming/settings';
import { indexerCreateSchema } from '$lib/validation/schemas';
import { redactIndexer } from '$lib/server/utils/redaction.js';
import { requireAdmin } from '$lib/server/auth/authorization.js';
import { parseBody } from '$lib/server/api/validate.js';

/**
 * GET /api/indexers
 * List all configured indexers.
 * Note: API keys are redacted for security.
 */
export const GET: RequestHandler = async () => {
	const manager = await getIndexerManager();
	const all = await manager.getIndexers();

	// Redact sensitive settings (api keys, passwords, cookies)
	const redactedIndexers = all.map(redactIndexer);

	return json(redactedIndexers);
};

export const POST: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	const { request } = event;
	const validated = await parseBody(request, indexerCreateSchema);

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

	const settings =
		validated.definitionId === CINEPHAGE_STREAM_DEFINITION_ID
			? sanitizeStreamingIndexerSettings(validated.settings as Record<string, unknown> | null)
			: ((validated.settings ?? {}) as Record<string, string>);

	const created = await manager.createIndexer({
		name: validated.name,
		definitionId: validated.definitionId,
		baseUrl: validated.baseUrl,
		alternateUrls: validated.alternateUrls,
		enabled: validated.enabled,
		priority: validated.priority,
		settings,

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
};
