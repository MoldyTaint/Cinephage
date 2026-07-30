import { describe, it, expect, afterAll, beforeEach, vi } from 'vitest';
import {
	createTestDb,
	destroyTestDb,
	clearTestDb,
	type TestDatabase
} from '../../../../../test/db-helper.js';
import { movies, series } from '$lib/server/db/schema';
import { createMovie, createSeries } from '../../../../../test/fixtures/index.js';

const testDb: TestDatabase = createTestDb();

vi.mock('$lib/server/db', () => ({
	get db() {
		return testDb.db;
	},
	get sqlite() {
		return testDb.sqlite;
	},
	initializeDatabase: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/server/db/index.js', () => ({
	get db() {
		return testDb.db;
	},
	get sqlite() {
		return testDb.sqlite;
	},
	initializeDatabase: vi.fn().mockResolvedValue(undefined)
}));

import { qualityBelowCutoffResolver } from './quality-below-cutoff.js';

describe('qualityBelowCutoffResolver', () => {
	afterAll(() => destroyTestDb(testDb));
	beforeEach(() => clearTestDb(testDb));

	it('returns items from detailsJson payload with badges', async () => {
		await testDb.db
			.insert(movies)
			.values(createMovie({ id: 'q-movie-a', tmdbId: 100, title: 'Movie A' }));
		await testDb.db
			.insert(series)
			.values(createSeries({ id: 'q-series-b', tmdbId: 200, title: 'Series B' }));

		const result = await qualityBelowCutoffResolver({
			db: testDb.db as any,
			page: 1,
			limit: 50,
			insight: {
				id: 'test',
				insightType: 'quality-below-cutoff',
				severity: 'info',
				scope: 'global',
				scopeId: null,
				title: 'Items below quality cutoff',
				summary: '2 items below cutoff',
				detailsJson: JSON.stringify({
					items: [
						{ tmdbId: 100, title: 'Movie A', currentResolution: '720p', minResolution: '1080p' },
						{ tmdbId: 200, title: 'Series B', currentResolution: '480p', minResolution: '1080p' }
					]
				}),
				reclaimableBytes: null,
				itemCount: 2,
				firstDetectedAt: '',
				lastDetectedAt: '',
				dismissedAt: null,
				dismissedBy: null
			}
		});

		expect(result.items).toHaveLength(2);
		expect(result.total).toBe(2);
		expect(result.items[0].badges?.[0]?.label).toBe('720p');
		expect(result.items[1].badges?.[1]?.label).toBe('target: 1080p');
		expect(result.items[0].href).toBe('/library/movie/q-movie-a');
		expect(result.items[1].href).toBe('/library/tv/q-series-b');
	});

	it('handles empty items', async () => {
		const result = await qualityBelowCutoffResolver({
			db: testDb.db as any,
			page: 1,
			limit: 50,
			insight: {
				id: 'test',
				insightType: 'quality-below-cutoff',
				severity: 'info',
				scope: 'global',
				scopeId: null,
				title: 'Test',
				summary: null,
				detailsJson: JSON.stringify({ items: [] }),
				reclaimableBytes: null,
				itemCount: 0,
				firstDetectedAt: '',
				lastDetectedAt: '',
				dismissedAt: null,
				dismissedBy: null
			}
		});
		expect(result.items).toHaveLength(0);
		expect(result.total).toBe(0);
	});

	it('paginates correctly', async () => {
		const items = Array.from({ length: 5 }, (_, i) => ({
			tmdbId: 100 + i,
			title: `Item ${i}`,
			currentResolution: '720p',
			minResolution: '1080p'
		}));

		const page1 = await qualityBelowCutoffResolver({
			db: testDb.db as any,
			page: 1,
			limit: 2,
			insight: {
				id: 'test',
				insightType: 'quality-below-cutoff',
				severity: 'info',
				scope: 'global',
				scopeId: null,
				title: 'Test',
				summary: null,
				detailsJson: JSON.stringify({ items }),
				reclaimableBytes: null,
				itemCount: 5,
				firstDetectedAt: '',
				lastDetectedAt: '',
				dismissedAt: null,
				dismissedBy: null
			}
		});
		expect(page1.items).toHaveLength(2);
		expect(page1.total).toBe(5);

		const page3 = await qualityBelowCutoffResolver({
			db: testDb.db as any,
			page: 3,
			limit: 2,
			insight: {
				id: 'test',
				insightType: 'quality-below-cutoff',
				severity: 'info',
				scope: 'global',
				scopeId: null,
				title: 'Test',
				summary: null,
				detailsJson: JSON.stringify({ items }),
				reclaimableBytes: null,
				itemCount: 5,
				firstDetectedAt: '',
				lastDetectedAt: '',
				dismissedAt: null,
				dismissedBy: null
			}
		});
		expect(page3.items).toHaveLength(1);
	});

	it('handles missing detailsJson', async () => {
		const result = await qualityBelowCutoffResolver({
			db: testDb.db as any,
			page: 1,
			limit: 50,
			insight: {
				id: 'test',
				insightType: 'quality-below-cutoff',
				severity: 'info',
				scope: 'global',
				scopeId: null,
				title: 'Test',
				summary: null,
				detailsJson: null,
				reclaimableBytes: null,
				itemCount: 0,
				firstDetectedAt: '',
				lastDetectedAt: '',
				dismissedAt: null,
				dismissedBy: null
			}
		});
		expect(result.items).toHaveLength(0);
	});
});
