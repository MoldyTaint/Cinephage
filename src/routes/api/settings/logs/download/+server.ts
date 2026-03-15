import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';

import type { CapturedLogFilters } from '$lib/logging/log-capture';
import { requireAdmin } from '$lib/server/auth/authorization.js';
import { logCaptureStore } from '$lib/server/logging/log-capture-store.js';
import { logFilterQuerySchema } from '$lib/validation/schemas.js';

function parseFilters(url: URL): CapturedLogFilters {
	const raw = Object.fromEntries(url.searchParams.entries());
	const result = logFilterQuerySchema.safeParse(raw);

	if (!result.success) {
		return { limit: 500 };
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
	filters.limit = limit ?? 500;

	return filters;
}

export const GET: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	const format = event.url.searchParams.get('format') ?? 'jsonl';
	const filters = parseFilters(event.url);
	const entries = logCaptureStore.getSnapshot(filters);

	if (format === 'json') {
		return json({ success: true, entries, total: entries.length });
	}

	const body = entries.map((entry) => JSON.stringify(entry)).join('\n');

	return new Response(body, {
		headers: {
			'Content-Type': 'application/x-ndjson; charset=utf-8',
			'Content-Disposition': 'attachment; filename="cinephage-logs.jsonl"'
		}
	});
};
