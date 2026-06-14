import { db } from '$lib/server/db';
import { settings as settingsTable } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { getIndexerManager } from '$lib/server/indexers/IndexerManager';
import { createChildLogger } from '$lib/logging';

const logger = createChildLogger({ logDomain: 'indexers' as const });

const SETTINGS_KEY = 'jackett_connection';
const JACKETT_INDEXERS_PATH = '/api/v2.0/indexers';
const TORZNAB_SUFFIX = '/results/torznab';

export interface JackettConnection {
	url: string;
	/** Stored server-side only; never sent to the client */
	apiKey: string;
	/** Optional admin password; stored server-side only, never sent to the client */
	adminPassword?: string;
	autoSync: boolean;
	syncIntervalHours: number;
	/**
	 * When true, sync also imports indexers that exist in Jackett but
	 * have not been imported yet.
	 */
	syncAddNew: boolean;
	lastSyncAt: string | null;
	lastSyncResult: SyncResult | null;
	/** Set when a sync attempt fails entirely (e.g. Jackett unreachable). Cleared on success. */
	lastSyncError: string | null;
}

export interface SyncResult {
	updated: number;
	removed: number;
	added: number;
	failed: number;
	errors: string[];
}

export interface JackettApiIndexer {
	id: string;
	name: string;
	type: string;
	language: string;
	configured?: boolean;
}

export async function getJackettConnection(): Promise<JackettConnection | null> {
	const row = await db.query.settings.findFirst({
		where: eq(settingsTable.key, SETTINGS_KEY)
	});
	if (!row) return null;
	try {
		const conn = JSON.parse(row.value) as JackettConnection;
		if (conn.syncAddNew === undefined) conn.syncAddNew = false;
		if (conn.lastSyncError === undefined) conn.lastSyncError = null;
		return conn;
	} catch {
		return null;
	}
}

export async function saveJackettConnection(conn: JackettConnection): Promise<void> {
	await db
		.insert(settingsTable)
		.values({ key: SETTINGS_KEY, value: JSON.stringify(conn) })
		.onConflictDoUpdate({ target: settingsTable.key, set: { value: JSON.stringify(conn) } });
}

export async function deleteJackettConnection(): Promise<void> {
	await db.delete(settingsTable).where(eq(settingsTable.key, SETTINGS_KEY));
}

export function normalizeJackettUrl(url: string): string {
	return url.replace(/\/+$/, '');
}

/** Build the Torznab feed URL for a given Jackett indexer ID. */
export function jackettIndexerUrl(jackettBase: string, indexerId: string): string {
	return `${jackettBase}${JACKETT_INDEXERS_PATH}/${indexerId}${TORZNAB_SUFFIX}`;
}

/** Returns true when baseUrl is a Torznab feed served by this Jackett instance. */
export function isIndexerFromJackett(baseUrl: string, jackettBase: string): boolean {
	const base = jackettBase.replace(/\/+$/, '');
	const normalized = baseUrl.replace(/\/+$/, '');
	const prefix = `${base}${JACKETT_INDEXERS_PATH}/`;
	return normalized.startsWith(prefix) && normalized.includes(TORZNAB_SUFFIX);
}

/** Extract the Jackett indexer ID from a stored Cinephage baseUrl. */
export function extractJackettIndexerId(baseUrl: string, jackettBase: string): string | null {
	const base = jackettBase.replace(/\/+$/, '');
	const prefix = `${base}${JACKETT_INDEXERS_PATH}/`;
	const normalized = baseUrl.replace(/\/+$/, '');
	if (!normalized.startsWith(prefix)) return null;
	const rest = normalized.slice(prefix.length);
	const slash = rest.indexOf('/');
	return slash > -1 ? rest.slice(0, slash) : rest;
}

type HeadersExt = Headers & { getSetCookie?(): string[] };

function extractCookiePairs(h: Headers): string[] {
	const ext = h as HeadersExt;
	const lines = ext.getSetCookie ? ext.getSetCookie() : [h.get('set-cookie') ?? ''].filter(Boolean);
	return lines.map((c) => c.split(';')[0].trim()).filter(Boolean);
}

