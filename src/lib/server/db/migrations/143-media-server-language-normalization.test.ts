import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { migration_v143 } from './143-media-server-language-normalization.js';

const databases: Database.Database[] = [];

/**
 * Minimal pre-v140 fixture mirroring the shipped media_server_synced_items
 * shape (migration 082): JSON-array language columns, no raw columns yet.
 */
const PRE_MIGRATION_DDL = `
	CREATE TABLE "media_server_synced_items" (
		"id" text PRIMARY KEY NOT NULL,
		"server_id" text NOT NULL,
		"server_item_id" text NOT NULL,
		"title" text NOT NULL,
		"item_type" text NOT NULL,
		"audio_languages" text DEFAULT '[]',
		"subtitle_languages" text DEFAULT '[]',
		"last_synced_at" text NOT NULL
	)
`;

const SEED_SQL = `
	-- (a) mixed-case + 3-letter codes needing canonicalization
	INSERT INTO media_server_synced_items (id, server_id, server_item_id, title, item_type, audio_languages, subtitle_languages, last_synced_at)
		VALUES ('item-mixed', 'srv-1', 'p-1', 'Mixed', 'movie', '["ENG","fre","ENg"]', '["Spa","dut"]', '2026-01-01');

	-- (b) already-canonical arrays: unchanged content, raws recorded as-is
	INSERT INTO media_server_synced_items (id, server_id, server_item_id, title, item_type, audio_languages, subtitle_languages, last_synced_at)
		VALUES ('item-canonical', 'srv-1', 'p-2', 'Canonical', 'movie', '["en","fr"]', '[]', '2026-01-01');

	-- (c) duplicates + empties + unknown markers collapse/drop in canonical view
	INSERT INTO media_server_synced_items (id, server_id, server_item_id, title, item_type, audio_languages, subtitle_languages, last_synced_at)
		VALUES ('item-messy', 'srv-1', 'p-3', 'Messy', 'movie', '["eng","EN","","multi","und"]', '["","jpn","jpn"]', '2026-01-01');

	-- (d) malformed JSON: untouched + logged
	INSERT INTO media_server_synced_items (id, server_id, server_item_id, title, item_type, audio_languages, subtitle_languages, last_synced_at)
		VALUES ('item-broken', 'srv-1', 'p-4', 'Broken', 'movie', '{not json', '["eng"]', '2026-01-01');

	-- (e) NULL language columns: untouched, raws stay NULL
	INSERT INTO media_server_synced_items (id, server_id, server_item_id, title, item_type, audio_languages, subtitle_languages, last_synced_at)
		VALUES ('item-null', 'srv-1', 'p-5', 'Null', 'movie', NULL, NULL, '2026-01-01');
`;

function createPreMigrationDatabase(): Database.Database {
	const sqlite = new Database(':memory:');
	databases.push(sqlite);
	sqlite.exec(PRE_MIGRATION_DDL);
	sqlite.exec(SEED_SQL);
	return sqlite;
}

function getColumnNames(sqlite: Database.Database, tableName: string): string[] {
	return (sqlite.prepare(`PRAGMA table_info("${tableName}")`).all() as Array<{ name: string }>).map(
		(column) => column.name
	);
}

interface LanguageRow {
	id: string;
	audio_languages: string | null;
	subtitle_languages: string | null;
	audio_languages_raw: string | null;
	subtitle_languages_raw: string | null;
}

function languageRows(sqlite: Database.Database): Record<string, LanguageRow> {
	const rows = sqlite
		.prepare(
			`SELECT id, audio_languages, subtitle_languages,
					audio_languages_raw, subtitle_languages_raw
			 FROM media_server_synced_items ORDER BY id`
		)
		.all() as LanguageRow[];
	return Object.fromEntries(rows.map((row) => [row.id, row]));
}

afterEach(() => {
	for (const sqlite of databases.splice(0)) {
		sqlite.close();
	}
});

