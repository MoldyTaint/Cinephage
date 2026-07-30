import type { MigrationDefinition } from '../migration-helpers.js';

/**
 * Convert Jackett-imported torznab indexers to the native Jackett JSON definition.
 *
 * Legacy format:
 *   - definition_id = 'torznab'
 *   - base_url      = jackettBase/api/v2.0/indexers/{trackerId}/results/torznab
 *   - settings      = { apikey: ... }
 *
 * New format:
 *   - definition_id = 'jackett'
 *   - base_url      = jackettBase  (root URL)
 *   - settings      = { apikey: ..., trackerId: '{trackerId}' }
 *
 * Idempotent: safe to re-run. Already-converted indexers are skipped.
 */
export const migration_v121: MigrationDefinition = {
	version: 121,
	name: 'migrate_jackett_indexers_to_native',
	apply: (sqlite) => {
		const connRow = sqlite
			.prepare(`SELECT value FROM settings WHERE key = 'jackett_connection' LIMIT 1`)
			.get() as { value: string } | undefined;

		if (!connRow) return;

		let jackettBase: string;
		let apiKey: string;
		try {
			const conn = JSON.parse(connRow.value) as { url?: string; apiKey?: string };
			if (!conn.url || !conn.apiKey) return;
			jackettBase = conn.url.replace(/\/+$/, '');
			apiKey = conn.apiKey;
		} catch {
			return;
		}

		// Pattern: jackettBase/api/v2.0/indexers/{trackerId}/results/torznab
		const prefix = `${jackettBase}/api/v2.0/indexers/`;
		const suffix = '/results/torznab';

		const legacy = sqlite
			.prepare(
				`SELECT id, base_url, settings FROM indexers
				 WHERE definition_id = 'torznab'
				   AND base_url LIKE ?`
			)
			.all(`${prefix}%`) as { id: string; base_url: string; settings: string | null }[];

		const convertStmt = sqlite.prepare(
			`UPDATE indexers SET definition_id = 'jackett', base_url = ?, settings = ? WHERE id = ?`
		);

		for (const row of legacy) {
			const normalized = row.base_url.replace(/\/+$/, '');
			if (!normalized.startsWith(prefix)) continue;
			const rest = normalized.slice(prefix.length);
			// rest should be: {trackerId}/results/torznab
			const slashIndex = rest.indexOf('/');
			const trackerId = slashIndex > -1 ? rest.slice(0, slashIndex) : rest;
			if (!trackerId) continue;
			// Verify it actually ends with the torznab suffix
			if (!normalized.endsWith(suffix)) continue;

			let existing: Record<string, unknown> = {};
			try {
				if (row.settings) existing = JSON.parse(row.settings) as Record<string, unknown>;
			} catch {
				// keep empty object
			}

			convertStmt.run(
				jackettBase,
				JSON.stringify({ ...existing, apikey: apiKey, trackerId }),
				row.id
			);
		}
	}
};
