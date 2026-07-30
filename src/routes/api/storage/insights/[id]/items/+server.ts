import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { storageInsights } from '$lib/server/db/schema';
import { requireAuth } from '$lib/server/auth/authorization.js';
import { getInsightItemResolver } from '$lib/server/storage/insights/items/registry.js';
import type { InsightType } from '$lib/server/storage/insights/types.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const authError = requireAuth(event);
	if (authError) return authError;

	const insightId = event.params.id;
	if (!insightId) {
		throw error(400, 'Insight ID is required');
	}

	const page = Math.max(1, parseInt(event.url.searchParams.get('page') ?? '1', 10) || 1);
	const limit = Math.min(
		100,
		Math.max(1, parseInt(event.url.searchParams.get('limit') ?? '50', 10) || 50)
	);

	const insight = db.select().from(storageInsights).where(eq(storageInsights.id, insightId)).get();

	if (!insight) {
		throw error(404, 'Insight not found');
	}

	const resolver = getInsightItemResolver(insight.insightType as InsightType);
	const result = await resolver({ db, insight, page, limit });

	return json({
		success: true,
		data: {
			items: result.items,
			pagination: {
				page,
				limit,
				total: result.total,
				totalPages: Math.max(1, Math.ceil(result.total / limit))
			}
		},
		meta: {
			insightId,
			insightType: insight.insightType,
			filters: { page, limit }
		}
	});
};
