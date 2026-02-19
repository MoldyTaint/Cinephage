import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getIndexerManager } from '$lib/server/indexers/IndexerManager';

export const GET: RequestHandler = async () => {
	// Get indexer manager to check definition status
	// Note: getIndexerManager() will initialize if not already done
	let definitionsLoaded: number;
	let definitionErrors: number;

	try {
		const manager = await getIndexerManager();
		definitionsLoaded = manager.getUnifiedDefinitions().length;
		definitionErrors = manager.getDefinitionErrors().length;
	} catch {
		// If manager fails to initialize, report as unhealthy
		return json(
			{
				status: 'error',
				error: 'Failed to initialize indexer manager'
			},
			{ status: 503 }
		);
	}

	return json({
		status: 'ok',
		indexers: {
			definitionsLoaded,
			definitionErrors
		}
	});
};
