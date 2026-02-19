import type { PageServerLoad } from './$types';
import { getNntpServerService } from '$lib/server/streaming/nzb/NntpServerService';

export const load: PageServerLoad = async () => {
	const nntpService = getNntpServerService();
	const nntpServers = await nntpService.getServers();

	return {
		nntpServers
	};
};
