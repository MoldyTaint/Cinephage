import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth/authorization.js';
import {
	getProwlarrConnection,
	saveProwlarrConnection,
	deleteProwlarrConnection,
	fetchProwlarrIndexers,
	normalizeProwlarrUrl
} from '$lib/server/indexers/prowlarr/ProwlarrConnectionService.js';
import { z } from 'zod';

/**
 * When apiKey is omitted or empty, the stored key is preserved.
 * This lets "Save settings" (auto-sync toggle, interval) work without
 * requiring the user to re-enter their API key.
 */
const connectionSchema = z.object({
	url: z.string().url('Must be a valid URL'),
	apiKey: z.string().optional(),
	autoSync: z.boolean().default(false),
	syncIntervalHours: z.number().int().min(1).max(168).default(24),
	syncAddNew: z.boolean().default(false)
});

/** GET - return current connection. The API key is never included in the response. */
export const GET: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	const conn = await getProwlarrConnection();
	if (!conn) return json({ connection: null });

	return json({
		connection: {
			url: conn.url,
			autoSync: conn.autoSync,
			syncIntervalHours: conn.syncIntervalHours,
			syncAddNew: conn.syncAddNew,
			lastSyncAt: conn.lastSyncAt,
			lastSyncResult: conn.lastSyncResult,
			lastSyncError: conn.lastSyncError
		}
	});
};

/**
 * PUT - save or update connection.
 * If apiKey is provided and non-empty, connectivity is verified with it.
 * If omitted, the stored API key is reused (settings-only update).
 */
export const PUT: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const result = connectionSchema.safeParse(body);
	if (!result.success) {
		return json({ error: result.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
	}

	const { url: rawUrl, apiKey: providedKey, autoSync, syncIntervalHours, syncAddNew } = result.data;
	const url = normalizeProwlarrUrl(rawUrl);

	const existing = await getProwlarrConnection();
	const newKey = providedKey?.trim();

	// Determine which API key to use
	let apiKey: string;
	if (newKey) {
		// New key provided; verify it works
		apiKey = newKey;
		try {
			await fetchProwlarrIndexers(url, apiKey);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			const isTimeout =
				message.toLowerCase().includes('timeout') || message.includes('TimeoutError');
			return json(
				{
					error: isTimeout
						? 'Connection timed out. Check the URL and ensure Prowlarr is accessible.'
						: message.includes('Authentication')
							? message
							: 'Unable to reach Prowlarr. Check the URL and ensure Prowlarr is running.'
				},
				{ status: 502 }
			);
		}
	} else if (existing?.apiKey) {
		// No new key - reuse the stored one
		apiKey = existing.apiKey;
	} else {
		return json({ error: 'API key is required.' }, { status: 400 });
	}

	await saveProwlarrConnection({
		url,
		apiKey,
		autoSync,
		syncIntervalHours,
		syncAddNew,
		// Preserve sync history when the URL hasn't changed
		lastSyncAt: existing?.url === url ? (existing.lastSyncAt ?? null) : null,
		lastSyncResult: existing?.url === url ? (existing.lastSyncResult ?? null) : null,
		lastSyncError: existing?.url === url ? (existing.lastSyncError ?? null) : null
	});

	return json({ success: true });
};

/** DELETE - remove connection. Already-imported indexers are not affected. */
export const DELETE: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	await deleteProwlarrConnection();
	return json({ success: true });
};
