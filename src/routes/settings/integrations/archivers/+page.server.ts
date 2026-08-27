import type { PageServerLoad } from './$types.js';
import { getArchiverManager } from '$lib/server/archivers/index.js';
import { asc } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { rootFolders } from '$lib/server/db/schema.js';

export const load: PageServerLoad = async () => ({
	archivers: await getArchiverManager().list(),
	rootFolders: await db
		.select({
			id: rootFolders.id,
			name: rootFolders.name,
			path: rootFolders.path,
			mediaType: rootFolders.mediaType
		})
		.from(rootFolders)
		.orderBy(asc(rootFolders.name))
});
