import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth/authorization.js';
import {
	getProwlarrConnection,
	fetchProwlarrIndexers,
	normalizeProwlarrUrl
} from '$lib/server/indexers/prowlarr/ProwlarrConnectionService.js';
import { getIndexerManager } from '$lib/server/indexers/IndexerManager.js';

/**
 * GET - fetch indexers from Prowlarr using the stored connection's API key.
 * The API key is never sent to the client.
 * Each indexer includes `alreadyImported: boolean` based on the live Cinephage indexer list.
 */
export const GET: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	const conn = await getProwlarrConnection();
	if (!conn) {
		return json({ error: 'No Prowlarr connection configured.' }, { status: 400 });
	}

	const base = normalizeProwlarrUrl(conn.url);

	let rawIndexers;
	try {
		rawIndexers = await fetchProwlarrIndexers(base, conn.apiKey);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		const isTimeout = message.toLowerCase().includes('timeout') || message.includes('TimeoutError');
		return json(
			{
				error: isTimeout
					? 'Connection timed out. Check that Prowlarr is still running.'
					: message.includes('Authentication')
						? message
						: 'Unable to reach Prowlarr. Check that it is still accessible.'
			},
			{ status: 502 }
		);
	}

	const manager = await getIndexerManager();
	const existingIndexers = await manager.getIndexers();
	const existingByBaseUrl = new Map(
		existingIndexers.map((i) => [normalizeProwlarrUrl(i.baseUrl), i])
	);

	const indexers = [];
	for (const raw of rawIndexers) {
		const protocol = raw.protocol === 'usenet' ? 'usenet' : 'torrent';
		const baseUrl = `${base}/${raw.id}`;
		const existing = existingByBaseUrl.get(baseUrl);

		if (existing && existing.name !== raw.name) {
			await manager.updateIndexer(existing.id, { name: raw.name });
		}

		indexers.push({
			id: raw.id,
			name: raw.name,
			enabled: raw.enable === true,
			protocol,
			definitionId: protocol === 'usenet' ? 'newznab' : 'torznab',
			baseUrl,
			privacy: typeof raw.privacy === 'string' ? raw.privacy : 'unknown',
			alreadyImported: Boolean(existing)
		});
	}

	indexers.sort((a, b) => {
		if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
		return a.name.localeCompare(b.name);
	});

	return json({ indexers });
};
