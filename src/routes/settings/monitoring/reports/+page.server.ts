import type { PageServerLoad } from './$types.js';
import { db } from '$lib/server/db/index.js';
import {
	rejectedReleases,
	importFailures,
	renamingFailures,
	unmatchedFiles,
	metadataConflicts
} from '$lib/server/db/schema.js';
import { count, ne } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
	const [[rejected], [imports], [renaming], [unmatched], [metadata]] = await Promise.all([
		db
			.select({ count: count() })
			.from(rejectedReleases)
			.where(ne(rejectedReleases.status, 'overridden')),
		db.select({ count: count() }).from(importFailures).where(ne(importFailures.status, 'resolved')),
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

	return {
		counts: {
			rejectedReleases: rejected.count,
			importFailures: imports.count,
			renamingFailures: renaming.count,
			unmatchedImports: unmatched.count,
			metadataConflicts: metadata.count
		}
	};
};
