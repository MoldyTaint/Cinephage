import type { PageServerLoad } from './$types';
import { getDownloadClientManager } from '$lib/server/downloadClients/DownloadClientManager';

export const load: PageServerLoad = async () => {
	const downloadClientManager = getDownloadClientManager();
	const downloadClients = await downloadClientManager.getClients();

	return {
		downloadClients
	};
};
