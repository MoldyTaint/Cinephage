import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { createTestDb, destroyTestDb, type TestDatabase } from '../../../../test/db-helper';
import { eq } from 'drizzle-orm';
import { libraries, movies, rootFolders } from '$lib/server/db/schema';
import type { LanguageProfile } from './LanguageProfileService';
import type { SubtitleStatus } from '../types';

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

const {
	LanguageProfileService,
	getLanguageProfileService,
	toLegacyPreferences,
	parseAudioPreference,
	parseSubtitleRequirements
} = await import('./LanguageProfileService');
const { LanguageSettingsService } = await import('./LanguageSettingsService');

const TABLES_TO_CLEAR = [
	'language_settings',
	'language_profiles',
	'movies',
	'series',
	'libraries',
	'smart_lists',
	'subtitles',
	'episode_files',
	'episodes',
	'root_folders'
];

/** Complete v2 profile fixture with overrides. */
function makeProfile(overrides: Partial<LanguageProfile> = {}): LanguageProfile {
	return {
		id: 'test-profile',
		name: 'Test Profile',
		audio: { preferOriginal: true, languages: [] },
		subtitles: [{ tag: 'en', variant: 'regular', accessibility: 'any' }],
		cutoffRank: null,
		minimumScore: 70,
		upgradesAllowed: true,
		...overrides
	};
}

/** Create-body for the service with canonical tags. */
function makeCreateBody(
	overrides: Partial<Omit<LanguageProfile, 'id' | 'createdAt' | 'updatedAt'>> = {}
): Omit<LanguageProfile, 'id' | 'createdAt' | 'updatedAt'> {
	return {
		name: 'Created Profile',
		audio: { preferOriginal: true, languages: ['ja'] },
		subtitles: [{ tag: 'en', variant: 'regular', accessibility: 'any' }],
		cutoffRank: null,
		minimumScore: 70,
		upgradesAllowed: true,
		...overrides
	};
}

/** Partial subtitle row for the private status-method tests. */
function subtitleRecord(overrides: Record<string, unknown>): never {
	return {
		id: 'sub-1',
		language: 'en',
		relativePath: 'Movie.Name.en.srt',
		format: 'srt',
		isForced: false,
		isHearingImpaired: false,
		matchScore: 90,
		movieId: 'movie-status',
		...overrides
	} as never;
}

/**
 * Seed a movie + root folder so resolveStoredSubtitlePaths can build a real
 * absolute path for movie-scoped subtitle rows. Returns the movie id.
 */
let movieFixtureCounter = 0;
function seedMovieFixture(movieId = 'movie-status', rootPath = '/media/movies'): string {
	testDb.db
		.insert(rootFolders)
		.values({ id: `rf-${movieId}`, name: 'Movies', path: rootPath, mediaType: 'movie' })
		.run();
	testDb.db
		.insert(movies)
		.values({
			id: movieId,
			tmdbId: ++movieFixtureCounter,
			title: 'Status Movie',
			path: 'Status Movie (2020)',
			rootFolderId: `rf-${movieId}`
		})
		.run();
	return movieId;
}

/** Call the private async status calculator with an injected existence predicate. */
async function calculate(
	service: ReturnType<typeof LanguageProfileService.getInstance>,
	profile: LanguageProfile,
	rows: never[],
	exists: (path: string) => boolean
): Promise<SubtitleStatus> {
	// @ts-expect-error accessing private async method for testing
	return service.calculateStatus(profile, rows, exists);
}

