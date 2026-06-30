import type { PageServerLoad } from './$types';
import { getFileManagementSettings } from '$lib/server/settings/file-management.js';

export const load: PageServerLoad = async () => {
	const settings = await getFileManagementSettings();
	return { settings };
};
