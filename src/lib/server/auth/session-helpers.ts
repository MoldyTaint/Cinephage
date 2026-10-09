import type { Handle } from '@sveltejs/kit/hooks';
import { randomUUID } from 'node:crypto';
import { cookieName, locales } from '#lib/paraglide/runtime.js';
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

export { createSupportId, setAuthenticatedLocals, clearAuthenticatedLocals };
