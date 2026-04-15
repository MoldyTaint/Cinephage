import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { requireAdmin, requireAuth } from '$lib/server/auth/authorization.js';
import { parseBody, parseOptionalBody } from '$lib/server/api/validate.js';
import { getLibraryEntityService } from '$lib/server/library/LibraryEntityService.js';
import { libraryUpdateSchema } from '$lib/validation/schemas.js';
import { NotFoundError, isAppError } from '$lib/errors';
import { z } from 'zod';

const libraryDeleteSchema = z.object({
	targetLibraryId: z.string().uuid().optional().nullable()
});

export const GET: RequestHandler = async (event) => {
	const authError = requireAuth(event);
	if (authError) return authError;

	const service = getLibraryEntityService();
	const library = await service.getLibrary(event.params.id);
	if (!library) {
		throw new NotFoundError('Library', event.params.id);
	}

	return json({ success: true, library });
};

export const PUT: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	try {
		const updates = await parseBody(event.request, libraryUpdateSchema);
		const service = getLibraryEntityService();
		const library = await service.updateLibrary(event.params.id, updates);
		return json({ success: true, library });
	} catch (error) {
		if (isAppError(error)) {
			return json(error.toJSON(), { status: error.statusCode });
		}
		throw error;
	}
};

export const DELETE: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	try {
		const payload = await parseOptionalBody(event.request, libraryDeleteSchema);
		const service = getLibraryEntityService();
		await service.deleteLibrary(event.params.id, payload.targetLibraryId ?? null);
		return json({ success: true });
	} catch (error) {
		if (isAppError(error)) {
			return json(error.toJSON(), { status: error.statusCode });
		}
		throw error;
	}
};
