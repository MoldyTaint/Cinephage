import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '$lib/server/db/schema';
import { syncSchema } from '$lib/server/db/schema-sync';
import { vi } from 'vitest';

export interface TestDatabase {
	sqlite: ReturnType<typeof Database>;
	db: ReturnType<typeof drizzle>;
}

export function createTestDb(): TestDatabase {
	const sqlite = new Database(':memory:');
	const db = drizzle(sqlite, { schema });
	syncSchema(sqlite);
	return { sqlite, db };
}

export function destroyTestDb(testDb: TestDatabase) {
	testDb.sqlite.close();
}

export function clearTestDb(testDb: TestDatabase) {
	testDb.db.delete(schema.scoringProfiles).run();
	testDb.db.delete(schema.customFormats).run();
}

export function createDbMock(testDb: TestDatabase) {
	return {
		get db() {
			return testDb.db;
		},
		get sqlite() {
			return testDb.sqlite;
		},
		initializeDatabase: vi.fn().mockResolvedValue(undefined)
	};
}
