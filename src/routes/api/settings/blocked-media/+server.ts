import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { blockedMediaService } from '$lib/server/blocked-media/index.js';
import { blockMediaSchema, unblockMediaSchema } from '$lib/validation/schemas.js';

export const GET: RequestHandler = async ({ url }) => {
	const search = url.searchParams.get('search') ?? undefined;
	const mediaType = url.searchParams.get('mediaType') ?? undefined;
	const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100') || 100, 200);
	const offset = parseInt(url.searchParams.get('offset') ?? '0') || 0;

	const result = await blockedMediaService.getBlockedMedia({
		search,
		mediaType,
		limit,
		offset
	});

	return json(result);
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const parsed = blockMediaSchema.safeParse(body);

	if (!parsed.success) {
		return json(
			{ error: 'Invalid request body', details: parsed.error.flatten() },
			{ status: 400 }
		);
	}

	const entry = await blockedMediaService.blockMedia(parsed.data);

	return json({ success: true, entry });
};

export const DELETE: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const parsed = unblockMediaSchema.safeParse(body);

	if (!parsed.success) {
		return json(
			{ error: 'Invalid request body', details: parsed.error.flatten() },
			{ status: 400 }
		);
	}

	await blockedMediaService.unblockMedia(parsed.data.ids);

	return json({ success: true, removed: parsed.data.ids.length });
};