/**
 * Login to Jackett by POSTing to /UI/Dashboard with form-encoded password.
 * Returns the session cookie string on success, or null if login failed.
 *
 * No-password installs: pass empty string; Jackett accepts it.
 * Password-protected installs: pass the admin password.
 */
async function loginToJackett(base: string, adminPassword = ''): Promise<string | null> {
	try {
		const res = await fetch(`${base}/UI/Dashboard`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ password: adminPassword }).toString(),
			redirect: 'manual',
			signal: AbortSignal.timeout(10000)
		});

		const cookies = extractCookiePairs(res.headers);
		logger.debug(
			{ status: res.status, cookies, location: res.headers.get('location') },
			'[Jackett] POST /UI/Dashboard response'
		);

		// Success: 302 redirect (to dashboard) with session cookie in Set-Cookie.
		if (res.status >= 300 && res.status < 400 && cookies.length > 0) {
			return cookies.join('; ');
		}

		return null;
	} catch (err) {
		logger.debug({ err }, '[Jackett] POST /UI/Dashboard failed');
		return null;
	}
}

async function doJackettListRequest(url: string, cookie: string | null): Promise<Response> {
	const headers: Record<string, string> = { Accept: 'application/json' };
	if (cookie) headers['Cookie'] = cookie;
	return fetch(url, { headers, redirect: 'manual', signal: AbortSignal.timeout(10000) });
}

async function parseJackettListResponse(res: Response): Promise<JackettApiIndexer[]> {
	const contentType = res.headers.get('content-type') ?? '';
	if (contentType.includes('text/html')) {
		throw new Error(
			'Jackett returned an HTML page instead of JSON. ' +
				'If you have an admin password set, disable it under Jackett Config → Admin password.'
		);
	}
	let data: unknown;
	try {
		data = await res.json();
	} catch {
		throw new Error(`Jackett returned non-JSON response (content-type: ${contentType || 'none'})`);
	}
	if (!Array.isArray(data)) {
		throw new Error('Unexpected response format from Jackett (expected array)');
	}
	return (data as JackettApiIndexer[]).filter((i) => i.configured !== false);
}

export async function fetchJackettIndexers(
	jackettUrl: string,
	apiKey: string,
	adminPassword = ''
): Promise<JackettApiIndexer[]> {
	const base = normalizeJackettUrl(jackettUrl);
	const encodedKey = encodeURIComponent(apiKey);

	// Recent Jackett builds bypass the login redirect when the URL has a trailing
	// slash. Try that first; if it returns 200 we are done without any cookie dance.
	const trailingSlashUrl = `${base}${JACKETT_INDEXERS_PATH}/?apikey=${encodedKey}`;
	const trailingRes = await doJackettListRequest(trailingSlashUrl, null);
	logger.debug(
		{ status: trailingRes.status, location: trailingRes.headers.get('location') },
		'[Jackett] trailing-slash probe'
	);

	if (trailingRes.ok) {
		return parseJackettListResponse(trailingRes);
	}

	// Trailing-slash did not work; do the login dance and retry.
	const cookie = await loginToJackett(base, adminPassword);
	logger.debug({ hasCookie: Boolean(cookie) }, '[Jackett] session cookie result');

	const listUrl = `${base}${JACKETT_INDEXERS_PATH}?apikey=${encodedKey}`;
	const res = await doJackettListRequest(listUrl, cookie);

	if (res.status >= 300 && res.status < 400) {
		throw new Error(
			adminPassword
				? 'Jackett rejected the admin password. Check it matches Jackett Config → Admin password.'
				: 'Jackett requires login. If you have set an admin password in Jackett, enter it in the Admin Password field when connecting.'
		);
	}
	if (res.status === 401 || res.status === 403) {
		throw new Error('Authentication failed. Check your Jackett API key.');
	}
	if (!res.ok) {
		let body = '';
		try {
			body = await res.text();
		} catch {
			// ignore
		}
		const snippet = body.slice(0, 200).replace(/\s+/g, ' ').trim();
		const lower = snippet.toLowerCase();
		if (lower.includes('cookies required')) {
			throw new Error(
				'Jackett requires a session cookie that could not be established. ' +
					'If you have an admin password set in Jackett, disable it under Config → Admin password.'
			);
		}
		throw new Error(
			`Jackett returned HTTP ${res.status} ${res.statusText}${snippet ? ` - ${snippet}` : ''}`
		);
	}

	return parseJackettListResponse(res);
}

