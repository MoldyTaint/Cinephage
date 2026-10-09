import type { Handle } from '@sveltejs/kit/hooks';
import { randomUUID } from 'node:crypto';
import { cookieName, locales } from '#lib/paraglide/runtime.js';
import { isLocalNetworkOrigin } from '#lib/server/utils/origin.js';
import type { AuthSessionRecord, AuthSessionUser } from './auth.js';

function createSupportId(): string {
	return randomUUID().split('-')[0] ?? randomUUID();
}

/**
 * Seed the interface-theme cookie from the saved account preference on
 * browsers that don't have one yet, so the theme follows the account
 * across devices. The anti-flash script in app.html prefers the cookie
 * over localStorage. Lookups go through a short-lived cache: this runs on
 * every authenticated request, and the preference changes rarely.
 */
const THEME_COOKIE = 'cinephage-theme';
const themeCache = new Map<string, { value: string | null; expiresAt: number }>();
const THEME_CACHE_TTL_MS = 60_000;

async function resolveAccountTheme(userId: string): Promise<string | null> {
	const cached = themeCache.get(userId);
	if (cached && cached.expiresAt > Date.now()) {
		return cached.value;
	}

	let value: string | null = null;
	try {
		const { getUserPreference } = await import('#lib/server/preferences/user-preferences.js');
		const preference = await getUserPreference(userId, 'theme');
		value = typeof preference === 'string' ? preference : null;
	} catch {
		// Preference storage unavailable (fresh DB, tests) — fall through to null.
	}

	themeCache.set(userId, { value, expiresAt: Date.now() + THEME_CACHE_TTL_MS });
	return value;
}

async function seedThemeCookie(event: Parameters<Handle>[0]['event']): Promise<void> {
	if (event.cookies.get(THEME_COOKIE) || !event.locals.user) {
		return;
	}

	const savedTheme = await resolveAccountTheme(event.locals.user.id);
	if (savedTheme) {
		event.cookies.set(THEME_COOKIE, savedTheme, {
			path: '/',
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 365
		});
	}
}

/**
 * Keep session.lastActiveAt and user.lastActiveAt roughly current without
 * writing to the DB on every single authenticated request. Both columns are
 * written together: the session-scoped one powers the per-device list on the
 * profile page, and the user-scoped one survives that session being revoked
 * (revocation hard-deletes the row; see DELETE /api/user/sessions), so the
 * admin users list can still show when an account with no sessions left was
 * last used.
 */
const LAST_ACTIVE_CACHE_TTL_MS = 60_000;
const lastActiveCache = new Map<string, number>();

async function touchLastActive(event: Parameters<Handle>[0]['event']): Promise<void> {
	const sessionId = event.locals.session?.id;
	const userId = event.locals.user?.id;
	if (!sessionId || !userId) {
		return;
	}

	const lastWrite = lastActiveCache.get(sessionId);
	const now = Date.now();
	if (lastWrite && now - lastWrite < LAST_ACTIVE_CACHE_TTL_MS) {
		return;
	}
	lastActiveCache.set(sessionId, now);

	try {
		const { db } = await import('#lib/server/db/index.js');
		const { session: sessionTable, user: userTable } = await import('#lib/server/db/schema.js');
		const { eq } = await import('drizzle-orm');
		const timestamp = new Date().toISOString();
		await Promise.all([
			db
				.update(sessionTable)
				.set({ lastActiveAt: timestamp })
				.where(eq(sessionTable.id, sessionId)),
			db.update(userTable).set({ lastActiveAt: timestamp }).where(eq(userTable.id, userId))
		]);
	} catch {
		// Non-critical: last-active is a convenience field, never block the request on it.
	}
}

/**
 * Populate event.locals from a resolved Better Auth session.
 *
 * The session objects are assigned as-is (typed by auth.$Infer via
 * AuthSessionUser/AuthSessionRecord) — no shape normalization. Consumers
 * only read id/role/language, all plain strings in the inferred shape.
 */
