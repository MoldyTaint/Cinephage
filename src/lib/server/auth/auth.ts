import { betterAuth } from 'better-auth';
import { username, admin } from 'better-auth/plugins';
import { apiKey } from '@better-auth/api-key';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { APIError } from 'better-auth/api';
import Database from 'better-sqlite3';
import {
	ensureAuthDatabaseDirectory,
	getAuthDatabasePath,
	getAuthSecret,
	getBaseURL
} from './secret.js';
import {
	createBetterAuthTables,
	createBetterAuthIndexes,
	convergeApikeySchemaToV15
} from '$lib/server/db/migration-helpers.js';
import { getSystemSettingsService } from '$lib/server/settings/SystemSettingsService.js';
import { ac, admin as adminRole, user as userRole } from '$lib/auth/access-control.js';
import { isHardReservedUsername, isValidUsernameFormat } from '$lib/auth/username-policy.js';
import { ensureSoleUserIsAdminRecord } from './admin-bootstrap.js';
import { isSetupComplete } from './setup.js';
import { isLocalNetworkOrigin } from '$lib/server/utils/origin.js';

function getFirstForwardedHeaderValue(value: string | null): string | null {
	if (!value) {
		return null;
	}

	const first = value
		.split(',')
		.map((part) => part.trim())
		.find((part) => part.length > 0);
	return first ?? null;
}

function getForwardedOrigin(request: Request): string | null {
	const forwardedHost = getFirstForwardedHeaderValue(request.headers.get('x-forwarded-host'));
	if (!forwardedHost) {
		return null;
	}

	const protoCandidate = getFirstForwardedHeaderValue(request.headers.get('x-forwarded-proto'));
	const forwardedProto =
		protoCandidate === 'http' || protoCandidate === 'https' ? protoCandidate : 'https';

	try {
		return new URL(`${forwardedProto}://${forwardedHost}`).origin;
	} catch {
		return null;
	}
}

/**
 * Username validator - checks shared format rules and hard-reserved namespaces
 */
function validateUsername(username: string): boolean {
	if (!isValidUsernameFormat(username)) {
		return false;
	}

	if (isHardReservedUsername(username)) {
		return false;
	}

	return true;
}

/**
 * Generate display username from username
 * e.g., "john_doe" -> "John Doe"
 */
function generateDisplayUsername(username: string): string {
	return username
		.split('_')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
		.join(' ');
}

// Initialize Better Auth's native SQLite database connection
// Use the shared auth database path so Docker and local runtime stay aligned.
const DB_PATH = getAuthDatabasePath();
ensureAuthDatabaseDirectory();
const authDb = new Database(DB_PATH);

// Better Auth 1.7 validates the database schema on first access and caches a
// mismatch permanently (only its own migrate clears the cache). The tables
// normally come from schema-sync at startup, but a request can reach auth
// before that runs on a fresh install — so create them here, idempotently,
// before betterAuth() is ever constructed. Databases created before apikey
// v1.5 additionally need their legacy userId column converged here, or the
// same first-access validation would latch a mismatch before migrations run.
createBetterAuthTables(authDb);
convergeApikeySchemaToV15(authDb);
createBetterAuthIndexes(authDb);

const disableSecureCookies = process.env.BETTER_AUTH_DISABLE_SECURE_COOKIES === 'true';
const useSecureCookies = !disableSecureCookies && getBaseURL().startsWith('https://');

/**
 * Better Auth configuration for Cinephage
 * Username-based authentication with no email required
 */
