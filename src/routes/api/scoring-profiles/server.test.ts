/**
 * Scoring Profiles API Tests
 *
 * Tests for GET, POST, PUT, DELETE handlers at /api/scoring-profiles
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { initTestDb, closeTestDb, clearTestDb, getTestDb } from '../../../test/db-helper';
import { api, type ProfilesListResponse, type ErrorResponse } from '../../../test/api-helper';
import { scoringProfiles, profileSizeLimits } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

// Initialize the test database FIRST before any mocks
initTestDb();

// Must mock before importing the handlers
vi.mock('$lib/server/db', async () => {
	// Dynamic import to get the actual test db
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

vi.mock('$lib/server/quality', () => ({
	qualityFilter: {
		clearProfileCache: vi.fn()
	}
}));

vi.mock('$lib/logging', () => ({
	logger: {
		info: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		debug: vi.fn()
	}
}));

// Import handlers after mocks are set up
const { GET, POST, PUT, DELETE } = await import('./+server');

describe('Scoring Profiles API', () => {
	beforeAll(() => {
		initTestDb();
	});

	afterAll(() => {
		closeTestDb();
	});

	beforeEach(() => {
		clearTestDb();
	});

	// =========================================================================
	// GET Tests
	// =========================================================================
	describe('GET /api/scoring-profiles', () => {
		it('returns built-in profiles when database is empty', async () => {
			const { status, data } = await api.get<ProfilesListResponse>(GET);

			expect(status).toBe(200);
			expect(data.profiles.length).toBeGreaterThanOrEqual(4); // Quality, Balanced, Compact, Streamer
			expect(data.defaultProfileId).toBe('balanced');

			// Check built-in profiles are present
			const profileIds = data.profiles.map((p) => p.id);
			expect(profileIds).toContain('quality');
			expect(profileIds).toContain('balanced');
			expect(profileIds).toContain('compact');
			expect(profileIds).toContain('streamer');

			// All built-in profiles should have isBuiltIn = true
			const builtInProfiles = data.profiles.filter((p) => p.isBuiltIn);
			expect(builtInProfiles.length).toBeGreaterThanOrEqual(4);
		});

		it('returns balanced as default when no custom default is set', async () => {
			const { data } = await api.get<ProfilesListResponse>(GET);

			expect(data.defaultProfileId).toBe('balanced');

			const balanced = data.profiles.find((p) => p.id === 'balanced');
			expect(balanced?.isDefault).toBe(true);
		});

		it('returns custom profiles along with built-in profiles', async () => {
			const { db } = getTestDb();

			// Insert a custom profile
			await db.insert(scoringProfiles).values({
				id: 'my-custom',
				name: 'My Custom Profile',
				description: 'Test profile'
			});

			const { data } = await api.get<ProfilesListResponse>(GET);

			const customProfile = data.profiles.find((p) => p.id === 'my-custom');
			expect(customProfile).toBeDefined();
			expect(customProfile?.name).toBe('My Custom Profile');
			expect(customProfile?.isBuiltIn).toBe(false);
		});

		it('applies size limit overrides to built-in profiles', async () => {
			const { db } = getTestDb();

			// Add size limits for balanced profile
			await db.insert(profileSizeLimits).values({
				profileId: 'balanced',
				movieMinSizeGb: 1.5,
				movieMaxSizeGb: 50,
				episodeMinSizeMb: 200,
				episodeMaxSizeMb: 5000
			});

			const { data } = await api.get<ProfilesListResponse>(GET);

			const balanced = data.profiles.find((p) => p.id === 'balanced');
			expect(Number(balanced?.movieMinSizeGb)).toBe(1.5);
			expect(Number(balanced?.movieMaxSizeGb)).toBe(50);
			expect(Number(balanced?.episodeMinSizeMb)).toBe(200);
			expect(Number(balanced?.episodeMaxSizeMb)).toBe(5000);
		});

		it('returns custom profile as default when set', async () => {
			const { db } = getTestDb();

			await db.insert(scoringProfiles).values({
				id: 'my-default',
				name: 'My Default',
				isDefault: true
			});

			const { data } = await api.get<ProfilesListResponse>(GET);

			expect(data.defaultProfileId).toBe('my-default');

			const myDefault = data.profiles.find((p) => p.id === 'my-default');
			expect(myDefault?.isDefault).toBe(true);

			// Balanced should no longer be default
			const balanced = data.profiles.find((p) => p.id === 'balanced');
			expect(balanced?.isDefault).toBe(false);
		});
	});

	// =========================================================================
	// POST Tests (Create Profile)
	// =========================================================================
	describe('POST /api/scoring-profiles', () => {
		it('creates profile with required fields only', async () => {
			const { status, data } = await api.post(POST, {
				name: 'Test Profile'
			});

			expect(status).toBe(201);
			expect(data.name).toBe('Test Profile');
			expect(data.id).toBeDefined(); // Auto-generated
		});

		it('creates profile with custom ID', async () => {
			const { status, data } = await api.post(POST, {
				id: 'custom-id',
				name: 'Custom ID Profile'
			});

			expect(status).toBe(201);
			expect(data.id).toBe('custom-id');
		});

		it('creates profile with all optional fields', async () => {
			const { status, data } = await api.post(POST, {
				id: 'full-profile',
				name: 'Full Profile',
				description: 'A complete profile',
				upgradesAllowed: false,
				minScore: 100,
				upgradeUntilScore: 5000,
				minScoreIncrement: 50,
				formatScores: { 'format-1': 500, 'format-2': -200 },
				movieMinSizeGb: 2,
				movieMaxSizeGb: 100,
				episodeMinSizeMb: 300,
				episodeMaxSizeMb: 10000
			});

			expect(status).toBe(201);
			expect(data.upgradesAllowed).toBe(false);
			expect(data.minScore).toBe(100);
			expect(data.upgradeUntilScore).toBe(5000);
			expect(data.minScoreIncrement).toBe(50);
			expect(data.formatScores).toEqual({ 'format-1': 500, 'format-2': -200 });
			// SQLite REAL values may be returned as strings in JSON
			expect(Number(data.movieMinSizeGb)).toBe(2);
			expect(Number(data.movieMaxSizeGb)).toBe(100);
		});

		it('copies formatScores from built-in profile', async () => {
			const { status, data } = await api.post(POST, {
				name: 'Copy of Quality',
				copyFromId: 'quality'
			});

			expect(status).toBe(201);
			// Should have copied formatScores from quality profile
			expect(data.formatScores).toBeDefined();
			expect(Object.keys(data.formatScores).length).toBeGreaterThan(0);
		});

		it('copies formatScores from custom profile', async () => {
			// First create a custom profile with scores
			await api.post(POST, {
				id: 'source-profile',
				name: 'Source',
				formatScores: { 'my-format': 1000 }
			});

			// Now copy from it
			const { status, data } = await api.post(POST, {
				name: 'Copy of Source',
				copyFromId: 'source-profile'
			});

			expect(status).toBe(201);
			expect(data.formatScores['my-format']).toBe(1000);
		});

		it('merges explicit formatScores with copied scores', async () => {
			const { status, data } = await api.post(POST, {
				name: 'Merged Profile',
				copyFromId: 'quality',
				formatScores: { 'custom-format': 999 }
			});

			expect(status).toBe(201);
			// Should have the custom format score
			expect(data.formatScores['custom-format']).toBe(999);
			// Should also have scores from quality (verify at least one exists)
			expect(Object.keys(data.formatScores).length).toBeGreaterThan(1);
		});

		it('rejects reserved profile IDs', async () => {
			const { status, data } = await api.post<ErrorResponse>(POST, {
				id: 'quality',
				name: 'Fake Quality'
			});

			expect(status).toBe(400);
			expect(data.error).toContain('reserved');
		});

		it('rejects duplicate profile IDs', async () => {
			// Create first profile
			await api.post(POST, { id: 'duplicate-test', name: 'First' });

			// Try to create second with same ID
			const { status, data } = await api.post<ErrorResponse>(POST, {
				id: 'duplicate-test',
				name: 'Second'
			});

			expect(status).toBe(409);
			expect(data.error).toContain('already exists');
		});

		it('returns 404 for non-existent copyFromId', async () => {
			const { status, data } = await api.post<ErrorResponse>(POST, {
				name: 'Bad Copy',
				copyFromId: 'does-not-exist'
			});

			expect(status).toBe(404);
			expect(data.error).toContain('not found');
		});

		it('sets isDefault and clears other defaults', async () => {
			// Create first profile as default
			await api.post(POST, {
				id: 'first-default',
				name: 'First Default',
				isDefault: true
			});

			// Create second profile as default
			const { data: second } = await api.post(POST, {
				id: 'second-default',
				name: 'Second Default',
				isDefault: true
			});

			expect(second.isDefault).toBe(true);

			// Verify first is no longer default
			const { db } = getTestDb();
			const first = await db
				.select()
				.from(scoringProfiles)
				.where(eq(scoringProfiles.id, 'first-default'));
			expect(first[0].isDefault).toBe(false);
		});

		it('validates required name field', async () => {
			const { status, data } = await api.post<ErrorResponse>(POST, {
				description: 'Missing name'
			});

			expect(status).toBe(400);
			expect(data.error).toContain('Invalid');
		});
	});

	// =========================================================================
	// PUT Tests (Update Profile)
	// =========================================================================
	describe('PUT /api/scoring-profiles', () => {
		it('updates custom profile fields', async () => {
			// Create a profile
			const { data: created } = await api.post(POST, {
				id: 'update-test',
				name: 'Original Name'
			});

			// Update it
			const { status, data } = await api.put(PUT, {
				id: 'update-test',
				name: 'Updated Name',
				description: 'New description'
			});

			expect(status).toBe(200);
			expect(data.name).toBe('Updated Name');
			expect(data.description).toBe('New description');
		});

		it('partial update preserves existing fields', async () => {
			// Create profile with multiple fields
			await api.post(POST, {
				id: 'partial-test',
				name: 'Original',
				description: 'Original description',
				upgradesAllowed: false,
				minScore: 100
			});

			// Update only name
			const { data } = await api.put(PUT, {
				id: 'partial-test',
				name: 'Updated'
			});

			expect(data.name).toBe('Updated');
			expect(data.description).toBe('Original description');
			expect(data.upgradesAllowed).toBe(false);
			expect(data.minScore).toBe(100);
		});

		it('updates built-in profile size limits only', async () => {
			const { status, data } = await api.put(PUT, {
				id: 'balanced',
				movieMinSizeGb: 2,
				movieMaxSizeGb: 80
			});

			expect(status).toBe(200);
			expect(Number(data.movieMinSizeGb)).toBe(2);
			expect(Number(data.movieMaxSizeGb)).toBe(80);
			expect(data.isBuiltIn).toBe(true);
		});

		it('sets isDefault on built-in profile', async () => {
			// First set a custom profile as default
			await api.post(POST, {
				id: 'temp-default',
				name: 'Temp Default',
				isDefault: true
			});

			// Now set balanced as default
			const { data } = await api.put(PUT, {
				id: 'balanced',
				isDefault: true
			});

			expect(data.isDefault).toBe(true);

			// Verify custom profile is no longer default
			const { db } = getTestDb();
			const temp = await db
				.select()
				.from(scoringProfiles)
				.where(eq(scoringProfiles.id, 'temp-default'));
			expect(temp[0].isDefault).toBe(false);
		});

		it('returns 404 for non-existent custom profile', async () => {
			const { status, data } = await api.put<ErrorResponse>(PUT, {
				id: 'does-not-exist',
				name: 'New Name'
			});

			expect(status).toBe(404);
			expect(data.error).toContain('not found');
		});

		it('requires profile ID', async () => {
			const { status, data } = await api.put<ErrorResponse>(PUT, {
				name: 'No ID'
			});

			expect(status).toBe(400);
			expect(data.error).toContain('ID is required');
		});

		it('updates formatScores', async () => {
			await api.post(POST, {
				id: 'format-test',
				name: 'Format Test',
				formatScores: { old: 100 }
			});

			const { data } = await api.put(PUT, {
				id: 'format-test',
				formatScores: { new: 500 }
			});

			expect(data.formatScores).toEqual({ new: 500 });
		});
	});

	// =========================================================================
	// DELETE Tests
	// =========================================================================
	describe('DELETE /api/scoring-profiles', () => {
		it('deletes custom profile', async () => {
			await api.post(POST, {
				id: 'delete-me',
				name: 'Delete Me'
			});

			const { status, data } = await api.delete(DELETE, { id: 'delete-me' });

			expect(status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.deleted.id).toBe('delete-me');

			// Verify it's gone
			const { db } = getTestDb();
			const remaining = await db
				.select()
				.from(scoringProfiles)
				.where(eq(scoringProfiles.id, 'delete-me'));
			expect(remaining.length).toBe(0);
		});

		it('rejects deletion of built-in profile', async () => {
			const { status, data } = await api.delete<ErrorResponse>(DELETE, { id: 'quality' });

			expect(status).toBe(400);
			expect(data.error).toContain('Cannot delete built-in');
		});

		it('returns 404 for non-existent profile', async () => {
			const { status, data } = await api.delete<ErrorResponse>(DELETE, { id: 'ghost' });

			expect(status).toBe(404);
			expect(data.error).toContain('not found');
		});

		it('requires profile ID', async () => {
			const { status, data } = await api.delete<ErrorResponse>(DELETE, {});

			expect(status).toBe(400);
			expect(data.error).toContain('ID is required');
		});
	});
});
