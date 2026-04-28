import type { Handle } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import type { SessionRecord, UserRecord } from '$lib/server/db/schema.js';

type AuthSessionUser = {
	id: string;
	email: string;
	name?: string | null;
	image?: string | null;
	username?: string | null;
	displayUsername?: string | null;
	role?: string | null;
	language?: string | null;
	emailVerified?: boolean | number | null;
	banned?: boolean | number | null;
	banReason?: string | null;
	banExpires?: string | Date | null;
	createdAt?: string | Date | null;
	updatedAt?: string | Date | null;
};

type AuthSessionRecord = {
	id: string;
	userId: string;
	token: string;
	expiresAt?: string | Date | null;
	ipAddress?: string | null;
	userAgent?: string | null;
	impersonatedBy?: string | null;
	createdAt?: string | Date | null;
	updatedAt?: string | Date | null;
};

function createSupportId(): string {
	return randomUUID().split('-')[0] ?? randomUUID();
}

function toIntegerFlag(value: boolean | number | null | undefined): number | null {
	if (typeof value === 'number') {
		return value;
	}
	if (typeof value === 'boolean') {
		return value ? 1 : 0;
	}
	return null;
}

function toIsoString(value: string | Date | null | undefined): string {
	if (value instanceof Date) {
		return value.toISOString();
	}
	if (typeof value === 'string') {
		return value;
	}
	return new Date().toISOString();
}

function normalizeAuthUser(user: AuthSessionUser): UserRecord {
	return {
		id: user.id,
		name: user.name ?? null,
		email: user.email,
		emailVerified: toIntegerFlag(user.emailVerified),
		image: user.image ?? null,
		username: user.username ?? null,
		displayUsername: user.displayUsername ?? null,
		role: user.role ?? 'user',
		language: user.language ?? 'en',
		banned: toIntegerFlag(user.banned),
		banReason: user.banReason ?? null,
		banExpires:
			user.banExpires instanceof Date ? user.banExpires.toISOString() : (user.banExpires ?? null),
		createdAt: toIsoString(user.createdAt),
		updatedAt: toIsoString(user.updatedAt)
	};
}

function normalizeAuthSession(session: AuthSessionRecord): SessionRecord {
	return {
		id: session.id,
		userId: session.userId,
		token: session.token,
		expiresAt: toIsoString(session.expiresAt),
		ipAddress: session.ipAddress ?? null,
		userAgent: session.userAgent ?? null,
		impersonatedBy: session.impersonatedBy ?? null,
		createdAt: toIsoString(session.createdAt),
		updatedAt: toIsoString(session.updatedAt)
	};
}

function setAuthenticatedLocals(
	event: Parameters<Handle>[0]['event'],
	session: { user: AuthSessionUser; session: AuthSessionRecord },
	apiKey: string | null,
	apiKeyPermissions: Record<string, string[]> | null = null
): void {
	event.locals.user = normalizeAuthUser(session.user);
	event.locals.session = normalizeAuthSession(session.session);
	event.locals.apiKey = apiKey;
	event.locals.apiKeyPermissions = apiKeyPermissions;
}

function clearAuthenticatedLocals(event: Parameters<Handle>[0]['event']): void {
	event.locals.user = null;
	event.locals.session = null;
	event.locals.apiKey = null;
	event.locals.apiKeyPermissions = null;
}

export {
	createSupportId,
	toIntegerFlag,
	toIsoString,
	normalizeAuthUser,
	normalizeAuthSession,
	setAuthenticatedLocals,
	clearAuthenticatedLocals
};

export type { AuthSessionUser, AuthSessionRecord };
