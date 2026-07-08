import type { MigrationDefinition } from '../migration-helpers.js';

/**
 * Convert Prowlarr-imported indexers to the native Prowlarr search definition,
 * and repair any indexers that were broken by earlier buggy versions of this migration.
 *
 * Intended outcome for every Prowlarr-sourced indexer:
 *   - definition_id = 'prowlarr'
 *   - base_url     = prowlarrBase/{numericId}   (unchanged from legacy torznab format)
 *   - settings     = { ...original, apikey: <connection key>, indexerId: '<id>' }
 *
 * Idempotent: safe to re-run. Handles both legacy torznab/newznab indexers that
 * haven't been converted yet, and already-converted ones whose base_url or apikey
 * may have been corrupted by earlier migration bugs.
 */
export const migration_v120: MigrationDefinition = {
	version: 120,
	name: 'migrate_prowlarr_indexers_to_native',
	apply: (sqlite) => {
		const connRow = sqlite
			.prepare(`SELECT value FROM settings WHERE key = 'prowlarr_connection' LIMIT 1`)
			.get() as { value: string } | undefined;

		if (!connRow) return;

		let prowlarrUrl: string;
		let apiKey: string;
		try {
			const conn = JSON.parse(connRow.value) as { url?: string; apiKey?: string };
			if (!conn.url || !conn.apiKey) return;
			prowlarrUrl = conn.url.replace(/\/+$/, '');
			apiKey = conn.apiKey;
		} catch {
			return;
		}

		// --- Pass 1: convert legacy torznab/newznab indexers ---
		// Only update definition_id and settings; base_url stays as prowlarrBase/{id}.
		const legacy = sqlite
			.prepare(
				`SELECT id, definition_id, base_url, settings FROM indexers
				 WHERE definition_id IN ('torznab', 'newznab')
				   AND base_url LIKE ?`
			)
			.all(`${prowlarrUrl}/%`) as {
			id: string;
			definition_id: string;
			base_url: string;
			settings: string | null;
		}[];

		const convertStmt = sqlite.prepare(
			`UPDATE indexers SET definition_id = 'prowlarr', settings = ? WHERE id = ?`
		);

		for (const row of legacy) {
			const suffix = row.base_url.slice(prowlarrUrl.length + 1).replace(/\/+$/, '');
			if (!/^\d+$/.test(suffix)) continue;

			let existing: Record<string, unknown> = {};
			try {
				if (row.settings) existing = JSON.parse(row.settings) as Record<string, unknown>;
			} catch {
				// keep empty object
			}

			const protocol = row.definition_id === 'newznab' ? 'usenet' : 'torrent';
			convertStmt.run(
				JSON.stringify({ ...existing, apikey: apiKey, indexerId: suffix, protocol }),
				row.id
			);
		}

		// --- Pass 2: repair already-converted indexers ---
		// Fixes indexers left with base_url = prowlarrBase (no /{id} suffix) or empty apikey.
		const broken = sqlite
			.prepare(`SELECT id, base_url, settings FROM indexers WHERE definition_id = 'prowlarr'`)
			.all() as { id: string; base_url: string; settings: string | null }[];

		const repairStmt = sqlite.prepare(
			`UPDATE indexers SET base_url = ?, settings = ? WHERE id = ?`
		);

		for (const row of broken) {
			let existing: Record<string, unknown> = {};
			try {
				if (row.settings) existing = JSON.parse(row.settings) as Record<string, unknown>;
			} catch {
				// keep empty object
			}

			let targetUrl = row.base_url.replace(/\/+$/, '');

			// If base_url is just the root (no numeric suffix), restore it from settings.indexerId
			if (targetUrl === prowlarrUrl) {
				const indexerId = String(existing.indexerId ?? '');
				if (!indexerId || !/^\d+$/.test(indexerId)) continue;
				targetUrl = `${prowlarrUrl}/${indexerId}`;
			}

			// Only write if something actually needs fixing
			if (targetUrl === row.base_url.replace(/\/+$/, '') && existing.apikey === apiKey) continue;

			repairStmt.run(targetUrl, JSON.stringify({ ...existing, apikey: apiKey }), row.id);
		}
	}
};
