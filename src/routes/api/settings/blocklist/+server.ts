import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { blocklistService } from '$lib/server/monitoring/specifications/BlocklistSpecification.js';
import { z } from 'zod';

export const GET: RequestHandler = async ({ url }) => {
	const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 200);
	const offset = parseInt(url.searchParams.get('offset') ?? '0');
	const reason = url.searchParams.get('reason') ?? undefined;
	const protocol = url.searchParams.get('protocol') ?? undefined;
	const activeOnly = url.searchParams.get('activeOnly') === 'true';

	const [entries, total] = await Promise.all([
		blocklistService.getBlocklist({
			reason: reason ?? undefined,
			protocol: protocol ?? undefined,
			activeOnly,
			limit,
			offset
		}),
		blocklistService.getBlocklistCount({
			reason: reason ?? undefined,
			protocol: protocol ?? undefined,
			activeOnly
		})
	]);

	return json({ entries, total });
};

const deleteSchema = z.object({
	ids: z.array(z.string()).min(1).optional(),
	action: z.enum(['purgeExpired']).optional()
});

export const DELETE: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const parsed = deleteSchema.safeParse(body);

	if (!parsed.success) {
		return json(
			{ error: 'Invalid request body', details: parsed.error.flatten() },
			{ status: 400 }
		);
	}

	const { ids, action } = parsed.data;

	if (action === 'purgeExpired') {
		await blocklistService.cleanExpiredEntries();
		return json({ success: true, message: 'Expired entries purged' });
	}

	if (ids && ids.length > 0) {
		await blocklistService.removeFromBlocklistByIds(ids);
		return json({ success: true, removed: ids.length });
	}

	return json({ error: 'No action specified' }, { status: 400 });
};
