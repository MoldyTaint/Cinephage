import { redirect } from '@sveltejs/kit';

export const load = ({ url }: { url: URL }) => {
	const tab = url.searchParams.get('tab');
	const target = tab ? `/settings/library/quality?tab=${tab}` : '/settings/library/quality';
	throw redirect(301, target);
};
