import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// Redirect to the new unified quality settings page
	throw redirect(301, '/settings/quality?tab=profiles');
};
