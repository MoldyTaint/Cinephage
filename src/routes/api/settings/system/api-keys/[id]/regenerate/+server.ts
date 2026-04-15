import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { logger } from '$lib/logging';
import { regenerateRecoverableApiKey } from '$lib/server/auth/index.js';

// POST /api/settings/system/api-keys/[id]/regenerate - Regenerate an API key
export const POST: RequestHandler = async ({ params, request, locals }) => {
	// Require authentication
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { id } = params;
	if (!id) {
		return json({ error: 'API key ID is required' }, { status: 400 });
	}

	try {
		const newKey = await regenerateRecoverableApiKey({
			keyId: id,
			userId: locals.user.id,
			headers: request.headers
		});

		if (!newKey) {
			return json({ error: 'API key not found' }, { status: 404 });
		}

		return json({
			success: true,
			data: {
				id: newKey.id,
				key: newKey.key,
				name: newKey.name,
				metadata: newKey.metadata
			}
		});
	} catch (error) {
		logger.error(
			{ err: error, component: 'ApiKeyRegenerateApi', keyId: id },
			'Error regenerating API key'
		);
		return json({ error: 'Failed to regenerate API key' }, { status: 500 });
	}
};
