import type { RequestHandler } from '@sveltejs/kit';

import type { CapturedLogFilters } from '$lib/logging/log-capture';
import { requireAdmin } from '$lib/server/auth/authorization.js';
import { logCaptureStore } from '$lib/server/logging/log-capture-store.js';
import { createSSEStream } from '$lib/server/sse';
import { logFilterQuerySchema } from '$lib/validation/schemas.js';

function parseFilters(url: URL): CapturedLogFilters {
	const raw = Object.fromEntries(url.searchParams.entries());
	const result = logFilterQuerySchema.safeParse(raw);

	if (!result.success) {
		return { limit: 200 };
	}

	const { level, levels, logDomain, search, limit } = result.data;
	const filters: CapturedLogFilters = {};

	if (levels && levels.length > 0) {
		filters.levels = levels;
	} else if (level) {
		filters.level = level;
	}

	if (logDomain) filters.logDomain = logDomain;
	if (search) filters.search = search;
	filters.limit = limit ?? 200;

	return filters;
}

export const GET: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	const filters = parseFilters(event.url);

	return createSSEStream((send) => {
		send('logs:seed', { entries: logCaptureStore.getSnapshot(filters) });

		const unsubscribe = logCaptureStore.subscribe((entry) => {
			if (logCaptureStore.matches(entry, filters)) {
				send('log:entry', entry);
			}
		});

		return () => {
			unsubscribe();
		};
	});
};
