import { db } from '$lib/server/db';
import { settings as settingsTable } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { getIndexerManager } from '$lib/server/indexers/IndexerManager';
import { getPersistentStatusTracker } from '$lib/server/indexers/status';
import { createChildLogger } from '$lib/logging';

const logger = createChildLogger({ logDomain: 'indexers' as const });

const SETTINGS_KEY = 'prowlarr_connection';

export interface ProwlarrConnection {
	url: string;
	/** Stored server-side only — never sent to the client */
	apiKey: string;
	autoSync: boolean;
	syncIntervalHours: number;
	/**
	 * When true, sync will also import indexers that exist in Prowlarr but
	 * have not been imported yet. When false (default), sync only touches
	 * indexers the user has already explicitly imported.
	 */
	syncAddNew: boolean;
	lastSyncAt: string | null;
	lastSyncResult: SyncResult | null;
	/** Set when a sync attempt fails entirely (e.g. Prowlarr unreachable). Cleared on success. */
	lastSyncError: string | null;
}

export interface SyncResult {
	updated: number;
	removed: number;
	added: number;
	failed: number;
	errors: string[];
}

export interface ProwlarrApiIndexer {
	id: number;
	name: string;
	enable: boolean;
	protocol: string;
	privacy?: string;
}

export interface ProwlarrApiIndexerStatus {
	indexerId: number;
	disabledTill: string | null;
	mostRecentFailure: string | null;
}

export async function getProwlarrConnection(): Promise<ProwlarrConnection | null> {
	const row = await db.query.settings.findFirst({
		where: eq(settingsTable.key, SETTINGS_KEY)
	});
	if (!row) return null;
	try {
		const conn = JSON.parse(row.value) as ProwlarrConnection;
		if (conn.syncAddNew === undefined) conn.syncAddNew = false;
		if (conn.lastSyncError === undefined) conn.lastSyncError = null;
		return conn;
	} catch {
		return null;
	}
}

export async function saveProwlarrConnection(conn: ProwlarrConnection): Promise<void> {
	await db
		.insert(settingsTable)
		.values({ key: SETTINGS_KEY, value: JSON.stringify(conn) })
		.onConflictDoUpdate({ target: settingsTable.key, set: { value: JSON.stringify(conn) } });
}

export async function deleteProwlarrConnection(): Promise<void> {
	await db.delete(settingsTable).where(eq(settingsTable.key, SETTINGS_KEY));
}

export function normalizeProwlarrUrl(url: string): string {
	return url.replace(/\/+$/, '');
}

export function isIndexerFromConnection(baseUrl: string, prowlarrBase: string): boolean {
	if (!baseUrl.startsWith(prowlarrBase + '/')) return false;
	const suffix = baseUrl.slice(prowlarrBase.length + 1).replace(/\/+$/, '');
	return /^\d+$/.test(suffix);
}

export async function fetchProwlarrIndexers(
	prowlarrUrl: string,
	apiKey: string
): Promise<ProwlarrApiIndexer[]> {
	const base = normalizeProwlarrUrl(prowlarrUrl);
	const res = await fetch(`${base}/api/v1/indexer`, {
		headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
		signal: AbortSignal.timeout(10000)
	});

	if (res.status === 401 || res.status === 403) {
		throw new Error('Authentication failed. Check your Prowlarr API key.');
	}
	if (!res.ok) {
		throw new Error(`Prowlarr returned HTTP ${res.status}`);
	}

	const data: unknown = await res.json();
	if (!Array.isArray(data)) {
		throw new Error('Unexpected response format from Prowlarr');
	}
	return data as ProwlarrApiIndexer[];
}

export async function fetchProwlarrIndexerStatus(
	prowlarrUrl: string,
	apiKey: string
): Promise<ProwlarrApiIndexerStatus[]> {
	const base = normalizeProwlarrUrl(prowlarrUrl);
	const res = await fetch(`${base}/api/v1/indexerstatus`, {
		headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
		signal: AbortSignal.timeout(10000)
	});
	if (!res.ok) return [];
	const data: unknown = await res.json();
	if (!Array.isArray(data)) return [];
	return data as ProwlarrApiIndexerStatus[];
}

