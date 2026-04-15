import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { env } from '$env/dynamic/private';

const DATA_DIR = process.env.DATA_DIR || 'data';
const DEFAULT_BASE_URL = 'http://localhost:5173';
const BUILD_TIME_PLACEHOLDER = 'build-time-placeholder-do-not-use-in-production';

function normalizeUrl(url: string): string {
	return url.trim().replace(/\/+$/, '');
}

export function getAuthDatabasePath(): string {
	return (
		process.env.AUTH_DATABASE_URL || process.env.DATABASE_URL || join(DATA_DIR, 'cinephage.db')
	);
}

export function ensureAuthDatabaseDirectory(): void {
	const dbPath = getAuthDatabasePath();

	// Skip URI-style and in-memory database targets.
	if (dbPath === ':memory:' || dbPath.startsWith('file:')) {
		return;
	}

	mkdirSync(dirname(dbPath), { recursive: true });
}

function getConfiguredExternalUrl(): string | null {
	const dbPath = getAuthDatabasePath();

	if (!existsSync(dbPath)) {
		return null;
	}

	let sqlite: Database.Database | null = null;

	try {
		sqlite = new Database(dbPath, { readonly: true });
		const settingsTable = sqlite
			.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'settings'`)
			.get();

		if (!settingsTable) {
			return null;
		}

		const row = sqlite
			.prepare(`SELECT "value" FROM "settings" WHERE "key" = 'external_url' LIMIT 1`)
			.get() as { value?: string } | undefined;

		if (!row?.value) {
			return null;
		}

		return normalizeUrl(row.value);
	} catch {
		return null;
	} finally {
		sqlite?.close();
	}
}

/**
 * Get the Better Auth secret from environment.
 *
 * The secret MUST be provided via the BETTER_AUTH_SECRET environment variable
 * at runtime. Test/build contexts use a fixed placeholder so type-checking and
 * vitest imports do not fail.
 *
 * WARNING: Changing this value will invalidate all active sessions and make
 * encrypted API keys in the database permanently unrecoverable.
 */
export function getAuthSecret(): string {
	const secret = env.BETTER_AUTH_SECRET?.trim() || process.env.BETTER_AUTH_SECRET?.trim();
	if (secret) {
		return secret;
	}

	// During SSR build and vitest runs there is no runtime auth flow.
	// Use a deterministic placeholder to keep imports from crashing in CI/tests.
	if (process.env.VITE_SSR_BUILD || process.env.VITEST || process.env.NODE_ENV === 'test') {
		return BUILD_TIME_PLACEHOLDER;
	}

	throw new Error(
		'BETTER_AUTH_SECRET is not set. ' +
			'Add it to your .env file or pass it as an environment variable. ' +
			'Generate one with: openssl rand -base64 32 ' +
			"or node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\" " +
			'or python3 -c "import secrets,base64; print(base64.b64encode(secrets.token_bytes(32)).decode())"'
	);
}

/**
 * Get the base URL for Better Auth
 * Priority:
 * 1. BETTER_AUTH_URL environment variable
 * 2. ORIGIN environment variable
 * 3. Saved external URL from system settings
 * 4. Local development fallback
 */
export function getBaseURL(): string {
	if (process.env.BETTER_AUTH_URL?.trim()) {
		return normalizeUrl(process.env.BETTER_AUTH_URL);
	}

	if (process.env.ORIGIN?.trim()) {
		return normalizeUrl(process.env.ORIGIN);
	}

	const externalUrl = getConfiguredExternalUrl();
	if (externalUrl) {
		return externalUrl;
	}

	return DEFAULT_BASE_URL;
}
