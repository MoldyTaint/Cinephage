import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

import { CAPTURED_LOG_DOMAINS, CAPTURED_LOG_LEVELS } from '$lib/logging/log-capture';
import { logCaptureStore } from '$lib/server/logging/log-capture-store.js';

export const load = async ({ locals }: RequestEvent) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (locals.user.role !== 'admin') {
		throw error(403, 'Forbidden');
	}

	return {
		initialEntries: logCaptureStore.getSnapshot({ limit: 200 }),
		availableLevels: [...CAPTURED_LOG_LEVELS],
		availableDomains: [...CAPTURED_LOG_DOMAINS]
	};
};
