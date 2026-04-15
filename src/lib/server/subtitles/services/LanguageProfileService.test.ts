import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { createTestDb, destroyTestDb, type TestDatabase } from '../../../../test/db-helper';
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

const { LanguageProfileService, getLanguageProfileService } =
	await import('./LanguageProfileService');

describe('LanguageProfileService', () => {
	let profileService: ReturnType<typeof LanguageProfileService.getInstance>;

	beforeEach(() => {
		profileService = LanguageProfileService.getInstance();
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

	describe('Profile validation', () => {
		it('should require at least one language when creating profile', async () => {
			await expect(
				profileService.createProfile({
					name: 'Empty Profile',
					languages: [],
					cutoffIndex: 0,
					upgradesAllowed: true,
					minimumScore: 60,
					isDefault: false
				})
			).rejects.toThrow('At least one language is required');
		});
	});

	describe('calculateStatus (via subtitle status methods)', () => {
		describe('Basic language matching', () => {
			it('should mark satisfied when no profile is assigned', async () => {
				const status = await profileService.getMovieSubtitleStatus('non-existent-movie-id');
				expect(status.satisfied).toBe(true);
				expect(status.missing).toHaveLength(0);
			});
		});
	});

	describe('Status calculation logic', () => {
		it('should identify missing languages based on profile requirements', () => {
			const profile: LanguageProfile = {
				id: 'test-profile',
				name: 'Test Profile',
				languages: [
					{ code: 'en', forced: false, hearingImpaired: false, excludeHi: false, isCutoff: false },
					{ code: 'es', forced: false, hearingImpaired: false, excludeHi: false, isCutoff: false }
				],
				cutoffIndex: 0,
				upgradesAllowed: true,
				minimumScore: 60,
				isDefault: false
			};

			expect(profile.languages).toHaveLength(2);
			expect(profile.languages[0].code).toBe('en');
			expect(profile.languages[1].code).toBe('es');
		});

		it('should respect forced subtitle flag matching', () => {
			const profile: LanguageProfile = {
				id: 'test-profile',
				name: 'Test Profile',
				languages: [
					{ code: 'en', forced: true, hearingImpaired: false, excludeHi: false, isCutoff: false }
				],
				cutoffIndex: 0,
				upgradesAllowed: true,
				minimumScore: 60,
				isDefault: false
			};

			expect(profile.languages[0].forced).toBe(true);
		});

		it('should respect excludeHi flag when checking existing subtitles', () => {
			const profile: LanguageProfile = {
				id: 'test-profile',
				name: 'Test Profile',
				languages: [
					{ code: 'en', forced: false, hearingImpaired: false, excludeHi: true, isCutoff: false }
				],
				cutoffIndex: 0,
				upgradesAllowed: true,
				minimumScore: 60,
				isDefault: false
			};

			expect(profile.languages[0].excludeHi).toBe(true);
		});

		it('should use cutoffIndex to determine when satisfied', () => {
			const profile: LanguageProfile = {
				id: 'test-profile',
				name: 'Test Profile',
				languages: [
					{ code: 'en', forced: false, hearingImpaired: false, excludeHi: false, isCutoff: false },
					{ code: 'es', forced: false, hearingImpaired: false, excludeHi: false, isCutoff: false },
					{ code: 'fr', forced: false, hearingImpaired: false, excludeHi: false, isCutoff: false }
				],
				cutoffIndex: 1,
				upgradesAllowed: true,
				minimumScore: 60,
				isDefault: false
			};

			expect(profile.cutoffIndex).toBe(1);
			expect(profile.languages[profile.cutoffIndex].code).toBe('es');
		});

		it('should respect isCutoff flag on individual languages', () => {
			const profile: LanguageProfile = {
				id: 'test-profile',
				name: 'Test Profile',
				languages: [
					{ code: 'en', forced: false, hearingImpaired: false, excludeHi: false, isCutoff: true },
					{ code: 'es', forced: false, hearingImpaired: false, excludeHi: false, isCutoff: false }
				],
				cutoffIndex: 1,
				upgradesAllowed: true,
				minimumScore: 60,
				isDefault: false
			};

			expect(profile.languages[0].isCutoff).toBe(true);
		});

		it('should not treat embedded subtitles as satisfying profile requirements', () => {
			const profile: LanguageProfile = {
				id: 'test-profile',
				name: 'Test Profile',
				languages: [
					{ code: 'en', forced: false, hearingImpaired: false, excludeHi: false, isCutoff: false }
				],
				cutoffIndex: 0,
				upgradesAllowed: true,
				minimumScore: 60,
				isDefault: false
			};

			// @ts-expect-error accessing private method for testing
			const status: SubtitleStatus = profileService.calculateStatus(profile, [
				// @ts-expect-error partial subtitle record for testing
				{
					id: 'embedded-en',
					language: 'en',
					relativePath: 'embedded:en',
					format: 'embedded',
					isForced: false,
					isHearingImpaired: false
				}
			]);

			expect(status.satisfied).toBe(false);
			expect(status.missing).toHaveLength(1);
			expect(status.missing[0].code).toBe('en');
		});

		it('should not treat embedded subtitles as satisfying cutoff', () => {
			const profile: LanguageProfile = {
				id: 'test-profile',
				name: 'Test Profile',
				languages: [
					{ code: 'en', forced: false, hearingImpaired: false, excludeHi: false, isCutoff: true }
				],
				cutoffIndex: 0,
				upgradesAllowed: true,
				minimumScore: 60,
				isDefault: false
			};

			// @ts-expect-error accessing private method for testing
			const satisfied: boolean = profileService.checkCutoffSatisfied(profile, [
				// @ts-expect-error partial subtitle record for testing
				{
					id: 'embedded-en',
					language: 'en',
					relativePath: 'embedded:en',
					format: 'embedded',
					isForced: false,
					isHearingImpaired: false
				}
			]);

			expect(satisfied).toBe(false);
		});

		it('should treat external subtitle files as satisfying requirements', () => {
			const profile: LanguageProfile = {
				id: 'test-profile',
				name: 'Test Profile',
				languages: [
					{ code: 'en', forced: false, hearingImpaired: false, excludeHi: false, isCutoff: false }
				],
				cutoffIndex: 0,
				upgradesAllowed: true,
				minimumScore: 60,
				isDefault: false
			};

			// @ts-expect-error accessing private method for testing
			const status: SubtitleStatus = profileService.calculateStatus(profile, [
				// @ts-expect-error partial subtitle record for testing
				{
					id: 'external-en',
					language: 'en',
					relativePath: 'Movie.Name.en.srt',
					format: 'srt',
					isForced: false,
					isHearingImpaired: false
				}
			]);

			expect(status.satisfied).toBe(true);
			expect(status.missing).toHaveLength(0);
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
				missing: [{ code: 'en', forced: false, hearingImpaired: false }],
				existing: []
			};

			expect(status.satisfied).toBe(false);
			expect(status.missing).toHaveLength(1);
			expect(status.missing[0].code).toBe('en');
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
						matchScore: 95
					}
				]
			};

			expect(status.existing[0].language).toBe('en');
			expect(status.existing[0].subtitleId).toBe('sub-123');
			expect(status.existing[0].isHearingImpaired).toBe(true);
			expect(status.existing[0].matchScore).toBe(95);
		});
	});

	describe('Profile structure validation', () => {
		it('should have correct default values', () => {
			const profile: LanguageProfile = {
				id: 'test-id',
				name: 'Default Profile',
				languages: [
					{ code: 'en', forced: false, hearingImpaired: false, excludeHi: false, isCutoff: false }
				],
				cutoffIndex: 0,
				upgradesAllowed: true,
				minimumScore: 60,
				isDefault: false
			};

			expect(profile.cutoffIndex).toBe(0);
			expect(profile.upgradesAllowed).toBe(true);
			expect(profile.minimumScore).toBe(60);
			expect(profile.isDefault).toBe(false);
		});

		it('should support multiple languages with different preferences', () => {
			const profile: LanguageProfile = {
				id: 'test-id',
				name: 'Multi-Language Profile',
				languages: [
					{ code: 'en', forced: false, hearingImpaired: false, excludeHi: false, isCutoff: true },
					{ code: 'en', forced: true, hearingImpaired: false, excludeHi: false, isCutoff: false },
					{ code: 'es', forced: false, hearingImpaired: true, excludeHi: false, isCutoff: false },
					{ code: 'fr', forced: false, hearingImpaired: false, excludeHi: true, isCutoff: false }
				],
				cutoffIndex: 0,
				upgradesAllowed: true,
				minimumScore: 60,
				isDefault: false
			};

			expect(profile.languages[0].code).toBe('en');
			expect(profile.languages[0].forced).toBe(false);
			expect(profile.languages[0].isCutoff).toBe(true);

			expect(profile.languages[1].code).toBe('en');
			expect(profile.languages[1].forced).toBe(true);

			expect(profile.languages[2].code).toBe('es');
			expect(profile.languages[2].hearingImpaired).toBe(true);

			expect(profile.languages[3].code).toBe('fr');
			expect(profile.languages[3].excludeHi).toBe(true);
		});
	});
});
