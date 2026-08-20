import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { db } from '$lib/server/db/index.js';
import {
	rejectedReleases,
	importFailures,
	renamingFailures,
	unmatchedFiles,
	metadataConflicts
} from '$lib/server/db/schema.js';
import { count, ne } from 'drizzle-orm';
import { logger } from '$lib/logging';

/**
 * GET /api/reports/summary
 * Returns unresolved record counts for all five diagnostic report types.
 */
export const GET: RequestHandler = async () => {
	try {
		const [[rejectedCount], [importCount], [renamingCount], [unmatchedCount], [metadataCount]] =
			await Promise.all([
				db
					.select({ count: count() })
					.from(rejectedReleases)
					.where(ne(rejectedReleases.status, 'resolved')),
				db
					.select({ count: count() })
					.from(importFailures)
					.where(ne(importFailures.status, 'resolved')),
				db
					.select({ count: count() })
					.from(renamingFailures)
					.where(ne(renamingFailures.status, 'resolved')),
				db.select({ count: count() }).from(unmatchedFiles),
				db
					.select({ count: count() })
					.from(metadataConflicts)
					.where(ne(metadataConflicts.status, 'resolved'))
			]);

		return json({
			success: true,
			data: {
				rejectedReleases: rejectedCount.count,
				importFailures: importCount.count,
				renamingFailures: renamingCount.count,
				unmatchedImports: unmatchedCount.count,
				metadataConflicts: metadataCount.count,
				total:
					rejectedCount.count +
					importCount.count +
					renamingCount.count +
					unmatchedCount.count +
					metadataCount.count
			}
		});
	} catch (err) {
		logger.error({ err }, '[Reports] Failed to load summary counts');
		return json({ success: false, error: 'Failed to load report summary' }, { status: 500 });
	}
};
