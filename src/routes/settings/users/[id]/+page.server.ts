import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { count, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { user } from '$lib/server/db/schema.js';
import { requireAdminPage } from '$lib/server/auth/authorization.js';
import { auth } from '$lib/server/auth/index.js';
import { mediaServerLinkService } from '$lib/server/mediaServerLink/MediaServerLinkService.js';

export const load: PageServerLoad = async ({ locals, params, request }) => {
	requireAdminPage(locals);

	const [profile] = await db
		.select({
			id: user.id,
			username: user.username,
			displayUsername: user.displayUsername,
			name: user.name,
			email: user.email,
			role: user.role,
			banned: user.banned,
			banReason: user.banReason,
			banExpires: user.banExpires,
			createdAt: user.createdAt
		})
		.from(user)
		.where(eq(user.id, params.id))
		.limit(1);

	if (!profile) {
		throw error(404, 'User not found');
	}

	// Total admin count feeds the last-admin guard in the UI.
	const [{ value: adminCount }] = await db
		.select({ value: count() })
		.from(user)
		.where(eq(user.role, 'admin'));

	// Sessions through the admin plugin so per-session revocation uses the
	// same tokens the plugin issued. The plugin checks the admin permission
	// against the requesting session.
	const sessionsResult = await auth.api.listUserSessions({
		body: { userId: profile.id },
		headers: request.headers
	});

	const currentToken = locals.session?.token ?? null;
	const sessions = (sessionsResult.sessions ?? [])
		.map((row) => ({
			id: row.id,
			token: row.token,
			userAgent: row.userAgent,
			ipAddress: row.ipAddress,
			createdAt: row.createdAt,
			expiresAt: row.expiresAt,
			current: row.token === currentToken
		}))
		.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

	return {
		profile,
		sessions,
		adminCount,
		mediaLinks: await mediaServerLinkService.getLinks(profile.id),
		linkableServers: await mediaServerLinkService.getLinkableServers()
	};
};