export async function syncProwlarrIndexers(): Promise<SyncResult> {
	const conn = await getProwlarrConnection();
	if (!conn) {
		throw new Error('No Prowlarr connection configured');
	}

	const prowlarrBase = normalizeProwlarrUrl(conn.url);
	const result: SyncResult = { updated: 0, removed: 0, added: 0, failed: 0, errors: [] };

	let prowlarrIndexers: ProwlarrApiIndexer[];
	try {
		prowlarrIndexers = await fetchProwlarrIndexers(conn.url, conn.apiKey);
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : String(err);
		conn.lastSyncAt = new Date().toISOString();
		conn.lastSyncError = errorMsg;
		await saveProwlarrConnection(conn);
		throw new Error(`Failed to fetch indexers from Prowlarr: ${errorMsg}`);
	}

	const prowlarrById = new Map(prowlarrIndexers.map((i) => [i.id, i]));

	const manager = await getIndexerManager();
	const existingIndexers = await manager.getIndexers();

	// Partition: which existing Cinephage indexers came from this Prowlarr instance
	const managedIndexers = existingIndexers.filter((i) =>
		isIndexerFromConnection(i.baseUrl, prowlarrBase)
	);

	for (const indexer of managedIndexers) {
		const suffix = indexer.baseUrl.slice(prowlarrBase.length + 1).replace(/\/+$/, '');
		const prowlarrId = parseInt(suffix, 10);
		const pi = prowlarrById.get(prowlarrId);

		if (!pi) {
			// No longer in Prowlarr - soft-mark as orphaned rather than hard-delete.
			// The UI shows a "Deleted" badge; re-appearing in a future sync clears the flag.
			try {
				if (!indexer.orphaned) {
					await manager.updateIndexer(indexer.id, { enabled: false, orphaned: true });
					result.removed += 1;
					logger.info(
						{ indexerName: indexer.name, prowlarrId },
						'[Prowlarr] Orphaned indexer no longer in Prowlarr'
					);
				}
			} catch (err) {
				result.failed += 1;
				result.errors.push(
					`Orphan ${indexer.name}: ${err instanceof Error ? err.message : String(err)}`
				);
			}
			continue;
		}

		// Still exists in Prowlarr - sync name, upstream enabled state, and API key.
		// We do NOT touch `enabled` (the user's Cinephage preference) here; only
		// `upstreamEnabled` tracks what Prowlarr thinks.
		const updates: Record<string, unknown> = {};
		if (pi.name !== indexer.name) updates.name = pi.name;
		if (pi.enable !== indexer.upstreamEnabled) updates.upstreamEnabled = pi.enable;
		// If the indexer was previously orphaned but is now back in Prowlarr, clear the flag.
		if (indexer.orphaned) updates.orphaned = false;

		const existingSettings = indexer.settings as Record<string, unknown> | null;
		const currentKey = existingSettings?.apikey;
		if (currentKey !== conn.apiKey) {
			updates.settings = {
				...(existingSettings ?? {}),
				apikey: conn.apiKey
			};
		}

		if (Object.keys(updates).length > 0) {
			try {
				await manager.updateIndexer(indexer.id, updates);
				result.updated += 1;
				logger.info(
					{ indexerName: pi.name, prowlarrId, updates: Object.keys(updates) },
					'[Prowlarr] Updated indexer'
				);
			} catch (err) {
				result.failed += 1;
				result.errors.push(
					`Update ${indexer.name}: ${err instanceof Error ? err.message : String(err)}`
				);
			}
		}
	}

	// Add new indexers only when the user has opted in
	if (conn.syncAddNew) {
		const managedBaseUrls = new Set(managedIndexers.map((i) => normalizeProwlarrUrl(i.baseUrl)));

		for (const pi of prowlarrIndexers) {
			const baseUrl = `${prowlarrBase}/${pi.id}`;
			if (managedBaseUrls.has(baseUrl)) continue;

			const protocol = pi.protocol === 'usenet' ? 'usenet' : 'torrent';
			const definitionId = protocol === 'usenet' ? 'newznab' : 'torznab';

			try {
				await manager.createIndexer({
					name: pi.name,
					definitionId,
					baseUrl,
					alternateUrls: [],
					enabled: true,
					upstreamEnabled: pi.enable,
					priority: 25,
					settings: { apikey: conn.apiKey },
					enableAutomaticSearch: true,
					enableInteractiveSearch: true,
					minimumSeeders: 1,
					seedRatio: null,
					seedTime: null,
					packSeedTime: null
				});
				result.added += 1;
				logger.info(
					{ indexerName: pi.name, prowlarrId: pi.id },
					'[Prowlarr] Auto-imported new indexer'
				);
			} catch (err) {
				result.failed += 1;
				result.errors.push(`Add ${pi.name}: ${err instanceof Error ? err.message : String(err)}`);
			}
		}
	}

	// Health passthrough: update Cinephage status tracker from Prowlarr's indexer health data.
	// This avoids Cinephage making its own test requests to Prowlarr-proxied URLs (which
	// triggers rate limiting on the underlying indexers).
	try {
		const statusTracker = getPersistentStatusTracker();
		const prowlarrStatuses = await fetchProwlarrIndexerStatus(conn.url, conn.apiKey);
		const failedByProwlarrId = new Map(prowlarrStatuses.map((s) => [s.indexerId, s]));

		// Re-fetch managed indexers (some may have been removed above)
		const currentIndexers = await manager.getIndexers();
		const stillManaged = currentIndexers.filter((i) =>
			isIndexerFromConnection(i.baseUrl, prowlarrBase)
		);

		for (const indexer of stillManaged) {
			const suffix = indexer.baseUrl.slice(prowlarrBase.length + 1).replace(/\/+$/, '');
			const prowlarrId = parseInt(suffix, 10);
			const failureInfo = failedByProwlarrId.get(prowlarrId);

			if (failureInfo) {
				await statusTracker.recordFailure(
					indexer.id,
					failureInfo.mostRecentFailure ?? 'Reported unhealthy by Prowlarr'
				);
			} else {
				await statusTracker.recordSuccess(indexer.id);
			}
		}
	} catch {
		// Health passthrough is best-effort - don't fail the sync if it errors
	}

	conn.lastSyncAt = new Date().toISOString();
	conn.lastSyncResult = result;
	conn.lastSyncError = null;
	await saveProwlarrConnection(conn);

	logger.info(
		{
			updated: result.updated,
			removed: result.removed,
			added: result.added,
			failed: result.failed
		},
		'[Prowlarr] Sync complete'
	);
	return result;
}
