import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async ({ url }) => {
	const search = url.search || '';
	throw redirect(308, `/api/health${search}`);
};
