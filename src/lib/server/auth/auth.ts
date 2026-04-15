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
import { getSystemSettingsService } from '$lib/server/settings/SystemSettingsService.js';
import { ac, admin as adminRole, user as userRole } from '$lib/auth/access-control.js';
import { isHardReservedUsername, isValidUsernameFormat } from '$lib/auth/username-policy.js';
import { ensureSoleUserIsAdminRecord } from './admin-bootstrap.js';
import { isSetupComplete } from './setup.js';

/**
 * Extract IP from hostname (e.g., "192.168.1.100:5173" → "192.168.1.100")
 */
function extractIpFromHostname(hostname: string): string | null {
	// Remove port if present
	const host = hostname.split(':')[0];

	// Check if it's already an IP (IPv4)
	if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) {
		return host;
	}

	return null;
}

/**
 * Check if an IP address is in a private/local network range
 * RFC1918 private ranges + loopback + link-local
 */
function isLocalIpAddress(ip: string): boolean {
	// Handle IPv4-mapped IPv6 addresses
	if (ip.startsWith('::ffff:')) {
		ip = ip.slice(7);
	}

	// IPv4 ranges
	if (ip.includes('.')) {
		const parts = ip.split('.').map(Number);
		if (parts.length === 4 && parts.every((p) => !isNaN(p) && p >= 0 && p <= 255)) {
			// 10.0.0.0/8
			if (parts[0] === 10) return true;
			// 172.16.0.0/12
			if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
			// 192.168.0.0/16
			if (parts[0] === 192 && parts[1] === 168) return true;
			// 127.0.0.0/8 (loopback)
			if (parts[0] === 127) return true;
			// 169.254.0.0/16 (link-local/APIPA)
			if (parts[0] === 169 && parts[1] === 254) return true;
		}
	}

	// IPv6
	if (ip.includes(':')) {
		// ::1 (loopback)
		if (ip === '::1' || ip === '0:0:0:0:0:0:0:1') return true;
		// fc00::/7 (unique local)
		if (/^fc[0-9a-f]/i.test(ip)) return true;
		// fe80::/10 (link-local)
		if (/^fe80:/i.test(ip)) return true;
	}

	return false;
}

/**
 * Check if an origin is from the local network
 * This allows seamless access from any device on the LAN without configuration
 */
function isLocalNetworkOrigin(origin: string): boolean {
	try {
		const url = new URL(origin);
		const ip = extractIpFromHostname(url.hostname);

		// If it's a hostname (not an IP), check common local hostnames
		if (!ip) {
			// Allow common local hostnames
			const localHostnames = ['localhost', '127.0.0.1', '0.0.0.0'];
			if (localHostnames.includes(url.hostname)) return true;
			return false;
		}

		return isLocalIpAddress(ip);
	} catch {
		return false;
	}
}

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

	// Trust origins from environment, database, or common local development URLs
	// Also automatically trust any local network origin (RFC1918 private IPs)
	// This allows seamless access from any device on the LAN without configuration
	trustedOrigins: async (request) => {
		const origins = [
			'http://localhost:3000',
			'http://127.0.0.1:3000',
			'http://localhost:5173',
			'http://127.0.0.1:5173',
			'https://localhost:3000',
			'https://127.0.0.1:3000',
			'https://localhost:5173',
			'https://127.0.0.1:5173'
		];

		// Dynamically trust local network origins
		// This allows access from any device on the LAN (192.168.x.x, 10.x.x.x, etc.)
		if (request) {
			const requestOrigin = new URL(request.url).origin;
			const forwardedOrigin = getForwardedOrigin(request);
			const origin = request.headers.get('origin');

			origins.push(requestOrigin);
			if (forwardedOrigin) {
				origins.push(forwardedOrigin);
			}

			if (
				origin &&
				(isLocalNetworkOrigin(origin) || origin === requestOrigin || origin === forwardedOrigin)
			) {
				origins.push(origin);
			}
		}

		// Add external URL from database (configured via settings UI)
		try {
			const settingsService = getSystemSettingsService();
			const externalUrl = await settingsService.getExternalUrl();
			if (externalUrl) {
				origins.push(externalUrl);
			}
		} catch {
			// Database not ready yet, continue with defaults
		}

		// Add BETTER_AUTH_URL if set (production or custom deployment)
		if (process.env.BETTER_AUTH_URL) {
			origins.push(process.env.BETTER_AUTH_URL);
		}

		// Add ORIGIN if set (common Docker/manual deployment configuration)
		if (process.env.ORIGIN) {
			origins.push(process.env.ORIGIN);
		}

		// Add additional trusted origins from comma-separated env var
		if (process.env.BETTER_AUTH_TRUSTED_ORIGINS) {
			const additional = process.env.BETTER_AUTH_TRUSTED_ORIGINS.split(',').map((o) => o.trim());
			origins.push(...additional);
		}

		return [...new Set(origins)];
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
