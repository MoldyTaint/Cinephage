import type { MigrationDefinition } from '../migration-helpers.js';

export const migration_v107: MigrationDefinition = {
	version: 107,
	name: 'migrate_required_formats_to_entries',
	apply: (sqlite) => {
		const rows = sqlite
			.prepare(
				`SELECT id, required_formats FROM scoring_profiles WHERE required_formats IS NOT NULL`
			)
			.all() as { id: string; required_formats: string }[];

		for (const row of rows) {
			try {
				const parsed = JSON.parse(row.required_formats);
				// Only migrate if it's a plain string array (old format)
				if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
					const migrated = parsed.map((id: string) => ({ id, op: 'AND' }));
					sqlite
						.prepare(`UPDATE scoring_profiles SET required_formats = ? WHERE id = ?`)
						.run(JSON.stringify(migrated), row.id);
				}
			} catch {
				// Malformed JSON - leave as-is
			}
		}
	}
};
