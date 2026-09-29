import type { Handle } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { cookieName, locales } from '$lib/paraglide/runtime.js';
import type { AuthSessionRecord, AuthSessionUser } from './auth.js';

function createSupportId(): string {
	return randomUUID().split('-')[0] ?? randomUUID();
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
	const savedLocale = event.locals.user.language;
	if (savedLocale && locales.includes(savedLocale as never) && !event.cookies.get(cookieName)) {
		event.cookies.set(cookieName, savedLocale, {
			path: '/',
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 365
		});
	}
}

function clearAuthenticatedLocals(event: Parameters<Handle>[0]['event']): void {
	event.locals.user = null;
	event.locals.session = null;
	event.locals.apiKey = null;
	event.locals.apiKeyPermissions = null;
}

export { createSupportId, setAuthenticatedLocals, clearAuthenticatedLocals };
