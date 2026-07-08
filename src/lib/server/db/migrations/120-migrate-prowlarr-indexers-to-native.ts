import type { MigrationDefinition } from '../migration-helpers.js';

/**
 * Convert Prowlarr-imported indexers from the legacy torznab/newznab format to the
 * native Prowlarr search definition.
 *
 * Old format: definitionId=torznab|newznab, baseUrl=http://prowlarr:9696/{id}
 * New format: definitionId=prowlarr,        baseUrl=http://prowlarr:9696, settings.indexerId={id}
 *
 * Based on the native search approach contributed by Stig (github.com/MoldyTaint/Cinephage/pull/416).
 */
export const migration_v120: MigrationDefinition = {
	version: 120,
	name: 'migrate_prowlarr_indexers_to_native',
	apply: (sqlite) => {
		// Read Prowlarr connection URL from settings
		const connRow = sqlite
			.prepare(`SELECT value FROM settings WHERE key = 'prowlarr_connection' LIMIT 1`)
			.get() as { value: string } | undefined;

		if (!connRow) return;

		let prowlarrUrl: string;
		try {
			const conn = JSON.parse(connRow.value) as { url?: string };
			if (!conn.url) return;
			prowlarrUrl = conn.url.replace(/\/+$/, '');
		} catch {
			return;
		}

		// Find all torznab/newznab indexers whose baseUrl is {prowlarrUrl}/{numericId}
		const rows = sqlite
			.prepare(
				`SELECT id, definition_id, base_url, settings
				 FROM indexers
				 WHERE definition_id IN ('torznab', 'newznab')
				   AND base_url LIKE ?`
			)
			.all(`${prowlarrUrl}/%`) as {
			id: string;
			definition_id: string;
			base_url: string;
			settings: string | null;
		}[];

		const update = sqlite.prepare(
			`UPDATE indexers SET definition_id = 'prowlarr', base_url = ?, settings = ? WHERE id = ?`
		);

		for (const row of rows) {
			const suffix = row.base_url.slice(prowlarrUrl.length + 1).replace(/\/+$/, '');
			if (!/^\d+$/.test(suffix)) continue;

			let existing: Record<string, unknown> = {};
			try {
				if (row.settings) existing = JSON.parse(row.settings) as Record<string, unknown>;
			} catch {
				// keep empty
			}

			const newSettings = JSON.stringify({ ...existing, indexerId: suffix });
			update.run(prowlarrUrl, newSettings, row.id);
		}
	}
};
