import type { PageServerLoad } from './$types';

/**
 * Server load function - minimal since data is loaded client-side
 * This prevents unnecessary database queries on initial page load
 */
export const load: PageServerLoad = async () => {
	// Data is loaded client-side via unmatchedFilesStore
	// This avoids loading potentially large datasets on every page request
	return {};
};
