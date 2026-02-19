/**
 * QualityFilter Database-Dependent Tests
 *
 * Tests for methods that require database access:
 * - getDefaultScoringProfile() — verifies size limits are merged from profileSizeLimits
 * - getProfile() — verifies built-in profile size limit merge
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { initTestDb, closeTestDb, clearTestDb, getTestDb } from '../../../test/db-helper';
import { scoringProfiles, profileSizeLimits } from '$lib/server/db/schema';
import { COMPACT_PROFILE, BALANCED_PROFILE } from '../scoring';

// Initialize the test database FIRST before any mocks
initTestDb();

// Mock $lib/server/db to use the test database
vi.mock('$lib/server/db/index.js', async () => {
	const { getTestDb } = await import('../../../test/db-helper');
	return {
		get db() {
			return getTestDb().db;
		},
		get sqlite() {
			return getTestDb().sqlite;
		},
		initializeDatabase: vi.fn().mockResolvedValue(undefined)
	};
});

vi.mock('$lib/logging', () => ({
	createChildLogger: () => ({
		info: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		debug: vi.fn()
	}),
	logger: {
		info: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		debug: vi.fn()
	}
}));

// Import after mocks
const { QualityFilter } = await import('./QualityFilter');

describe('QualityFilter (database)', () => {
	let filter: InstanceType<typeof QualityFilter>;

	beforeAll(() => {
		initTestDb();
	});

	afterAll(() => {
		closeTestDb();
	});

	beforeEach(() => {
		clearTestDb();
		filter = new QualityFilter();
	});

	describe('getDefaultScoringProfile', () => {
		it('should merge episode size limits from profileSizeLimits for a built-in default profile', async () => {
			const { db } = getTestDb();

			// Seed the compact profile as a built-in profile in scoringProfiles (as the app does)
			// Note: built-in profiles have NULL size limits in this table
			db.insert(scoringProfiles)
				.values({
					id: 'compact',
					name: 'Compact',
					description: 'Compact profile',
					isDefault: true,
					formatScores: COMPACT_PROFILE.formatScores,
					resolutionOrder: COMPACT_PROFILE.resolutionOrder,
					upgradesAllowed: COMPACT_PROFILE.upgradesAllowed,
					minScore: COMPACT_PROFILE.minScore,
					upgradeUntilScore: COMPACT_PROFILE.upgradeUntilScore,
					minScoreIncrement: COMPACT_PROFILE.minScoreIncrement,
					movieMinSizeGb: null,
					movieMaxSizeGb: null,
					episodeMinSizeMb: null,
					episodeMaxSizeMb: null
				})
				.run();

			// Store user-configured size limits in profileSizeLimits
			db.insert(profileSizeLimits)
				.values({
					profileId: 'compact',
					movieMinSizeGb: 0.5,
					movieMaxSizeGb: 5.0,
					episodeMinSizeMb: 50,
					episodeMaxSizeMb: 450,
					isDefault: false
				})
				.run();

			const profile = await filter.getDefaultScoringProfile();

			// Size limits should be merged from profileSizeLimits
			expect(profile.episodeMaxSizeMb).toBe(450);
			expect(profile.episodeMinSizeMb).toBe(50);
			expect(profile.movieMinSizeGb).toBe(0.5);
			expect(profile.movieMaxSizeGb).toBe(5.0);
			expect(profile.name).toBe('Compact');
		});

		it('should return null size limits when profileSizeLimits has no entry for a built-in default', async () => {
			const { db } = getTestDb();

			// Seed compact as default, but with NO entry in profileSizeLimits
			db.insert(scoringProfiles)
				.values({
					id: 'compact',
					name: 'Compact',
					description: 'Compact profile',
					isDefault: true,
					formatScores: COMPACT_PROFILE.formatScores,
					resolutionOrder: COMPACT_PROFILE.resolutionOrder,
					upgradesAllowed: COMPACT_PROFILE.upgradesAllowed,
					minScore: COMPACT_PROFILE.minScore,
					upgradeUntilScore: COMPACT_PROFILE.upgradeUntilScore,
					minScoreIncrement: COMPACT_PROFILE.minScoreIncrement,
					movieMinSizeGb: null,
					movieMaxSizeGb: null,
					episodeMinSizeMb: null,
					episodeMaxSizeMb: null
				})
				.run();

			const profile = await filter.getDefaultScoringProfile();

			// No size limits configured — should be null/undefined
			expect(profile.episodeMaxSizeMb).toBeNull();
			expect(profile.episodeMinSizeMb).toBeNull();
			expect(profile.movieMinSizeGb).toBeNull();
			expect(profile.movieMaxSizeGb).toBeNull();
		});

		it('should return size limits directly from scoringProfiles for custom default profiles', async () => {
			const { db } = getTestDb();

			// Insert a custom profile (not a built-in ID) as default with size limits
			db.insert(scoringProfiles)
				.values({
					id: 'my-custom-profile',
					name: 'My Custom',
					description: 'Custom profile with size limits',
					isDefault: true,
					formatScores: BALANCED_PROFILE.formatScores,
					resolutionOrder: BALANCED_PROFILE.resolutionOrder,
					upgradesAllowed: true,
					minScore: 0,
					upgradeUntilScore: -1,
					minScoreIncrement: 0,
					movieMinSizeGb: 1.0,
					movieMaxSizeGb: 10.0,
					episodeMinSizeMb: 100,
					episodeMaxSizeMb: 800
				})
				.run();

			const profile = await filter.getDefaultScoringProfile();

			// Custom profiles store size limits directly — should come through
			expect(profile.movieMinSizeGb).toBe(1.0);
			expect(profile.movieMaxSizeGb).toBe(10.0);
			expect(profile.episodeMinSizeMb).toBe(100);
			expect(profile.episodeMaxSizeMb).toBe(800);
			expect(profile.name).toBe('My Custom');
		});
	});

	describe('getProfile', () => {
		it('should merge size limits from profileSizeLimits for built-in profiles', async () => {
			const { db } = getTestDb();

			// Seed the compact profile in scoringProfiles (no size limits)
			db.insert(scoringProfiles)
				.values({
					id: 'compact',
					name: 'Compact',
					description: 'Compact profile',
					isDefault: false,
					formatScores: COMPACT_PROFILE.formatScores,
					resolutionOrder: COMPACT_PROFILE.resolutionOrder,
					upgradesAllowed: COMPACT_PROFILE.upgradesAllowed,
					minScore: COMPACT_PROFILE.minScore,
					upgradeUntilScore: COMPACT_PROFILE.upgradeUntilScore,
					minScoreIncrement: COMPACT_PROFILE.minScoreIncrement,
					movieMinSizeGb: null,
					movieMaxSizeGb: null,
					episodeMinSizeMb: null,
					episodeMaxSizeMb: null
				})
				.run();

			// Store user-configured size limits in profileSizeLimits
			db.insert(profileSizeLimits)
				.values({
					profileId: 'compact',
					movieMinSizeGb: 0.5,
					movieMaxSizeGb: 5.0,
					episodeMinSizeMb: 50,
					episodeMaxSizeMb: 450,
					isDefault: false
				})
				.run();

			const profile = await filter.getProfile('compact');

			expect(profile).not.toBeNull();
			expect(profile!.episodeMaxSizeMb).toBe(450);
			expect(profile!.episodeMinSizeMb).toBe(50);
			expect(profile!.movieMinSizeGb).toBe(0.5);
			expect(profile!.movieMaxSizeGb).toBe(5.0);
		});
	});
});