function setAuthenticatedLocals(
	event: Parameters<Handle>[0]['event'],
	session: { user: AuthSessionUser; session: AuthSessionRecord },
	apiKey: string | null,
	apiKeyPermissions: Record<string, string[]> | null = null
): void {
	event.locals.user = session.user;
	event.locals.session = session.session;
	event.locals.apiKey = apiKey;
	event.locals.apiKeyPermissions = apiKeyPermissions;

	// Seed the interface-locale cookie from the saved account preference on
	// browsers that don't have one yet, so the user's language follows them
	// across devices. Paraglide still owns locale negotiation once set.
	const savedLocale = session.user.language;
	if (savedLocale && locales.includes(savedLocale as never) && !event.cookies.get(cookieName)) {
		event.cookies.set(cookieName, savedLocale, {
			path: '/',
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 365
		});
	}

	void seedThemeCookie(event);
	void touchLastActive(event);
}

function clearAuthenticatedLocals(event: Parameters<Handle>[0]['event']): void {
	event.locals.user = null;
	event.locals.session = null;
	event.locals.apiKey = null;
	event.locals.apiKeyPermissions = null;
}

/**
 * Remove the `Secure` attribute from a single Set-Cookie header value.
 * Case-insensitive on the attribute name; leaves every other attribute
 * (HttpOnly, SameSite, Path, Max-Age, …) untouched. Pure/no I/O so it's
 * directly unit-testable - see stripSecureCookiesForLocalHttp for why this
 * exists.
 */
function stripSecureFromSetCookie(value: string): string {
	return value
		.split(';')
		.filter((part) => part.trim().toLowerCase() !== 'secure')
		.join(';');
}

/**
 * better-auth's `useSecureCookies` is a single global flag, computed once at
 * startup from the stored External URL setting (see getBaseURL() in
 * secret.ts): if an admin points External URL at an https:// reverse proxy,
 * EVERY cookie gets `Secure` - including ones set for plain http:// LAN
 * access, where browsers silently refuse to store a Secure cookie. The
 * password verifies, the cookie just never sticks, and the user is bounced
 * back to the login page with no useful error (GitHub issue #596).
 *
 * This makes the decision per-request instead: strip `Secure` from outgoing
 * Set-Cookie headers only when the request is confidently a direct plain-HTTP
 * LAN connection, so the real HTTPS-proxy path is completely unaffected (no
 * global weakening - unlike the existing BETTER_AUTH_DISABLE_SECURE_COOKIES
 * escape hatch, which turns Secure off everywhere).
 *
 * "Confidently LAN" requires both:
 *  - event.url's host is a private IP/localhost (isLocalNetworkOrigin) - this
 *    reads the raw incoming Host header, which for a direct connection is the
 *    LAN IP/port and for a reverse-proxied connection is the proxy's public
 *    domain, regardless of whether adapter-node is configured to trust
 *    X-Forwarded-* headers (it isn't, here) or not.
 *  - no X-Forwarded-Proto: https header - defense in depth, so a proxy that
 *    *does* forward from a private-IP Host but terminates TLS is still
 *    respected and keeps Secure cookies.
 */
function stripSecureCookiesForLocalHttp(
	event: Parameters<Handle>[0]['event'],
	response: Response
): Response {
	const forwardedProto = event.request.headers.get('x-forwarded-proto');
	if (forwardedProto?.toLowerCase() === 'https') {
		return response;
	}
	if (!isLocalNetworkOrigin(event.url.origin)) {
		return response;
	}

	const setCookies = response.headers.getSetCookie();
	if (setCookies.length === 0 || !setCookies.some((c) => /;\s*secure/i.test(c))) {
		return response;
	}

	const rewritten = new Response(response.body, response);
	rewritten.headers.delete('set-cookie');
	for (const cookie of setCookies) {
		rewritten.headers.append('set-cookie', stripSecureFromSetCookie(cookie));
	}
	return rewritten;
}

export {
	createSupportId,
	setAuthenticatedLocals,
	clearAuthenticatedLocals,
	stripSecureFromSetCookie,
	stripSecureCookiesForLocalHttp
};
