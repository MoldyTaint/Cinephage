import { describe, it, expect, afterAll } from 'vitest';
import { vi } from 'vitest';
import { createTestDb, destroyTestDb, type TestDatabase } from '../../../test/db-helper.js';
import { resolveMovieMultiQuality } from './movie-buckets.js';
import type { Resolution } from '$lib/server/indexers/parser/types.js';

const testDb: TestDatabase = createTestDb();

vi.mock('$lib/server/db', () => ({
	get db() {
		return testDb.db;
	}
}));

afterAll(() => {
	destroyTestDb(testDb);
});

async function seedProfile(
	id: string,
	opts: { minResolution?: string | null; maxResolution?: string | null }
) {
	const { db } = testDb;
	const { scoringProfiles } = await import('$lib/server/db/schema');
	await db
		.insert(scoringProfiles)
		.values({
			id,
			name: id,
			minResolution: opts.minResolution ?? null,
			maxResolution: opts.maxResolution ?? null
		})
		.run();
}

describe('resolveMovieMultiQuality', () => {
	it('fast-paths null desired qualities without touching the db', async () => {
		const ctx = await resolveMovieMultiQuality(null, 'nope');
		expect(ctx.multiQuality).toBe(false);
		expect(ctx.effective).toEqual([]);
	});

	it('fast-paths fewer than two desired qualities', async () => {
		const ctx = await resolveMovieMultiQuality(['2160p'], 'nope');
		expect(ctx.multiQuality).toBe(false);
	});

	it('returns all desired qualities when profile has no min/max', async () => {
		await seedProfile('p-noconstraints', {});
		const ctx = await resolveMovieMultiQuality(
			['2160p', '1080p'] as Resolution[],
			'p-noconstraints'
		);
		expect(ctx.multiQuality).toBe(true);
		expect(ctx.effective).toEqual(['2160p', '1080p']);
	});

	it('clamps buckets to the profile max resolution', async () => {
		await seedProfile('p-max1080', { maxResolution: '1080p' });
		const ctx = await resolveMovieMultiQuality(
			['2160p', '1080p', '720p'] as Resolution[],
			'p-max1080'
		);
		expect(ctx.effective).toEqual(['1080p', '720p']);
		expect(ctx.multiQuality).toBe(true);
	});

	it('drops to single-quality when only one bucket survives clamping', async () => {
		await seedProfile('p-max720', { maxResolution: '720p' });
		const ctx = await resolveMovieMultiQuality(['2160p', '720p'] as Resolution[], 'p-max720');
		expect(ctx.effective).toEqual(['720p']);
		expect(ctx.multiQuality).toBe(false);
	});

	it('treats a missing profile id as unconstrained', async () => {
		const ctx = await resolveMovieMultiQuality(
			['2160p', '1080p'] as Resolution[],
			'does-not-exist'
		);
		expect(ctx.multiQuality).toBe(true);
		expect(ctx.effective).toEqual(['2160p', '1080p']);
	});
});
