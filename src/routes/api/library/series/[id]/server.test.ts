import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, destroyTestDb, type TestDatabase } from '../../../../../test/db-helper';
import { api } from '../../../../../test/api-helper';
import { languageProfiles, libraries, rootFolders, series } from '$lib/server/db/schema.js';

const testDb: TestDatabase = createTestDb();

vi.mock('$lib/server/db/index.js', () => ({
	get db() {
		return testDb.db;
	},
	get sqlite() {
		return testDb.sqlite;
	},
	initializeDatabase: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/server/tmdb.js', () => ({
	tmdb: {
		getTVShow: vi.fn().mockResolvedValue({ id: 1, name: 'TMDB Show', seasons: [] }),
		getSeason: vi.fn().mockResolvedValue({ episodes: [] })
	}
}));

vi.mock('$lib/server/subtitles/services/SubtitleImportService.js', () => ({
	searchSubtitlesForNewMedia: vi.fn().mockResolvedValue(undefined),
	searchSubtitlesForMediaBatch: vi.fn().mockResolvedValue(undefined)
}));

const { GET, PATCH } = await import('./+server');
const { eq } = await import('drizzle-orm');
const { LanguageSettingsService } =
	await import('$lib/server/subtitles/services/LanguageSettingsService.js');

const LANGUAGE_PROFILE_ID = 'b0000000-0000-4000-8000-000000000001';
const OTHER_PROFILE_ID = 'b0000000-0000-4000-8000-000000000002';

async function seedLanguageProfile(id: string, name: string): Promise<void> {
	await testDb.db
		.insert(languageProfiles)
		.values({
			id,
			name,
			audio: { preferOriginal: true, languages: [], mode: 'prefer' },
			subtitles: [{ tag: 'en', variant: 'regular', accessibility: 'any' }],
			cutoffRank: null,
			minimumScore: 70,
			upgradesAllowed: true
		})
		.onConflictDoNothing()
		.run();
}

async function seedSeries(options: { languageProfileId?: string | null } = {}): Promise<string> {
	await testDb.db
		.insert(rootFolders)
		.values({ id: 'rf-api-series', name: 'TV', path: '/media/tv', mediaType: 'tv' })
		.run();
	await testDb.db
		.insert(libraries)
		.values({
			id: 'lib-api-series',
			name: 'TV Library',
			slug: 'tv-library-api',
			mediaType: 'tv'
		})
		.run();
	await testDb.db
		.insert(series)
		.values({
			id: 'series-api-1',
			tmdbId: 9101,
			title: 'Api Series',
			path: 'Api Series',
			rootFolderId: 'rf-api-series',
			libraryId: 'lib-api-series',
			languageProfileId: options.languageProfileId ?? null
		})
		.run();
	return 'series-api-1';
}

async function resetTables(): Promise<void> {
	for (const table of [
		'subtitles',
		'episode_files',
		'episodes',
		'seasons',
		'series',
		'libraries',
		'root_folders',
		'language_profiles',
		'language_settings'
	]) {
		testDb.sqlite.prepare(`DELETE FROM ${table}`).run();
	}
}

beforeEach(resetTables);

afterAll(() => destroyTestDb(testDb));

describe('GET /api/library/series/[id] — effectiveLanguageProfile', () => {
	it('returns the effective profile with its source (override)', async () => {
		await seedLanguageProfile(LANGUAGE_PROFILE_ID, 'SeriesOverride');
		const seriesId = await seedSeries({ languageProfileId: LANGUAGE_PROFILE_ID });
		await seedLanguageProfile(OTHER_PROFILE_ID, 'Default');
		await LanguageSettingsService.getInstance().update({ defaultProfileId: OTHER_PROFILE_ID });

		const { status, data } = await api.get(GET, { params: { id: seriesId } });
		const payload = data as {
			series: { effectiveLanguageProfile: Record<string, unknown> | null };
		};

		expect(status).toBe(200);
		expect(payload.series.effectiveLanguageProfile).toEqual({
			source: 'series',
			profile: expect.objectContaining({ id: LANGUAGE_PROFILE_ID, name: 'SeriesOverride' })
		});
	});

	it('reports the library source when there is no override, and null when nothing resolves', async () => {
		const seriesId = await seedSeries();

		const none = await api.get(GET, { params: { id: seriesId } });
		expect(
			(none.data as { series: { effectiveLanguageProfile: unknown } }).series
				.effectiveLanguageProfile
		).toBeNull();

		await seedLanguageProfile(OTHER_PROFILE_ID, 'Library');
		await testDb.db
			.update(libraries)
			.set({ languageProfileId: OTHER_PROFILE_ID })
			.where(eq(libraries.id, 'lib-api-series'))
			.run();

		const fallback = await api.get(GET, { params: { id: seriesId } });
		expect(
			(fallback.data as { series: { effectiveLanguageProfile: Record<string, unknown> } }).series
				.effectiveLanguageProfile
		).toEqual({
			source: 'library',
			profile: expect.objectContaining({ id: OTHER_PROFILE_ID })
		});
	});
});

describe('PATCH /api/library/series/[id] — languageProfileId', () => {
	it('assigns an existing profile via the override column', async () => {
		await seedLanguageProfile(LANGUAGE_PROFILE_ID, 'Assign Series');
		const seriesId = await seedSeries();

		const { status } = await api.put(
			PATCH,
			{ languageProfileId: LANGUAGE_PROFILE_ID },
			{ params: { id: seriesId } }
		);

		expect(status).toBe(200);
		const row = await testDb.db
			.select({ languageProfileId: series.languageProfileId })
			.from(series)
			.where(eq(series.id, seriesId))
			.get();
		expect(row?.languageProfileId).toBe(LANGUAGE_PROFILE_ID);
	});

	it('clears the override with null so the series inherits again', async () => {
		await seedLanguageProfile(LANGUAGE_PROFILE_ID, 'Clear Series');
		const seriesId = await seedSeries({ languageProfileId: LANGUAGE_PROFILE_ID });

		const { status } = await api.put(
			PATCH,
			{ languageProfileId: null },
			{ params: { id: seriesId } }
		);

		expect(status).toBe(200);
		const row = await testDb.db
			.select({ languageProfileId: series.languageProfileId })
			.from(series)
			.where(eq(series.id, seriesId))
			.get();
		expect(row?.languageProfileId).toBeNull();
	});

	it('rejects an unknown profile id with 400 and leaves the column untouched', async () => {
		await seedLanguageProfile(LANGUAGE_PROFILE_ID, 'Keep Series');
		const seriesId = await seedSeries({ languageProfileId: LANGUAGE_PROFILE_ID });

		const { status, data } = await api.put(
			PATCH,
			{ languageProfileId: 'b0000000-0000-4000-8000-00000000dead' },
			{ params: { id: seriesId } }
		);

		expect(status).toBe(400);
		expect(data).toEqual(
			expect.objectContaining({ success: false, error: expect.stringContaining('not found') })
		);
		const row = await testDb.db
			.select({ languageProfileId: series.languageProfileId })
			.from(series)
			.where(eq(series.id, seriesId))
			.get();
		expect(row?.languageProfileId).toBe(LANGUAGE_PROFILE_ID);
	});
});
