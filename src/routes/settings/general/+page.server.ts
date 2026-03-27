import type { PageServerLoad } from './$types';
import { getRootFolderService } from '$lib/server/downloadClients/RootFolderService';
import { isAnimeRootFolderEnforcementEnabled } from '$lib/server/library/anime-root-enforcement-settings.js';

export const load: PageServerLoad = async () => {
	const rootFolderService = getRootFolderService();
	const [rootFolders, enforceAnimeSubtype] = await Promise.all([
		rootFolderService.getFolders(),
		isAnimeRootFolderEnforcementEnabled()
	]);

	return {
		rootFolders,
		enforceAnimeSubtype
	};
};
