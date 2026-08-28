import type { PageServerLoad } from './$types.js';
import { getArchiverManager } from '$lib/server/archivers/index.js';

export const load: PageServerLoad = async () => ({
	archivers: await getArchiverManager().list()
});
