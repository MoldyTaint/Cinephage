import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import * as schema from './schema';
import { createChildLogger } from '$lib/logging';

const logger = createChildLogger({ logDomain: 'system' as const });
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
	sqlite.pragma('wal_autocheckpoint = 4000');
	sqlite.pragma('temp_store = MEMORY');
	sqlite.pragma('foreign_keys = ON');
} catch (error) {
	logger.warn(
		{
			err: error
		},
		'Failed to apply SQLite pragmas'
	);
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
function runStartupMaintenance(): void {
	// One-time: switch from auto_vacuum=NONE to INCREMENTAL so deleted pages are
	// reclaimed incrementally instead of building up as freelist bloat.
	// PRAGMA auto_vacuum can only change outside a transaction and requires VACUUM
	// to take effect — the pragma value itself (2 = INCREMENTAL) is the done-marker.
	const autoVacuumMode = sqlite.pragma('auto_vacuum', { simple: true }) as number;

	if (autoVacuumMode !== 2) {
		logger.info(
			'[DB] Running one-time VACUUM to reclaim freelist space and enable incremental auto-vacuum (this may take a moment)...'
		);
		const start = Date.now();
		sqlite.pragma('auto_vacuum = INCREMENTAL');
		sqlite.exec('VACUUM');
		logger.info({ durationMs: Date.now() - start }, '[DB] VACUUM complete');
		return;
	}

	// Every startup: reclaim any pages freed since last run.
	sqlite.pragma('incremental_vacuum');
}

export async function initializeDatabase(): Promise<void> {
	if (initialized) return;

	try {
		logger.info('Initializing database...');

		// Use embedded schema sync (no external migration files needed)
		syncSchema(sqlite);

		runStartupMaintenance();

		const { keywordBlocklistService } =
			await import('$lib/server/settings/KeywordBlocklistService.js');
		await keywordBlocklistService.seedDefaults();

		initialized = true;
		logger.info('Database initialization complete');
	} catch (error) {
		logger.error({ err: error }, 'Database initialization failed');
		throw error;
	}
}
