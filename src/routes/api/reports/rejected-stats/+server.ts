import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { db } from '$lib/server/db/index.js';
import { rejectedReleases } from '$lib/server/db/schema.js';
import { count, eq, ne, and, gt } from 'drizzle-orm';
import { logger } from '$lib/logging';

export const GET: RequestHandler = async () => {
	try {
		const cutoff24h = new Date(Date.now() - 86_400_000).toISOString();
		const active = ne(rejectedReleases.status, 'resolved');

		const [[total], [newIn24h], [formatMismatch], [profileMismatch], [delayPending]] =
			await Promise.all([
				db.select({ count: count() }).from(rejectedReleases).where(active),
				db
					.select({ count: count() })
					.from(rejectedReleases)
					.where(and(active, gt(rejectedReleases.rejectedAt, cutoff24h))),
				db
					.select({ count: count() })
					.from(rejectedReleases)
					.where(and(active, eq(rejectedReleases.primaryReason, 'required_format_mismatch'))),
				db
					.select({ count: count() })
					.from(rejectedReleases)
					.where(and(active, eq(rejectedReleases.primaryReason, 'quality_profile_mismatch'))),
				db
					.select({ count: count() })
					.from(rejectedReleases)
					.where(and(active, eq(rejectedReleases.primaryReason, 'delay_profile_pending')))
			]);

		return json({
			success: true,
			data: {
				total: total.count,
				newIn24h: newIn24h.count,
				formatMismatch: formatMismatch.count,
				profileMismatch: profileMismatch.count,
				delayPending: delayPending.count
			}
		});
	} catch (err) {
		logger.error({ err }, '[Reports] Failed to load rejected release stats');
		return json({ success: false, error: 'Failed to load stats' }, { status: 500 });
	}
};