describe('migration v140 — media-server language normalization', () => {
	it('adds the nullable raw language columns', () => {
		const sqlite = createPreMigrationDatabase();

		migration_v143.apply(sqlite);

		const columns = getColumnNames(sqlite, 'media_server_synced_items');
		expect(columns).toContain('audio_languages_raw');
		expect(columns).toContain('subtitle_languages_raw');
	});

	it('canonicalizes existing arrays while preserving the raw source strings', () => {
		const sqlite = createPreMigrationDatabase();

		migration_v143.apply(sqlite);

		const rows = languageRows(sqlite);

		// (a) mixed-case / 3-letter codes canonicalize; raws keep the originals.
		expect(JSON.parse(rows['item-mixed'].audio_languages!)).toEqual(['en', 'fr']);
		expect(JSON.parse(rows['item-mixed'].audio_languages_raw!)).toEqual(['ENG', 'fre', 'ENg']);
		expect(JSON.parse(rows['item-mixed'].subtitle_languages!)).toEqual(['es', 'nl']);
		expect(JSON.parse(rows['item-mixed'].subtitle_languages_raw!)).toEqual(['Spa', 'dut']);

		// (b) already canonical: content unchanged, raws still recorded.
		expect(JSON.parse(rows['item-canonical'].audio_languages!)).toEqual(['en', 'fr']);
		expect(JSON.parse(rows['item-canonical'].audio_languages_raw!)).toEqual(['en', 'fr']);
		expect(JSON.parse(rows['item-canonical'].subtitle_languages!)).toEqual([]);
		expect(JSON.parse(rows['item-canonical'].subtitle_languages_raw!)).toEqual([]);

		// (c) duplicates collapse to first occurrence, empties and unknown
		//     (`multi`/`und`) drop from canonical; unknown non-empty raws survive
		//     in the raw view only.
		expect(JSON.parse(rows['item-messy'].audio_languages!)).toEqual(['en']);
		expect(JSON.parse(rows['item-messy'].audio_languages_raw!)).toEqual([
			'eng',
			'EN',
			'multi',
			'und'
		]);
		expect(JSON.parse(rows['item-messy'].subtitle_languages!)).toEqual(['ja']);
		expect(JSON.parse(rows['item-messy'].subtitle_languages_raw!)).toEqual(['jpn']);
	});

	it('leaves malformed-JSON rows untouched with NULL raws', () => {
		const sqlite = createPreMigrationDatabase();

		migration_v143.apply(sqlite);

		const rows = languageRows(sqlite);
		expect(rows['item-broken'].audio_languages).toBe('{not json');
		expect(rows['item-broken'].audio_languages_raw).toBeNull();
		// The healthy sibling column on the same row is still processed.
		expect(JSON.parse(rows['item-broken'].subtitle_languages!)).toEqual(['en']);
		expect(JSON.parse(rows['item-broken'].subtitle_languages_raw!)).toEqual(['eng']);

		// (e) NULL language columns stay NULL.
		expect(rows['item-null'].audio_languages).toBeNull();
		expect(rows['item-null'].audio_languages_raw).toBeNull();
	});

	it('is idempotent: a second apply never feeds canonical arrays back into raws', () => {
		const sqlite = createPreMigrationDatabase();
		migration_v143.apply(sqlite);
		const afterFirst = languageRows(sqlite);

		expect(() => migration_v143.apply(sqlite)).not.toThrow();
		expect(languageRows(sqlite)).toEqual(afterFirst);

		// Spot-check: the raw column still holds the pre-migration strings.
		expect(JSON.parse(languageRows(sqlite)['item-mixed'].audio_languages_raw!)).toEqual([
			'ENG',
			'fre',
			'ENg'
		]);
	});

	it('passes the integrity gates', () => {
		const sqlite = createPreMigrationDatabase();

		expect(() => migration_v143.apply(sqlite)).not.toThrow();
		expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
		expect(sqlite.prepare('PRAGMA quick_check').pluck().get()).toBe('ok');
	});

	it('does nothing when media_server_synced_items does not exist yet', () => {
		const sqlite = new Database(':memory:');
		databases.push(sqlite);

		expect(() => migration_v143.apply(sqlite)).not.toThrow();
		const tables = (
			sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as Array<{
				name: string;
			}>
		).map((r) => r.name);
		expect(tables).not.toContain('media_server_synced_items');
	});
});
