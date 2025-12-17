import type { PageServerLoad } from './$types';
import type { Resolution } from '$lib/server/scoring/types';
import { db } from '$lib/server/db';
import { scoringProfiles, customFormats, profileSizeLimits } from '$lib/server/db/schema';
import { DEFAULT_PROFILES, DEFAULT_RESOLUTION_ORDER, ALL_FORMATS } from '$lib/server/scoring';

// Built-in profile IDs - derived from DEFAULT_PROFILES for single source of truth
const BUILT_IN_PROFILE_IDS = DEFAULT_PROFILES.map((p) => p.id);

// Built-in format IDs
const BUILT_IN_FORMAT_IDS = new Set(ALL_FORMATS.map((f) => f.id));

export const load: PageServerLoad = async ({ url }) => {
	// Get active tab from URL params (default to profiles)
	const activeTab = url.searchParams.get('tab') || 'profiles';

	// ===================
	// Load Profiles
	// ===================

	// Get custom profiles from database (excluding built-in IDs)
	const dbProfiles = await db.select().from(scoringProfiles);
	const customProfiles = dbProfiles.filter((p) => !BUILT_IN_PROFILE_IDS.includes(p.id));

	// Get overrides for built-in profiles
	const overrides = await db.select().from(profileSizeLimits);
	const overridesMap = new Map(overrides.map((o) => [o.profileId, o]));

	// Check for default status in custom profiles
	const customDefaultId = customProfiles.find((p) => p.isDefault)?.id;

	// Check for default status in built-in profile overrides
	const builtInDefaultId = overrides.find((o) => o.isDefault)?.profileId;

	// Determine which profile is default
	const dbDefaultId = customDefaultId ?? builtInDefaultId;

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
		resolutionOrder: (p.resolutionOrder as Resolution[] | null) ?? DEFAULT_RESOLUTION_ORDER,
		formatScores: p.formatScores ?? {},
		movieMinSizeGb: p.movieMinSizeGb ?? null,
		movieMaxSizeGb: p.movieMaxSizeGb ?? null,
		episodeMinSizeMb: p.episodeMinSizeMb ?? null,
		episodeMaxSizeMb: p.episodeMaxSizeMb ?? null,
		isDefault: p.isDefault ?? false,
		isBuiltIn: false
	}));

	// Build built-in profiles from code + overrides from DB
	const builtInProfiles = DEFAULT_PROFILES.map((p) => {
		const profileOverrides = overridesMap.get(p.id);

		return {
			...p,
			movieMinSizeGb: profileOverrides?.movieMinSizeGb ?? null,
			movieMaxSizeGb: profileOverrides?.movieMaxSizeGb ?? null,
			episodeMinSizeMb: profileOverrides?.episodeMinSizeMb ?? null,
			episodeMaxSizeMb: profileOverrides?.episodeMaxSizeMb ?? null,
			isBuiltIn: true,
			// Default to Balanced only if no DB default is set
			isDefault: dbDefaultId === p.id || (!dbDefaultId && p.id === 'balanced')
		};
	});

	// Combine: built-in first, then custom
	const allProfiles = [...builtInProfiles, ...mappedCustomProfiles];

	// Determine the actual default profile ID
	const defaultProfileId = dbDefaultId ?? 'balanced';

	// ===================
	// Load Formats
	// ===================

	// Get custom formats from database
	const dbFormats = await db.select().from(customFormats);

	// Map database formats
	const customFormatsList = dbFormats.map((f) => ({
		id: f.id,
		name: f.name,
		description: f.description ?? undefined,
		category: f.category,
		tags: f.tags ?? [],
		conditions: f.conditions ?? [],
		enabled: f.enabled ?? true,
		isBuiltIn: false,
		createdAt: f.createdAt,
		updatedAt: f.updatedAt
	}));

	// Map built-in formats with explicit typing
	const builtInFormats = ALL_FORMATS.map((f) => ({
		id: f.id,
		name: f.name,
		description: f.description as string | undefined,
		category: f.category,
		tags: f.tags,
		conditions: f.conditions,
		enabled: true as const,
		isBuiltIn: true as const
	}));

	// Combine formats
	const allFormats = [...builtInFormats, ...customFormatsList];

	return {
		activeTab,
		// Profiles data
		profiles: allProfiles,
		defaultProfileId,
		// Formats data
		formats: allFormats,
		formatCounts: {
			total: allFormats.length,
			builtIn: builtInFormats.length,
			custom: customFormatsList.length
		}
	};
};
