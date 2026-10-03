/**
 * Admin-managed per-user request settings (disable, auto-approve grant,
 * quota overrides). Null values inherit the global request settings.
 *
 * GET /api/settings/users/[userId]/request-settings — current overrides
 * PUT /api/settings/users/[userId]/request-settings — partial update
 *
 * Auth: admin only. Unknown users 404.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { parseBody } from '$lib/server/api/validate.js';
import { requireAdmin } from '$lib/server/auth/authorization.js';
import {
	getUserRequestSettingsService,
	userRequestSettingsUpdateSchema
} from '$lib/server/requests/UserRequestSettingsService.js';

async function userExists(userId: string): Promise<boolean> {
	const row = await db.select({ id: user.id }).from(user).where(eq(user.id, userId)).get();
	return row !== undefined;
}

export const GET: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	if (!(await userExists(event.params.userId))) {
		return json({ success: false, error: 'Unknown user' }, { status: 404 });
	}

	const settings = await getUserRequestSettingsService().getUserRequestSettings(
		event.params.userId
	);
	return json({ success: true, settings });
};

export const PUT: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	if (!(await userExists(event.params.userId))) {
		return json({ success: false, error: 'Unknown user' }, { status: 404 });
	}

	const update = await parseBody(event.request, userRequestSettingsUpdateSchema);
	const settings = await getUserRequestSettingsService().updateUserRequestSettings(
		event.params.userId,
		update
	);
	return json({ success: true, settings });
};
