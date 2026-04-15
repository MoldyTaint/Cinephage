import type { PageServerLoad } from './$types';
import { getMediaBrowserManager } from '$lib/server/notifications/mediabrowser';

export const load: PageServerLoad = async () => {
	const manager = getMediaBrowserManager();
	const servers = await manager.getServers();

	return {
		servers
	};
};