export const auth = betterAuth({
	// Get or auto-generate secret (works for Docker and bare-metal)
	// Better Auth requires a stable base URL for redirects/callbacks.
	// We prefer env, then saved external URL, then localhost for dev/LAN bootstrap.
	secret: getAuthSecret(),
	baseURL: getBaseURL(),

	// Allow Better Auth to infer the effective host when deployed behind a reverse proxy.
	trustedProxyHeaders: true,

	// Function form is required (not a static array) so origins can be resolved per-request
	// from env vars, the database external URL, and forwarded proxy headers.
	// better-auth calls this at init time with request=undefined to seed ctx.context.trustedOrigins,
	// and again per-request inside validateOrigin. We return [origin] when the origin is trusted
	// so matchesOriginPattern(origin, origin) trivially succeeds without depending on normalization.
	trustedOrigins: async (request) => {
		const trusted = new Set<string>();

		const addOrigin = (value: string) => {
			try {
				trusted.add(new URL(value).origin);
			} catch {
				// ignore malformed entries
			}
		};

		// Static dev origins
		for (const o of [
			'http://localhost:3000',
			'http://127.0.0.1:3000',
			'http://localhost:5173',
			'http://127.0.0.1:5173',
			'https://localhost:3000',
			'https://127.0.0.1:3000',
			'https://localhost:5173',
			'https://127.0.0.1:5173'
		]) {
			addOrigin(o);
		}

		// Request-specific origins — only available on per-request calls, not at init time
		if (request) {
			addOrigin(request.url);
			const forwardedOrigin = getForwardedOrigin(request);
			if (forwardedOrigin) addOrigin(forwardedOrigin);
		}

		// External URL from settings UI
		try {
			const settingsService = getSystemSettingsService();
			const externalUrl = await settingsService.getExternalUrl();
			if (externalUrl) addOrigin(externalUrl);
		} catch {
			// Database not ready yet; skip
		}

		if (process.env.BETTER_AUTH_URL) addOrigin(process.env.BETTER_AUTH_URL);
		if (process.env.ORIGIN) addOrigin(process.env.ORIGIN);

		if (process.env.BETTER_AUTH_TRUSTED_ORIGINS) {
			for (const o of process.env.BETTER_AUTH_TRUSTED_ORIGINS.split(',')) {
				addOrigin(o.trim());
			}
		}

		// Per-request bypass: if the Origin header is explicitly trusted (or is a local
		// network address), return [origin] as the sole pattern entry so better-auth's
		// matchesOriginPattern(origin, origin) trivially succeeds without normalization.
		if (request) {
			const origin = request.headers.get('origin');
			if (origin && (isLocalNetworkOrigin(origin) || trusted.has(origin))) {
				return [origin];
			}
		}

		return [...trusted];
	},

	// Use native SQLite adapter instead of Drizzle to avoid boolean binding issues
	database: authDb,

	// Enable email/password (required for username plugin)
	// The username plugin extends email/password auth
	emailAndPassword: {
		enabled: true,
		requireEmailVerification: false, // No email verification needed
		minPasswordLength: 8,
		maxPasswordLength: 128
	},

	// Enable username plugin
	plugins: [
		username({
			minUsernameLength: 3,
			maxUsernameLength: 32,
			usernameValidator: validateUsername
		}),
		apiKey({
			enableSessionForAPIKeys: true,
			apiKeyHeaders: ['x-api-key'],
			defaultPrefix: 'cinephage_',
			defaultKeyLength: 64,
			rateLimit: {
				enabled: true,
				timeWindow: 1000 * 60 * 60, // 1 hour
				maxRequests: 10000 // 10000 requests per hour per key
			},
			enableMetadata: true
		}),
		admin({
			ac,
			roles: {
				admin: adminRole,
				user: userRole
			}
		}),
		sveltekitCookies(getRequestEvent) // Must be last plugin for proper cookie handling
	],

	// Session configuration - 7 days
	session: {
		expiresIn: 60 * 60 * 24 * 7, // 7 days in seconds
		updateAge: 60 * 60 * 24, // Refresh every day
		storeSessionInDatabase: true,
		cookieCache: {
			enabled: true,
			maxAge: 60 * 60 * 24 * 7 // 7 days
		}
	},

	// Rate limiting - 5 attempts per 15 minutes
	rateLimit: {
		enabled: true,
		window: 900, // 15 minutes
		max: 5, // 5 attempts
		storage: 'database'
	},

	// Database hooks for user management
	databaseHooks: {
		user: {
			create: {
				before: async (user) => {
					if (await isSetupComplete()) {
						throw new APIError('FORBIDDEN', {
							message: 'User registration is disabled. Only one admin account is allowed.'
						});
					}

					return {
						data: {
							...user,
							role: 'admin'
						}
					};
				}
			},
			update: {
				before: async (data, ctx) => {
					// Prevent changing admin role to user
					if (data.role === 'user' && ctx?.context?.session?.user?.role === 'admin') {
						throw new APIError('FORBIDDEN', {
							message: 'Cannot change admin role. Single admin system.'
						});
					}
					return { data };
				}
			}
		}
	},

	advanced: {
		cookiePrefix: useSecureCookies ? '__Secure' : 'cinephage',

		useSecureCookies: useSecureCookies,

		defaultCookieAttributes: {
			httpOnly: true,
			secure: useSecureCookies,
			sameSite: 'lax'
		}
	}
});

export async function repairCurrentUserAdminRole(userId: string): Promise<boolean> {
	return ensureSoleUserIsAdminRecord(userId);
}

// Export helper functions
export { validateUsername, generateDisplayUsername };

// Export types
type AuthType = typeof auth;
export type { AuthType };
