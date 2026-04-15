import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getIndexerManager } from '$lib/server/indexers/IndexerManager';
import { CINEPHAGE_STREAM_DEFINITION_ID } from '$lib/server/indexers/types';
import { sanitizeStreamingIndexerSettings } from '$lib/server/streaming/settings';
import { indexerUpdateSchema } from '$lib/validation/schemas';
import { createChildLogger } from '$lib/logging';
import { assertFound, parseBody } from '$lib/server/api/validate';
import { NotFoundError } from '$lib/errors';
import { redactIndexer } from '$lib/server/utils/redaction.js';
import { requireAdmin } from '$lib/server/auth/authorization.js';

const logger = createChildLogger({ module: 'IndexerAPI' });

export const GET: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	const { params } = event;
	const manager = await getIndexerManager();
	const indexer = assertFound(await manager.getIndexer(params.id), 'Indexer', params.id);

	return json(redactIndexer(indexer));
};

export const DELETE: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	const { params } = event;
	const manager = await getIndexerManager();

	try {
		await manager.deleteIndexer(params.id);
		return json({ success: true });
	} catch (error) {
		if (error instanceof Error && error.message.includes('not found')) {
			throw new NotFoundError('Indexer', params.id);
		}
		throw error;
	}
};

export const PUT: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	const { params, request } = event;
	const validated = await parseBody(request, indexerUpdateSchema);
	const manager = await getIndexerManager();

	// Get existing indexer to compare settings (for detecting baseUrl changes)
	const existingIndexer = assertFound(await manager.getIndexer(params.id), 'Indexer', params.id);

	// Check if this is the streaming indexer and capture old baseUrl
	const isStreamingIndexer = existingIndexer.definitionId === CINEPHAGE_STREAM_DEFINITION_ID;
	const oldBaseUrl = existingIndexer.baseUrl;
	const newBaseUrl = validated.baseUrl;
	const settings =
		validated.settings === undefined
			? undefined
			: isStreamingIndexer
				? sanitizeStreamingIndexerSettings(validated.settings as Record<string, unknown> | null)
				: (validated.settings as Record<string, string> | undefined);

	try {
		const updated = await manager.updateIndexer(params.id, {
			name: validated.name,
			enabled: validated.enabled,
			baseUrl: validated.baseUrl,
			alternateUrls: validated.alternateUrls,
			priority: validated.priority,
			settings,

			// Search capability toggles
			enableAutomaticSearch: validated.enableAutomaticSearch,
			enableInteractiveSearch: validated.enableInteractiveSearch,

			// Torrent seeding settings
			minimumSeeders: validated.minimumSeeders,
			seedRatio: validated.seedRatio,
			seedTime: validated.seedTime,
			packSeedTime: validated.packSeedTime,
			rejectDeadTorrents: validated.rejectDeadTorrents
		});

		// If streaming indexer's baseUrl changed, trigger bulk .strm file update
		if (isStreamingIndexer && newBaseUrl && oldBaseUrl !== newBaseUrl) {
			logger.info(
				{
					oldBaseUrl,
					newBaseUrl
				},
				'[IndexerAPI] Streaming baseUrl changed, triggering .strm file update'
			);

			// Run in background to not block the response
			import('$lib/server/streaming')
				.then(async ({ strmService, getStreamingBaseUrl }) => {
					const baseUrl = await getStreamingBaseUrl(newBaseUrl);
					const result = await strmService.bulkUpdateStrmUrls(baseUrl);
					logger.info(
						{
							totalFiles: result.totalFiles,
							updatedFiles: result.updatedFiles,
							errors: result.errors.length
						},
						'[IndexerAPI] Background .strm update complete'
					);
				})
				.catch((err) => {
					logger.error(
						{
							error: err instanceof Error ? err.message : 'Unknown error'
						},
						'[IndexerAPI] Failed to update .strm files after baseUrl change'
					);
				});
		}

		return json({ success: true, indexer: redactIndexer(updated) });
	} catch (error) {
		if (error instanceof Error && error.message.includes('not found')) {
			throw new NotFoundError('Indexer', params.id);
		}
		throw error;
	}
};
