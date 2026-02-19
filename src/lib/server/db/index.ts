import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import * as schema from './schema';
import { logger } from '$lib/logging';
import { syncSchema } from './schema-sync';

// Ensure data directory exists before creating database connection
const DATA_DIR = process.env.DATA_DIR || 'data';
if (!existsSync(DATA_DIR)) {
	mkdirSync(DATA_DIR, { recursive: true });
}

const sqlite = new Database(`${DATA_DIR}/cinephage.db`);

try {
	// Improve concurrent read/write behavior during heavy background jobs (for example EPG sync).
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('synchronous = NORMAL');
	sqlite.pragma('busy_timeout = 5000');
	sqlite.pragma('foreign_keys = ON');
} catch (error) {
	logger.warn('Failed to apply SQLite pragmas', {
		error: error instanceof Error ? error.message : String(error)
	});
}

export const db = drizzle(sqlite, { schema });

// Export sqlite for direct access when needed (schema sync uses it)
export { sqlite };

let initialized = false;

/**
 * Initialize database using embedded schema synchronization.
 *
 * This replaces the previous migration-file-based system with an embedded
 * schema versioning approach (similar to Radarr/Sonarr).
 *
 * Handles:
 * 1. Fresh install - Creates all tables, sets schema version
 * 2. Existing database - Ensures all tables exist, runs incremental updates
 * 3. Migration-era database - Backward compatible with old migration system
 */
export async function initializeDatabase(): Promise<void> {
	if (initialized) return;

	try {
		logger.info('Initializing database...');

		// Use embedded schema sync (no external migration files needed)
		syncSchema(sqlite);

		initialized = true;
		logger.info('Database initialization complete');
	} catch (error) {
		logger.error('Database initialization failed', error);
		throw error;
	}
}
