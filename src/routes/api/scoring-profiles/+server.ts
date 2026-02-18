import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { scoringProfiles, profileSizeLimits } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { DEFAULT_PROFILES, getProfile, isBuiltInProfile } from '$lib/server/scoring';
import { qualityFilter } from '$lib/server/quality';
import { logger } from '$lib/logging';

/**
 * Schema for creating scoring profiles (name required)
 */
const scoringProfileSchema = z.object({
	id: z.string().min(1).max(50).optional(),
	name: z.string().min(1).max(100),
	description: z.string().max(500).optional(),
	// Copy from existing profile (built-in or custom) - deep copies formatScores
	copyFromId: z.string().optional(),
	upgradesAllowed: z.boolean().optional(),
	minScore: z.number().int().optional(),
	upgradeUntilScore: z.number().int().optional(),
	minScoreIncrement: z.number().int().optional(),
	// Format scores for this profile (formatId -> score)
	formatScores: z.record(z.string(), z.number().int()).optional(),
	movieMinSizeGb: z.number().nullable().optional(),
	movieMaxSizeGb: z.number().nullable().optional(),
	episodeMinSizeMb: z.number().nullable().optional(),
	episodeMaxSizeMb: z.number().nullable().optional(),
	isDefault: z.boolean().optional()
});

/**
 * Schema for updating scoring profiles (all fields optional for partial updates)
 */
const scoringProfileUpdateSchema = scoringProfileSchema.partial();

// Built-in profile IDs - derived from DEFAULT_PROFILES for single source of truth
const BUILT_IN_IDS = DEFAULT_PROFILES.map((p) => p.id);

