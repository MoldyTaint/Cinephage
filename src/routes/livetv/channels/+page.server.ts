import type { ServerLoad } from '@sveltejs/kit';
import { getManagedApiKeysForRequest } from '$lib/server/auth/index.js';
import { error } from '@sveltejs/kit';

export const load: ServerLoad = async ({ request, locals }) => {
	// Require authentication
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	try {
		const { streamingApiKey } = await getManagedApiKeysForRequest(request.headers);

		return {
			streamingApiKey: streamingApiKey?.key ?? null
		};
	} catch (err) {
		console.error('Error loading streaming API key:', err);
		return {
			streamingApiKey: null,
			error: 'Failed to load streaming API key'
		};
	}
};
