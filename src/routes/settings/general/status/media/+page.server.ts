import { redirect } from '@sveltejs/kit';

export const load = () => {
	throw redirect(301, '/settings/monitoring/status/media');
};
