import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types.js';
import { requireAdmin, requireAuth } from '$lib/server/auth/authorization.js';
import { parseBody } from '$lib/server/api/validate.js';
import { getLibraryEntityService } from '$lib/server/library/LibraryEntityService.js';
import { libraryCreateSchema, libraryMediaTypeSchema } from '$lib/validation/schemas.js';
import { isAppError } from '$lib/errors';

const listSchema = z.object({
	mediaType: libraryMediaTypeSchema.optional(),
	includeSystem: z.coerce.boolean().optional().default(true)
});

export const GET: RequestHandler = async (event) => {
	const authError = requireAuth(event);
	if (authError) return authError;

	const parsed = listSchema.safeParse({
		mediaType: event.url.searchParams.get('mediaType') ?? undefined,
		includeSystem: event.url.searchParams.get('includeSystem') ?? 'true'
	});

	if (!parsed.success) {
		return json(
			{
				error: 'Invalid query parameters',
				details: parsed.error.flatten()
			},
			{ status: 400 }
		);
	}

	const service = getLibraryEntityService();
	const libraries = await service.listLibraries(parsed.data);

	return json({ success: true, libraries });
};

export const POST: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	try {
		const data = await parseBody(event.request, libraryCreateSchema);
		const service = getLibraryEntityService();
		const library = await service.createLibrary(data);
		return json({ success: true, library });
	} catch (error) {
		if (isAppError(error)) {
			return json(error.toJSON(), { status: error.statusCode });
		}
		throw error;
	}
};