describe('LanguageProfileService', () => {
	let profileService: ReturnType<typeof LanguageProfileService.getInstance>;
	let settingsService: ReturnType<typeof LanguageSettingsService.getInstance>;

	beforeEach(() => {
		profileService = LanguageProfileService.getInstance();
		settingsService = LanguageSettingsService.getInstance();
		for (const table of TABLES_TO_CLEAR) {
			testDb.sqlite.prepare(`DELETE FROM ${table}`).run();
		}
	});

	afterAll(() => {
		destroyTestDb(testDb);
	});

	describe('Singleton pattern', () => {
		it('should return the same instance', () => {
			const instance1 = LanguageProfileService.getInstance();
			const instance2 = LanguageProfileService.getInstance();

			expect(instance1).toBe(instance2);
		});

		it('should return same instance via helper function', () => {
			const instance1 = getLanguageProfileService();
			const instance2 = getLanguageProfileService();

			expect(instance1).toBe(instance2);
		});
	});

	describe('Profile validation (create/update)', () => {
		it('should reject a profile without subtitle requirements', async () => {
			await expect(
				profileService.createProfile(makeCreateBody({ subtitles: [] }))
			).rejects.toThrow('At least one subtitle language is required');
		});

		it('should reject a cutoff rank that does not reference a requirement', async () => {
			await expect(
				profileService.createProfile(makeCreateBody({ cutoffRank: 3 }))
			).rejects.toThrow('Cutoff rank must reference a subtitle requirement');
		});

		it('should reject an update whose cutoff rank exceeds the requirement list', async () => {
			const created = await profileService.createProfile(makeCreateBody());

			await expect(profileService.updateProfile(created.id, { cutoffRank: 3 })).rejects.toThrow(
				'Cutoff rank must reference a subtitle requirement'
			);
		});
	});

	describe('toLegacyPreferences (v2 → v1 status adapter)', () => {
		it('should map a regular requirement and disable the cutoff when cutoffRank is null', () => {
			const legacy = toLegacyPreferences(makeProfile());

			expect(legacy.languages).toEqual([
				{ code: 'en', forced: false, hearingImpaired: false, excludeHi: false, isCutoff: false }
			]);
			expect(legacy.cutoffIndex).toBe(-1);
		});

		it('should map a forced requirement to forced: true', () => {
			const legacy = toLegacyPreferences(
				makeProfile({ subtitles: [{ tag: 'en', variant: 'forced', accessibility: 'any' }] })
			);

			expect(legacy.languages).toHaveLength(1);
			expect(legacy.languages[0].forced).toBe(true);
		});

		it('should expand a both requirement into a regular and a forced entry', () => {
			const legacy = toLegacyPreferences(
				makeProfile({
					subtitles: [{ tag: 'es', variant: 'both', accessibility: 'exclude-hi' }]
				})
			);

			expect(legacy.languages).toEqual([
				{ code: 'es', forced: false, hearingImpaired: false, excludeHi: true, isCutoff: false },
				{ code: 'es', forced: true, hearingImpaired: false, excludeHi: true, isCutoff: false }
			]);
		});

		it('should map accessibility policies to legacy HI flags', () => {
			const legacy = toLegacyPreferences(
				makeProfile({
					subtitles: [
						{ tag: 'en', variant: 'regular', accessibility: 'require-hi' },
						{ tag: 'es', variant: 'regular', accessibility: 'exclude-hi' },
						{ tag: 'fr', variant: 'regular', accessibility: 'prefer-hi' },
						{ tag: 'de', variant: 'regular', accessibility: 'any' }
					]
				})
			);

			expect(legacy.languages[0].hearingImpaired).toBe(true);
			expect(legacy.languages[0].excludeHi).toBe(false);
			expect(legacy.languages[1].excludeHi).toBe(true);
			expect(legacy.languages[1].hearingImpaired).toBe(false);
			expect(legacy.languages[2].hearingImpaired).toBe(false);
			expect(legacy.languages[2].excludeHi).toBe(false);
			expect(legacy.languages[3].hearingImpaired).toBe(false);
			expect(legacy.languages[3].excludeHi).toBe(false);
		});

		it('should normalize language tags to canonical codes', () => {
			const legacy = toLegacyPreferences(
				makeProfile({
					subtitles: [
						{ tag: 'ENG', variant: 'regular', accessibility: 'any' },
						{ tag: 'zh-Hans', variant: 'regular', accessibility: 'any' }
					]
				})
			);

			expect(legacy.languages[0].code).toBe('en');
			expect(legacy.languages[1].code).toBe('zh-Hans');
		});

		it('should mark the cutoff requirement and point cutoffIndex at its last expanded entry', () => {
			// 'both' at rank 0 expands to two entries; the cutoff must require both.
			const legacy = toLegacyPreferences(
				makeProfile({
					subtitles: [
						{ tag: 'en', variant: 'both', accessibility: 'any' },
						{ tag: 'es', variant: 'regular', accessibility: 'any' }
					],
					cutoffRank: 0
				})
			);

			expect(legacy.languages.map((l) => l.isCutoff)).toEqual([false, true, false]);
			expect(legacy.cutoffIndex).toBe(1);

			const regularCutoff = toLegacyPreferences(
				makeProfile({
					subtitles: [
						{ tag: 'en', variant: 'regular', accessibility: 'any' },
						{ tag: 'es', variant: 'regular', accessibility: 'any' }
					],
					cutoffRank: 1
				})
			);
			expect(regularCutoff.cutoffIndex).toBe(1);
			expect(regularCutoff.languages[1].isCutoff).toBe(true);
			expect(regularCutoff.languages[0].isCutoff).toBe(false);
		});
	});

	describe('Defensive JSON parsing', () => {
		it('should fall back to audio defaults on malformed JSON', () => {
			const audio = parseAudioPreference('{not json', 'profile-1');

			expect(audio).toEqual({ preferOriginal: true, languages: [] });
		});

		it('should fall back to audio defaults on shape-mismatched data', () => {
			expect(parseAudioPreference('null', 'profile-1')).toEqual({
				preferOriginal: true,
				languages: []
			});
			expect(parseAudioPreference({ preferOriginal: 'yes' }, 'profile-1')).toEqual({
				preferOriginal: true,
				languages: []
			});
			const partial = parseAudioPreference({ preferOriginal: false, languages: ['en', '', 42] }, 'p');
			expect(partial.preferOriginal).toBe(false);
			expect(partial.languages).toEqual(['en']);
		});

		it('should fall back to an empty requirement list on malformed subtitles JSON', () => {
			expect(parseSubtitleRequirements('[]}{', 'profile-1')).toEqual([]);
			expect(parseSubtitleRequirements({ tag: 'en' }, 'profile-1')).toEqual([]);
		});

		it('should coerce invalid requirement fields and drop entries without tags', () => {
			const requirements = parseSubtitleRequirements(
				[
					{ tag: 'en', variant: 'both', accessibility: 'require-hi' },
					{ tag: 'es', variant: 'bogus', accessibility: 'bogus' },
					{ variant: 'regular', accessibility: 'any' },
					{ tag: '   ', variant: 'regular', accessibility: 'any' },
					'garbage'
				],
				'profile-1'
			);

			expect(requirements).toEqual([
				{ tag: 'en', variant: 'both', accessibility: 'require-hi' },
				{ tag: 'es', variant: 'regular', accessibility: 'any' }
			]);
		});
	});

	describe('Profile CRUD and default authority', () => {
		it('should create and read a profile with canonical tags and defaults applied', async () => {
			const created = await profileService.createProfile(
				makeCreateBody({ minimumScore: 80, upgradesAllowed: false })
			);

			expect(created.id).toBeTruthy();
			expect(created.name).toBe('Created Profile');
			expect(created.audio).toEqual({ preferOriginal: true, languages: ['ja'] });
			expect(created.subtitles).toEqual([
				{ tag: 'en', variant: 'regular', accessibility: 'any' }
			]);
			expect(created.cutoffRank).toBeNull();
			expect(created.minimumScore).toBe(80);
			expect(created.upgradesAllowed).toBe(false);

			const fetched = await profileService.getProfile(created.id);
			expect(fetched?.id).toBe(created.id);
			expect((await profileService.getProfiles()).map((p) => p.id)).toContain(created.id);
		});

		it('should canonicalize tags and apply schema defaults on create', async () => {
			const created = await profileService.createProfile(
				makeCreateBody({
					subtitles: [{ tag: 'ENG', variant: 'regular', accessibility: 'any' }]
				})
			);

			expect(created.subtitles[0].tag).toBe('en');
		});

		it('should update only the provided fields', async () => {
			const created = await profileService.createProfile(makeCreateBody());

			const updated = await profileService.updateProfile(created.id, {
				name: 'Renamed',
				cutoffRank: 0
			});

			expect(updated.name).toBe('Renamed');
			expect(updated.cutoffRank).toBe(0);
			expect(updated.minimumScore).toBe(70);
			expect(updated.upgradesAllowed).toBe(true);
			expect(updated.subtitles).toHaveLength(1);
		});

		it('should delete a profile and null every reference', async () => {
			const created = await profileService.createProfile(makeCreateBody());
			await testDb.db
				.insert(movies)
				.values({ id: 'movie-1', tmdbId: 101, title: 'M1', path: '/m1', languageProfileId: created.id });
			await testDb.db
				.insert(libraries)
				.values({ id: 'lib-1', name: 'L', slug: 'lib-1', mediaType: 'movie', languageProfileId: created.id });
			await settingsService.update({ defaultProfileId: created.id });

			await profileService.deleteProfile(created.id);

			expect(await profileService.getProfile(created.id)).toBeUndefined();

			const movie = (await testDb.db.select().from(movies).where(eq(movies.id, 'movie-1')))[0];
			expect(movie.languageProfileId).toBeNull();
			const library = (await testDb.db.select().from(libraries).where(eq(libraries.id, 'lib-1')))[0];
			expect(library.languageProfileId).toBeNull();
			expect(await settingsService.getDefaultProfileId()).toBeNull();
		});

		it('should resolve the default profile through language settings', async () => {
			expect(await profileService.getDefaultProfile()).toBeUndefined();

			const created = await profileService.createProfile(makeCreateBody());
			await settingsService.update({ defaultProfileId: created.id });

			const defaultProfile = await profileService.getDefaultProfile();
			expect(defaultProfile?.id).toBe(created.id);
		});

		it('should fall back to the default profile for movies without an assignment', async () => {
			const created = await profileService.createProfile(makeCreateBody());
			await settingsService.update({ defaultProfileId: created.id });
			await testDb.db.insert(movies).values({ id: 'movie-2', tmdbId: 102, title: 'M2', path: '/m2' });

			const profile = await profileService.getProfileForMovie('movie-2');
			expect(profile?.id).toBe(created.id);

			await profileService.assignToMovie('movie-2', null);
			expect((await profileService.getProfileForMovie('movie-2'))?.id).toBe(created.id);
		});

		it('should assign and clear a library profile', async () => {
			const created = await profileService.createProfile(makeCreateBody());
			await testDb.db
				.insert(libraries)
				.values({ id: 'lib-2', name: 'L2', slug: 'lib-2', mediaType: 'movie' });

			await profileService.assignToLibrary('lib-2', created.id);
			let library = (await testDb.db.select().from(libraries).where(eq(libraries.id, 'lib-2')))[0];
			expect(library.languageProfileId).toBe(created.id);

			await profileService.assignToLibrary('lib-2', null);
			library = (await testDb.db.select().from(libraries).where(eq(libraries.id, 'lib-2')))[0];
			expect(library.languageProfileId).toBeNull();
		});
	});

	describe('calculateStatus (via subtitle status methods)', () => {
		it('should mark satisfied when no profile is assigned', async () => {
			const status = await profileService.getMovieSubtitleStatus('non-existent-movie-id');
			expect(status.satisfied).toBe(true);
			expect(status.missing).toHaveLength(0);
		});
	});

	describe('Status calculation logic', () => {
		it('should identify missing requirements based on the profile', async () => {
			const profile = makeProfile({
				subtitles: [
					{ tag: 'en', variant: 'regular', accessibility: 'any' },
					{ tag: 'es', variant: 'regular', accessibility: 'any' }
				]
			});

			const status = await calculate(profileService, profile, [], () => true);

			expect(status.satisfied).toBe(false);
			expect(status.missing.map((m) => m.tag)).toEqual(['en', 'es']);
			expect(status.missing[0]).toEqual({ tag: 'en', variant: 'regular', accessibility: 'any' });
		});

		it('should enforce require-hi (a non-HI subtitle does not satisfy it)', async () => {
			seedMovieFixture();
			const profile = makeProfile({
				subtitles: [{ tag: 'en', variant: 'regular', accessibility: 'require-hi' }]
			});

			const nonHi = await calculate(
				profileService,
				profile,
				[subtitleRecord({ id: 'non-hi', isHearingImpaired: false })],
				() => true
			);
			expect(nonHi.satisfied).toBe(false);
			expect(nonHi.missing[0].accessibility).toBe('require-hi');

			const hi = await calculate(
				profileService,
				profile,
				[subtitleRecord({ id: 'hi', isHearingImpaired: true })],
				() => true
			);
			expect(hi.satisfied).toBe(true);
		});

		it('should not count a stored row whose file does not exist on disk', async () => {
			seedMovieFixture();
			const profile = makeProfile();

			const gone = await calculate(
				profileService,
				profile,
				[subtitleRecord({ id: 'gone' })],
				() => false
			);
			expect(gone.satisfied).toBe(false);
			expect(gone.missing).toHaveLength(1);

			const present = await calculate(
				profileService,
				profile,
				[subtitleRecord({ id: 'present' })],
				() => true
			);
			expect(present.satisfied).toBe(true);
		});

		it('should stat each distinct resolved path at most once per call', async () => {
			seedMovieFixture();
			const profile = makeProfile();
			const exists = vi.fn().mockReturnValue(true);

			await calculate(
				profileService,
				profile,
				[subtitleRecord({ id: 'row-a' }), subtitleRecord({ id: 'row-b' })],
				exists
			);

			// Both rows share the same relative path -> one stat.
			expect(exists).toHaveBeenCalledTimes(1);
		});

		it('should respect forced variant matching', async () => {
			seedMovieFixture();
			const profile = makeProfile({
				subtitles: [{ tag: 'en', variant: 'forced', accessibility: 'any' }]
			});

			const regular = await calculate(
				profileService,
				profile,
				[subtitleRecord({ id: 'sub-regular', isForced: false })],
				() => true
			);
			expect(regular.satisfied).toBe(false);
			expect(regular.missing[0].variant).toBe('forced');

			const forced = await calculate(
				profileService,
				profile,
				[subtitleRecord({ id: 'sub-forced', isForced: true })],
				() => true
			);
			expect(forced.satisfied).toBe(true);
		});

		it('should respect exclude-hi when checking existing subtitles', async () => {
			seedMovieFixture();
			const profile = makeProfile({
				subtitles: [{ tag: 'en', variant: 'regular', accessibility: 'exclude-hi' }]
			});

			const status = await calculate(
				profileService,
				profile,
				[subtitleRecord({ isHearingImpaired: true })],
				() => true
			);

			expect(status.satisfied).toBe(false);
			expect(status.missing[0].accessibility).toBe('exclude-hi');
		});

		it('should emit exactly ONE missing entry for a both requirement', async () => {
			const profile = makeProfile({
				subtitles: [{ tag: 'en', variant: 'both', accessibility: 'any' }],
				cutoffRank: 0
			});

			const status = await calculate(profileService, profile, [], () => true);

			expect(status.missing).toEqual([{ tag: 'en', variant: 'both', accessibility: 'any' }]);
		});

		it('should let either variant satisfy a both requirement', async () => {
			seedMovieFixture();
			const profile = makeProfile({
				subtitles: [{ tag: 'en', variant: 'both', accessibility: 'any' }]
			});

			const status = await calculate(
				profileService,
				profile,
				[subtitleRecord({ id: 'regular', isForced: false })],
				() => true
			);

			expect(status.satisfied).toBe(true);
		});

		it('should use cutoffRank to determine satisfied', async () => {
			seedMovieFixture();
			const profile = makeProfile({
				subtitles: [
					{ tag: 'en', variant: 'regular', accessibility: 'any' },
					{ tag: 'es', variant: 'regular', accessibility: 'any' },
					{ tag: 'fr', variant: 'regular', accessibility: 'any' }
				],
				cutoffRank: 0
			});

			const status = await calculate(
				profileService,
				profile,
				[subtitleRecord({ language: 'en' })],
				() => true
			);

			expect(status.satisfied).toBe(true);
			expect(status.missing).toHaveLength(0);
		});

		it('should truncate missing after the cutoff rank', async () => {
			seedMovieFixture();
			const profile = makeProfile({
				subtitles: [
					{ tag: 'en', variant: 'regular', accessibility: 'any' },
					{ tag: 'es', variant: 'regular', accessibility: 'any' },
					{ tag: 'fr', variant: 'regular', accessibility: 'any' }
				],
				cutoffRank: 1
			});

			// en present, es missing. fr is beyond the cutoff and must not be reported.
			const status = await calculate(
				profileService,
				profile,
				[subtitleRecord({ language: 'en' })],
				() => true
			);

			expect(status.satisfied).toBe(false);
			expect(status.missing.map((m) => m.tag)).toEqual(['es']);
		});

		it('should keep searching when cutoffRank is null even if a language is satisfied', async () => {
			seedMovieFixture();
			const profile = makeProfile({
				subtitles: [
					{ tag: 'en', variant: 'regular', accessibility: 'any' },
					{ tag: 'es', variant: 'regular', accessibility: 'any' }
				],
				cutoffRank: null
			});

			const status = await calculate(
				profileService,
				profile,
				[subtitleRecord({ language: 'en' })],
				() => true
			);

			expect(status.satisfied).toBe(false);
			expect(status.missing.map((m) => m.tag)).toEqual(['es']);
		});

		it('should not treat embedded subtitles as satisfying profile requirements', async () => {
			const profile = makeProfile();

			const status = await calculate(
				profileService,
				profile,
				[
					subtitleRecord({
						id: 'embedded-en',
						relativePath: 'embedded:en',
						format: 'embedded'
					})
				],
				() => true
			);

			expect(status.satisfied).toBe(false);
			expect(status.missing).toHaveLength(1);
			expect(status.missing[0].tag).toBe('en');
		});

		it('should treat existing external files as satisfying and tag existing rows with requirementKey', async () => {
			seedMovieFixture();
			const profile = makeProfile();

			const status = await calculate(
				profileService,
				profile,
				[subtitleRecord({ id: 'external-en' })],
				() => true
			);

			expect(status.satisfied).toBe(true);
			expect(status.missing).toHaveLength(0);
			expect(status.existing).toHaveLength(1);
			expect(status.existing[0].subtitleId).toBe('external-en');
			expect(status.existing[0].requirementKey).toBe('en|regular|any');
		});
	});

	describe('SubtitleStatus interface validation', () => {
		it('should have correct structure for satisfied status', () => {
			const status: SubtitleStatus = {
				satisfied: true,
				missing: [],
				existing: []
			};

			expect(status.satisfied).toBe(true);
			expect(status.missing).toEqual([]);
			expect(status.existing).toEqual([]);
		});

		it('should have correct structure for unsatisfied status', () => {
			const status: SubtitleStatus = {
				satisfied: false,
				missing: [{ tag: 'en', variant: 'regular', accessibility: 'any' }],
				existing: []
			};

			expect(status.satisfied).toBe(false);
			expect(status.missing).toHaveLength(1);
			expect(status.missing[0].tag).toBe('en');
		});

		it('should track existing subtitles with all metadata', () => {
			const status: SubtitleStatus = {
				satisfied: true,
				missing: [],
				existing: [
					{
						language: 'en',
						subtitleId: 'sub-123',
						isForced: false,
						isHearingImpaired: true,
						matchScore: 95,
						requirementKey: 'en|regular|any'
					}
				]
			};

			expect(status.existing[0].language).toBe('en');
			expect(status.existing[0].subtitleId).toBe('sub-123');
			expect(status.existing[0].isHearingImpaired).toBe(true);
			expect(status.existing[0].matchScore).toBe(95);
			expect(status.existing[0].requirementKey).toBe('en|regular|any');
		});
	});

	describe('Profile structure validation', () => {
		it('should have correct v2 default values', () => {
			const profile = makeProfile();

			expect(profile.cutoffRank).toBeNull();
			expect(profile.upgradesAllowed).toBe(true);
			expect(profile.minimumScore).toBe(70);
			expect(profile.audio).toEqual({ preferOriginal: true, languages: [] });
			expect(profile.subtitles[0]).toEqual({ tag: 'en', variant: 'regular', accessibility: 'any' });
		});

		it('should support multiple requirements with different variants', () => {
			const profile = makeProfile({
				subtitles: [
					{ tag: 'en', variant: 'regular', accessibility: 'any' },
					{ tag: 'en', variant: 'forced', accessibility: 'any' },
					{ tag: 'es', variant: 'regular', accessibility: 'require-hi' },
					{ tag: 'fr', variant: 'both', accessibility: 'exclude-hi' }
				],
				cutoffRank: 0,
				audio: { preferOriginal: false, languages: ['ja', 'en'] }
			});

			expect(profile.subtitles[0].variant).toBe('regular');
			expect(profile.subtitles[1].variant).toBe('forced');
			expect(profile.subtitles[2].accessibility).toBe('require-hi');
			expect(profile.subtitles[3].variant).toBe('both');
			expect(profile.subtitles[3].accessibility).toBe('exclude-hi');
			expect(profile.cutoffRank).toBe(0);
			expect(profile.audio.preferOriginal).toBe(false);
			expect(profile.audio.languages).toEqual(['ja', 'en']);
		});
	});
});
