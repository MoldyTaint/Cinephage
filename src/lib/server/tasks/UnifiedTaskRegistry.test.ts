import { describe, it, expect } from 'vitest';
import {
	getUnifiedTaskById,
	getMaintenanceTasks,
	UNIFIED_TASK_DEFINITIONS
} from './UnifiedTaskRegistry.js';

describe('UnifiedTaskRegistry', () => {
	it('exposes the original-language-backfill maintenance task', () => {
		const task = getUnifiedTaskById('original-language-backfill');

		expect(task).toBeDefined();
		expect(task!.category).toBe('maintenance');
		expect(task!.runEndpoint).toBe('/api/monitoring/search/original-language-backfill');
		expect(task!.name).toBe('Original Language Backfill');
	});

	it('lists the task among maintenance tasks and all definitions', () => {
		expect(getMaintenanceTasks().some((t) => t.id === 'original-language-backfill')).toBe(true);
		expect(UNIFIED_TASK_DEFINITIONS.some((t) => t.id === 'original-language-backfill')).toBe(true);
	});

	it('does not confuse it with the metadata-refresh task', () => {
		const metadataRefresh = getUnifiedTaskById('metadata-refresh');
		expect(metadataRefresh!.runEndpoint).toBe('/api/monitoring/search/metadata-refresh');
	});
});
