import { getMigrations } from 'better-auth/db/migration';
import Database from 'better-sqlite3';
import { logger } from '$lib/logging';
import { getAuthDatabasePath, getAuthSecret } from './secret.js';

/**
 * Run Better Auth migrations programmatically
 * This creates/updates auth tables (user, session, account, verification) automatically
 * Called on application startup
 */
export async function runBetterAuthMigrations(): Promise<void> {
	const dbPath = getAuthDatabasePath();
	const authDb = new Database(dbPath);

	try {
		logger.info('[Better Auth] Checking for pending migrations...');

		// Create auth config for migration (minimal config needed)
		const authConfig = {
			database: authDb,
			secret: getAuthSecret(),
			emailAndPassword: {
				enabled: true,
				requireEmailVerification: false
			}
			// Note: We don't need plugins here - the migration system handles core tables
		};

		const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(authConfig);

		// Log what needs to be done
		if (toBeCreated.length > 0) {
			logger.info(`[Better Auth] Tables to create: ${toBeCreated.map((t) => t.table).join(', ')}`);
		}

		if (toBeAdded.length > 0) {
			logger.info(
				`[Better Auth] Tables needing column updates: ${toBeAdded.map((t) => t.table).join(', ')}`
			);
		}

		if (toBeCreated.length === 0 && toBeAdded.length === 0) {
			logger.info('[Better Auth] No migrations needed - database is up to date');
			return;
		}

		// Run the migrations
		logger.info('[Better Auth] Running migrations...');
		await runMigrations();
		logger.info('[Better Auth] Migrations completed successfully');
	} catch (error) {
		// Log error but don't crash - Better Auth will try to create tables on first use
		logger.error('[Better Auth] Migration error:', error);
		logger.warn('[Better Auth] Continuing startup - tables may be created on first auth request');
	} finally {
		authDb.close();
	}
}