export async function syncJackettIndexers(): Promise<SyncResult> {
	const conn = await getJackettConnection();
	if (!conn) {
		throw new Error('No Jackett connection configured');
	}

	const jackettBase = normalizeJackettUrl(conn.url);
	const result: SyncResult = { updated: 0, removed: 0, added: 0, failed: 0, errors: [] };

	let jackettIndexers: JackettApiIndexer[];
	try {
		jackettIndexers = await fetchJackettIndexers(conn.url, conn.apiKey, conn.adminPassword ?? '');
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : String(err);
		conn.lastSyncAt = new Date().toISOString();
		conn.lastSyncError = errorMsg;
		await saveJackettConnection(conn);
		throw new Error(`Failed to fetch indexers from Jackett: ${errorMsg}`);
	}

	const jackettById = new Map(jackettIndexers.map((i) => [i.id, i]));

	const manager = await getIndexerManager();
	const existingIndexers = await manager.getIndexers();

	const managedIndexers = existingIndexers.filter((i) =>
		isIndexerFromJackett(i.baseUrl, jackettBase)
	);

	for (const indexer of managedIndexers) {
		const indexerId = extractJackettIndexerId(indexer.baseUrl, jackettBase);
		const ji = indexerId ? jackettById.get(indexerId) : undefined;

		if (!ji) {
			// No longer in Jackett - soft-mark as orphaned rather than hard-delete.
			try {
				if (!indexer.orphaned) {
					await manager.updateIndexer(indexer.id, { enabled: false, orphaned: true });
					result.removed += 1;
					logger.info(
						{ indexerName: indexer.name, jackettId: indexerId },
						'[Jackett] Orphaned indexer no longer in Jackett'
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

		// Still exists in Jackett; sync name and API key
		const updates: Record<string, unknown> = {};
		if (ji.name !== indexer.name) updates.name = ji.name;
		// Clear orphaned flag if the indexer has re-appeared in Jackett
		if (indexer.orphaned) updates.orphaned = false;

		const existingSettings = indexer.settings as Record<string, unknown> | null;
		const currentKey = existingSettings?.apikey;
		if (currentKey !== conn.apiKey) {
			updates.settings = { ...(existingSettings ?? {}), apikey: conn.apiKey };
		}

		if (Object.keys(updates).length > 0) {
			try {
				await manager.updateIndexer(indexer.id, updates);
				result.updated += 1;
				logger.info(
					{ indexerName: ji.name, jackettId: indexerId, updates: Object.keys(updates) },
					'[Jackett] Updated indexer'
				);
			} catch (err) {
				result.failed += 1;
				result.errors.push(
					`Update ${indexer.name}: ${err instanceof Error ? err.message : String(err)}`
				);
			}
		}
	}

	if (conn.syncAddNew) {
		const managedUrls = new Set(managedIndexers.map((i) => normalizeJackettUrl(i.baseUrl)));

		for (const ji of jackettIndexers) {
			const baseUrl = jackettIndexerUrl(jackettBase, ji.id);
			if (managedUrls.has(baseUrl)) continue;

			try {
				await manager.createIndexer({
					name: ji.name,
					definitionId: 'torznab',
					baseUrl,
					alternateUrls: [],
					enabled: true,
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
					{ indexerName: ji.name, jackettId: ji.id },
					'[Jackett] Auto-imported new indexer'
				);
			} catch (err) {
				result.failed += 1;
				result.errors.push(`Add ${ji.name}: ${err instanceof Error ? err.message : String(err)}`);
			}
		}
	}

	conn.lastSyncAt = new Date().toISOString();
	conn.lastSyncResult = result;
	conn.lastSyncError = null;
	await saveJackettConnection(conn);

	logger.info(
		{
			updated: result.updated,
			removed: result.removed,
			added: result.added,
			failed: result.failed
		},
		'[Jackett] Sync complete'
	);
	return result;
}
