import { redirect } from '@sveltejs/kit';

// Language profiles management moved to the Library > Languages tab.
export const load = () => {
	throw redirect(308, '/settings/library/languages');
};
