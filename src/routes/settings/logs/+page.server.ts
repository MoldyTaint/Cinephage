import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

import { CAPTURED_LOG_DOMAINS, CAPTURED_LOG_LEVELS } from '$lib/logging/log-capture';
import {
	DEFAULT_LOG_RETENTION_DAYS,
	MAX_LOG_RETENTION_DAYS,
	logHistoryService
} from '$lib/server/logging/log-history.js';

export const load = async ({ locals }: RequestEvent) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (locals.user.role !== 'admin') {
		throw error(403, 'Forbidden');
	}

	const initialHistory = await logHistoryService.search({
		page: 1,
		pageSize: 100,
		levels: ['debug', 'info', 'warn', 'error']
	});

	return {
		initialEntries: initialHistory.entries,
		initialTotal: initialHistory.total,
		initialHasMore: initialHistory.hasMore,
		initialPage: initialHistory.page,
		initialPageSize: initialHistory.pageSize,
		availableLevels: [...CAPTURED_LOG_LEVELS],
		availableDomains: [...CAPTURED_LOG_DOMAINS],
		retentionDays: await logHistoryService.getRetentionDays(),
		defaultRetentionDays: DEFAULT_LOG_RETENTION_DAYS,
		maxRetentionDays: MAX_LOG_RETENTION_DAYS
	};
};
