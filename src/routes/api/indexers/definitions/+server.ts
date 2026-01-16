import { json } from '@sveltejs/kit';
import { getIndexerManager } from '$lib/server/indexers/IndexerManager';
import { toUIDefinition } from '$lib/server/indexers/loader';

/**
 * GET /api/indexers/definitions
 * Returns all available indexer definitions from the unified YAML-based system.
 * Internal/auto-managed indexers (like streaming) are excluded from this list.
 */
export async function GET() {
	const manager = await getIndexerManager();

	// Get all definitions and convert to UI format
	const allDefinitions = manager.getUnifiedDefinitions();

	// Map to API response format, excluding internal indexers
	const definitions = allDefinitions
		.filter((def) => def.protocol !== 'streaming') // Exclude streaming indexers from public list
		.map((def) => {
			const uiDef = toUIDefinition(def);
			return {
				id: uiDef.id,
				name: uiDef.name,
				description: uiDef.description,
				type: uiDef.type,
				protocol: uiDef.protocol,
				siteUrl: uiDef.siteUrl,
				alternateUrls: uiDef.alternateUrls,
				capabilities: uiDef.capabilities,
				settings: uiDef.settings
			};
		})
		.sort((a, b) => a.name.localeCompare(b.name));

	return json(definitions);
}