function toNullableNumber(value: unknown): number | null {
	if (value === null || value === undefined) return null;
	if (typeof value === 'number') return Number.isFinite(value) ? value : null;
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (!trimmed) return null;
		const parsed = Number(trimmed);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

/**
 * GET /api/scoring-profiles
 * Returns all scoring profiles (built-in + custom)
 *
 * Built-in profiles come from code (DEFAULT_PROFILES) with size limits from profileSizeLimits table.
 * Custom profiles come entirely from the scoringProfiles table.
 */
export const GET: RequestHandler = async () => {
	// Get custom profiles from database (excluding any built-in IDs)
	const dbProfiles = await db.select().from(scoringProfiles);
	const customProfiles = dbProfiles.filter((p) => !BUILT_IN_IDS.includes(p.id));

	// Get overrides for built-in profiles
	const overrides = await db.select().from(profileSizeLimits);
	const overridesMap = new Map(overrides.map((s) => [s.profileId, s]));

	// Check for default status in custom profiles
	const customDefaultId = customProfiles.find((p) => p.isDefault)?.id;

	// Check for default status in built-in profile overrides
	const builtInDefaultId = overrides.find((o) => o.isDefault)?.profileId;

	// Map custom profiles from database
	const mappedCustomProfiles = customProfiles.map((p) => ({
		id: p.id,
		name: p.name,
		description: p.description ?? '',
		tags: p.tags ?? [],
		icon: 'Settings',
		color: 'text-base-content',
		category: 'custom' as const,
		upgradesAllowed: p.upgradesAllowed ?? true,
		minScore: p.minScore ?? 0,
		upgradeUntilScore: p.upgradeUntilScore ?? -1,
		minScoreIncrement: p.minScoreIncrement ?? 0,
		formatScores: p.formatScores ?? {},
		movieMinSizeGb: toNullableNumber(p.movieMinSizeGb),
		movieMaxSizeGb: toNullableNumber(p.movieMaxSizeGb),
		episodeMinSizeMb: toNullableNumber(p.episodeMinSizeMb),
		episodeMaxSizeMb: toNullableNumber(p.episodeMaxSizeMb),
		isDefault: p.isDefault ?? false,
		isBuiltIn: false
	}));

	// Determine which profile is default (custom > built-in override > 'balanced' fallback)
	const dbDefaultId = customDefaultId ?? builtInDefaultId;

	// Build built-in profiles from code + overrides from DB
	const builtInProfiles = DEFAULT_PROFILES.map((p) => {
		const profileOverrides = overridesMap.get(p.id);

		return {
			...p,
			movieMinSizeGb: toNullableNumber(profileOverrides?.movieMinSizeGb),
			movieMaxSizeGb: toNullableNumber(profileOverrides?.movieMaxSizeGb),
			episodeMinSizeMb: toNullableNumber(profileOverrides?.episodeMinSizeMb),
			episodeMaxSizeMb: toNullableNumber(profileOverrides?.episodeMaxSizeMb),
			isBuiltIn: true,
			// Default to Balanced only if no DB default is set
			isDefault: dbDefaultId === p.id || (!dbDefaultId && p.id === 'balanced')
		};
	});

	// Combine: built-in first, then custom
	const allProfiles = [...builtInProfiles, ...mappedCustomProfiles];

	// Determine the actual default profile ID
	const defaultProfileId = dbDefaultId ?? 'balanced';

	return json({
		profiles: allProfiles,
		count: allProfiles.length,
		defaultProfileId
	});
};

/**
 * POST /api/scoring-profiles
 * Create a new custom scoring profile
 *
 * Supports:
 * - Creating from scratch (empty formatScores)
 * - Copying from built-in profile (copyFromId = 'quality', 'balanced', 'compact', 'streamer')
 * - Copying from another custom profile (copyFromId = custom profile ID)
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const validation = scoringProfileSchema.safeParse(body);

		if (!validation.success) {
			return json(
				{ error: 'Invalid request body', details: validation.error.issues },
				{ status: 400 }
			);
		}

		const data = validation.data;

		// Check if ID already exists
		if (data.id) {
			const existing = await db
				.select()
				.from(scoringProfiles)
				.where(eq(scoringProfiles.id, data.id));

			if (existing.length > 0) {
				return json({ error: `Profile with ID '${data.id}' already exists` }, { status: 409 });
			}

			// Also check if it's a built-in profile ID
			if (BUILT_IN_IDS.includes(data.id)) {
				return json({ error: `Cannot use reserved profile ID '${data.id}'` }, { status: 400 });
			}
		}

		// If setting as default, clear other defaults first
		if (data.isDefault) {
			await db.update(scoringProfiles).set({ isDefault: false });
		}

		// Determine formatScores to use
		let formatScores: Record<string, number> = data.formatScores ?? {};

		// If copyFromId is provided, copy formatScores from that profile
		if (data.copyFromId) {
			// Check if it's a built-in profile
			const builtInProfile = getProfile(data.copyFromId);
			if (builtInProfile) {
				formatScores = { ...builtInProfile.formatScores };
			} else {
				// Check if it's a custom profile in the database
				const sourceProfile = await db
					.select()
					.from(scoringProfiles)
					.where(eq(scoringProfiles.id, data.copyFromId));

				if (sourceProfile.length === 0) {
					return json({ error: `Source profile '${data.copyFromId}' not found` }, { status: 404 });
				}

				formatScores = { ...(sourceProfile[0].formatScores ?? {}) };
			}

			// Apply any explicit formatScores overrides from the request
			if (data.formatScores) {
				formatScores = { ...formatScores, ...data.formatScores };
			}
		}

		// Insert the new profile
		const newProfile = await db
			.insert(scoringProfiles)
			.values({
				id: data.id,
				name: data.name,
				description: data.description,
				upgradesAllowed: data.upgradesAllowed,
				minScore: data.minScore,
				upgradeUntilScore: data.upgradeUntilScore,
				minScoreIncrement: data.minScoreIncrement,
				formatScores,
				movieMinSizeGb: data.movieMinSizeGb,
				movieMaxSizeGb: data.movieMaxSizeGb,
				episodeMinSizeMb: data.episodeMinSizeMb,
				episodeMaxSizeMb: data.episodeMaxSizeMb,
				isDefault: data.isDefault
			})
			.returning();

		// Clear the profile cache so new profile is used
		qualityFilter.clearProfileCache();

		const created = newProfile[0];
		return json(
			{
				...created,
				movieMinSizeGb: toNullableNumber(created.movieMinSizeGb),
				movieMaxSizeGb: toNullableNumber(created.movieMaxSizeGb),
				episodeMinSizeMb: toNullableNumber(created.episodeMinSizeMb),
				episodeMaxSizeMb: toNullableNumber(created.episodeMaxSizeMb)
			},
			{ status: 201 }
		);
	} catch (error) {
		logger.error('Error creating scoring profile', error instanceof Error ? error : undefined);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

/**
 * PUT /api/scoring-profiles
 * Update an existing scoring profile
 *
 * For built-in profiles: only size limits can be changed, stored in profileSizeLimits table.
 * For custom profiles: full update via scoringProfiles table.
 */
export const PUT: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { id, ...updateData } = body;

		if (!id) {
			return json({ error: 'Profile ID is required' }, { status: 400 });
		}

		// Handle built-in profiles - store overrides in profileSizeLimits table
		if (isBuiltInProfile(id)) {
			const builtIn = getProfile(id);
			if (!builtIn) {
				return json({ error: 'Built-in profile not found' }, { status: 404 });
			}

			// If setting as default, clear other defaults first (in both tables)
			if (updateData.isDefault) {
				await db.update(scoringProfiles).set({ isDefault: false });
				await db.update(profileSizeLimits).set({ isDefault: false });
			}

			// Check if overrides already exist for this profile
			const existing = await db
				.select()
				.from(profileSizeLimits)
				.where(eq(profileSizeLimits.profileId, id));

			if (existing.length > 0) {
				// Update existing overrides
				await db
					.update(profileSizeLimits)
					.set({
						movieMinSizeGb:
							updateData.movieMinSizeGb !== undefined
								? toNullableNumber(updateData.movieMinSizeGb)
								: toNullableNumber(existing[0].movieMinSizeGb),
						movieMaxSizeGb:
							updateData.movieMaxSizeGb !== undefined
								? toNullableNumber(updateData.movieMaxSizeGb)
								: toNullableNumber(existing[0].movieMaxSizeGb),
						episodeMinSizeMb:
							updateData.episodeMinSizeMb !== undefined
								? toNullableNumber(updateData.episodeMinSizeMb)
								: toNullableNumber(existing[0].episodeMinSizeMb),
						episodeMaxSizeMb:
							updateData.episodeMaxSizeMb !== undefined
								? toNullableNumber(updateData.episodeMaxSizeMb)
								: toNullableNumber(existing[0].episodeMaxSizeMb),
						isDefault: updateData.isDefault ?? existing[0].isDefault,
						updatedAt: new Date().toISOString()
					})
					.where(eq(profileSizeLimits.profileId, id));
			} else {
				// Insert new overrides entry
				await db.insert(profileSizeLimits).values({
					profileId: id,
					movieMinSizeGb: toNullableNumber(updateData.movieMinSizeGb),
					movieMaxSizeGb: toNullableNumber(updateData.movieMaxSizeGb),
					episodeMinSizeMb: toNullableNumber(updateData.episodeMinSizeMb),
					episodeMaxSizeMb: toNullableNumber(updateData.episodeMaxSizeMb),
					isDefault: updateData.isDefault ?? false,
					updatedAt: new Date().toISOString()
				});
			}

			// Clear cache after update
			qualityFilter.clearProfileCache(id);

			// Return the merged profile
			const limits = await db
				.select()
				.from(profileSizeLimits)
				.where(eq(profileSizeLimits.profileId, id));

			return json({
				...builtIn,
				movieMinSizeGb: toNullableNumber(limits[0]?.movieMinSizeGb),
				movieMaxSizeGb: toNullableNumber(limits[0]?.movieMaxSizeGb),
				episodeMinSizeMb: toNullableNumber(limits[0]?.episodeMinSizeMb),
				episodeMaxSizeMb: toNullableNumber(limits[0]?.episodeMaxSizeMb),
				isBuiltIn: true,
				isDefault: limits[0]?.isDefault ?? false
			});
		}

		// Use partial schema for updates - all fields optional
		const validation = scoringProfileUpdateSchema.safeParse(updateData);
		if (!validation.success) {
			return json(
				{ error: 'Invalid request body', details: validation.error.issues },
				{ status: 400 }
			);
		}

		const data = validation.data;

		// Check if profile exists
		const existing = await db.select().from(scoringProfiles).where(eq(scoringProfiles.id, id));

		if (existing.length === 0) {
			return json({ error: 'Profile not found' }, { status: 404 });
		}

		// If setting as default, clear other defaults first
		if (data.isDefault) {
			await db.update(scoringProfiles).set({ isDefault: false });
		}

		// Build update object with only provided fields (avoid overwriting with undefined)
		const updateFields: Record<string, unknown> = {
			updatedAt: new Date().toISOString()
		};
		if (data.name !== undefined) updateFields.name = data.name;
		if (data.description !== undefined) updateFields.description = data.description;
		if (data.upgradesAllowed !== undefined) updateFields.upgradesAllowed = data.upgradesAllowed;
		if (data.minScore !== undefined) updateFields.minScore = data.minScore;
		if (data.upgradeUntilScore !== undefined)
			updateFields.upgradeUntilScore = data.upgradeUntilScore;
		if (data.minScoreIncrement !== undefined)
			updateFields.minScoreIncrement = data.minScoreIncrement;
		if (data.formatScores !== undefined) updateFields.formatScores = data.formatScores;
		if (data.movieMinSizeGb !== undefined) updateFields.movieMinSizeGb = data.movieMinSizeGb;
		if (data.movieMaxSizeGb !== undefined) updateFields.movieMaxSizeGb = data.movieMaxSizeGb;
		if (data.episodeMinSizeMb !== undefined) updateFields.episodeMinSizeMb = data.episodeMinSizeMb;
		if (data.episodeMaxSizeMb !== undefined) updateFields.episodeMaxSizeMb = data.episodeMaxSizeMb;
		if (data.isDefault !== undefined) updateFields.isDefault = data.isDefault;

		// Update the profile
		const updated = await db
			.update(scoringProfiles)
			.set(updateFields)
			.where(eq(scoringProfiles.id, id))
			.returning();

		// Clear cache after update
		qualityFilter.clearProfileCache(id);

		const updatedProfile = updated[0];
		return json({
			...updatedProfile,
			movieMinSizeGb: toNullableNumber(updatedProfile.movieMinSizeGb),
			movieMaxSizeGb: toNullableNumber(updatedProfile.movieMaxSizeGb),
			episodeMinSizeMb: toNullableNumber(updatedProfile.episodeMinSizeMb),
			episodeMaxSizeMb: toNullableNumber(updatedProfile.episodeMaxSizeMb)
		});
	} catch (error) {
		logger.error('Error updating scoring profile', error instanceof Error ? error : undefined);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

/**
 * DELETE /api/scoring-profiles
 * Delete a custom scoring profile
 */
export const DELETE: RequestHandler = async ({ request }) => {
	try {
		const { id } = await request.json();

		if (!id) {
			return json({ error: 'Profile ID is required' }, { status: 400 });
		}

		// Check if it's a built-in profile
		if (isBuiltInProfile(id)) {
			return json({ error: `Cannot delete built-in profile '${id}'` }, { status: 400 });
		}

		// Delete the profile
		const deleted = await db.delete(scoringProfiles).where(eq(scoringProfiles.id, id)).returning();

		if (deleted.length === 0) {
			return json({ error: 'Profile not found' }, { status: 404 });
		}

		// Clear cache after delete
		qualityFilter.clearProfileCache(id);

		return json({ success: true, deleted: deleted[0] });
	} catch (error) {
		logger.error('Error deleting scoring profile', error instanceof Error ? error : undefined);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
