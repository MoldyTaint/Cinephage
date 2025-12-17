/**
 * Test Database Helper
 *
 * Provides an isolated test database for API endpoint tests.
 * Uses a separate file-based database to avoid conflicts with the main database.
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '$lib/server/db/schema';
import { syncSchema } from '$lib/server/db/schema-sync';
import { existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { vi } from 'vitest';

const TEST_DB_PATH = 'data/test-cinephage.db';

// Ensure data directory exists
if (!existsSync('data')) {
	mkdirSync('data', { recursive: true });
}

// Singleton state - initialized lazily
let testSqlite: ReturnType<typeof Database> | null = null;
let testDb: ReturnType<typeof drizzle> | null = null;
let initialized = false;

/**
 * Initialize a fresh test database (call once at start of test suite)
 */
export function initTestDb() {
	// Close existing connection if any
	if (testSqlite) {
		try {
			testSqlite.close();
		} catch {
			// Ignore if already closed
		}
	}

	// Delete existing test database
	if (existsSync(TEST_DB_PATH)) {
		try {
			unlinkSync(TEST_DB_PATH);
		} catch {
			// Ignore
		}
	}

	// Create new database
	testSqlite = new Database(TEST_DB_PATH);
	testDb = drizzle(testSqlite, { schema });

	// Sync schema to create tables
	syncSchema(testSqlite);

	initialized = true;

	return { sqlite: testSqlite, db: testDb };
}

/**
 * Get the current test database instance (initializes if needed)
 */
export function getTestDb() {
	if (!initialized || !testDb || !testSqlite) {
		return initTestDb();
	}
	return { sqlite: testSqlite, db: testDb };
}

/**
 * Close and cleanup test database
 */
export function closeTestDb() {
	if (testSqlite) {
		try {
			testSqlite.close();
		} catch {
			// Ignore if already closed
		}
		testSqlite = null;
		testDb = null;
		initialized = false;
	}

	// Optionally delete the test database file
	if (existsSync(TEST_DB_PATH)) {
		try {
			unlinkSync(TEST_DB_PATH);
		} catch {
			// Ignore errors during cleanup
		}
	}
}

/**
 * Clear all data from the test database (keeps schema)
 */
export function clearTestDb() {
	const { db } = getTestDb();

	// Clear all tables in reverse order of dependencies
	db.delete(schema.profileSizeLimits).run();
	db.delete(schema.scoringProfiles).run();
	db.delete(schema.customFormats).run();
}

/**
 * Create a mock for $lib/server/db that uses test database
 * Returns an object with getters that always return the current test db
 */
export function createDbMock() {
	return {
		get db() {
			return getTestDb().db;
		},
		get sqlite() {
			return getTestDb().sqlite;
		},
		initializeDatabase: vi.fn().mockResolvedValue(undefined)
	};
}

/**
 * Setup mock for $lib/server/quality to avoid cache issues in tests
 */
export function mockQualityFilter() {
	return {
		qualityFilter: {
			clearProfileCache: vi.fn(),
			getProfile: vi.fn()
		}
	};
}
