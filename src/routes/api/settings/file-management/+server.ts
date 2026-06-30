import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth/authorization.js';
import { fileManagementSchema } from '$lib/validation/schemas.js';
import { parseBody } from '$lib/server/api/validate.js';
import {
	getFileManagementSettings,
	setFileManagementSettings,
	invalidateFileManagementCache
} from '$lib/server/settings/file-management.js';

export const GET: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	const data = await getFileManagementSettings();
	return json({ success: true, ...data });
};

export const PUT: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	const result = await parseBody(event.request, fileManagementSchema);

	await setFileManagementSettings(result);
	invalidateFileManagementCache();

	return json({ success: true, ...result });
};
