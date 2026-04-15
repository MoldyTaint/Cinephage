/**
 * Quality Filter
 *
 * Filters and scores releases based on scoring profiles.
 * All filtering and scoring is handled by the ScoringProfile.
 */

import type { ParsedRelease, Resolution } from '../indexers/parser/types.js';
import { RESOLUTION_ORDER } from '../indexers/parser/types.js';
import { db } from '../db/index.js';
import { createChildLogger } from '$lib/logging';

const logger = createChildLogger({ module: 'QualityFilter' });
import { scoringProfiles, profileSizeLimits, builtInProfileScoreOverrides } from '../db/schema.js';
import { eq } from 'drizzle-orm';

// Import scoring engine
import {
	scoreRelease,
	rankReleases,
	isUpgrade,
	getProfile,
	DEFAULT_PROFILES,
	BALANCED_PROFILE,
	type ScoringProfile,
	type ScoringResult,
	type ReleaseAttributes,
	type SizeValidationContext
} from '../scoring/index.js';

/**
 * Enhanced quality result with scoring engine result
 */
export interface EnhancedQualityResult {
	/** Whether the release is accepted */
	accepted: boolean;
	/** Reason for rejection if not accepted */
	rejectionReason?: string;
	/** Quality score from scoring engine */
	score: number;
	/** Full scoring result from the scoring engine */
	scoringResult: ScoringResult;
	/** Matched format names for display */
	matchedFormats: string[];
}

/**
 * QualityFilter - Filter and score releases based on quality preferences
 */
export class QualityFilter {
	private profilesCache: Map<string, ScoringProfile> = new Map();
	private defaultProfile: ScoringProfile | null = null;

	private readonly BUILT_IN_IDS = new Set(['quality', 'balanced', 'compact', 'streamer']);

	private coerceNullableNumber(value: unknown): number | null {
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
	 * Clear all caches - call this when profiles are updated
	 */
	clearCache(): void {
		this.profilesCache.clear();
		this.defaultProfile = null;
	}

	/**
	 * Clear profile cache specifically
	 */
	clearProfileCache(profileId?: string): void {
		if (profileId) {
			const hadCached = this.profilesCache.has(profileId);
			this.profilesCache.delete(profileId);
			logger.debug(
				{
					profileId,
					wasCached: hadCached
				},
				'[QualityFilter] Cache cleared for profile'
			);
		} else {
			const count = this.profilesCache.size;
			this.profilesCache.clear();
			logger.debug({ count }, '[QualityFilter] All profile cache cleared');
		}
		this.defaultProfile = null;
	}

	/**
	 * Resolve a built-in profile by merging:
	 * - Shipped code defaults
	 * - Score overrides from built_in_profile_score_overrides
	 * - Size/default overrides from profile_size_limits
	 */
	private async resolveBuiltInProfile(id: string): Promise<ScoringProfile | null> {
		const base = getProfile(id);
		if (!base) return null;

		const [scoreOverride, sizeLimits] = await Promise.all([
			db
				.select()
				.from(builtInProfileScoreOverrides)
				.where(eq(builtInProfileScoreOverrides.profileId, id))
				.get(),
			db.select().from(profileSizeLimits).where(eq(profileSizeLimits.profileId, id)).get()
		]);

		const formatScores = scoreOverride
			? { ...base.formatScores, ...scoreOverride.formatScores }
			: base.formatScores;

		return {
			...base,
			formatScores,
			movieMinSizeGb: sizeLimits ? this.coerceNullableNumber(sizeLimits.movieMinSizeGb) : null,
			movieMaxSizeGb: sizeLimits ? this.coerceNullableNumber(sizeLimits.movieMaxSizeGb) : null,
			episodeMinSizeMb: sizeLimits ? this.coerceNullableNumber(sizeLimits.episodeMinSizeMb) : null,
			episodeMaxSizeMb: sizeLimits ? this.coerceNullableNumber(sizeLimits.episodeMaxSizeMb) : null,
			isDefault: sizeLimits?.isDefault ?? false
		};
	}

	/**
	 * Get a scoring profile by ID.
	 * - Built-in IDs: resolved from code + override tables at runtime.
	 * - Custom IDs: loaded from database.
	 */
	async getProfile(id: string): Promise<ScoringProfile | null> {
		if (this.profilesCache.has(id)) {
			const cached = this.profilesCache.get(id)!;
			logger.debug(
				{ id, cachedName: cached.name, formatScoresCount: Object.keys(cached.formatScores).length },
				'[QualityFilter.getProfile] Cache hit'
			);
			return cached;
		}

		logger.debug({ id }, '[QualityFilter.getProfile] Loading profile');

		// Built-in IDs: resolve from code + override tables
		if (this.BUILT_IN_IDS.has(id)) {
			const profile = await this.resolveBuiltInProfile(id);
			if (profile) {
				this.profilesCache.set(id, profile);
			}
			return profile;
		}

		// Custom profiles: load from database
		const result = await db.select().from(scoringProfiles).where(eq(scoringProfiles.id, id)).get();
		if (result) {
			const profile = this.mapDbToProfile(result);
			this.profilesCache.set(id, profile);
			return profile;
		}

		return null;
	}

	/**
	 * Get the default scoring profile.
	 * Priority: default custom profile in DB > default built-in in profile_size_limits > built-in balanced.
	 */
	async getDefaultScoringProfile(): Promise<ScoringProfile> {
		if (this.defaultProfile) {
			return this.defaultProfile;
		}

		// Check for a default custom profile in DB
		const defaultCustom = await db
			.select()
			.from(scoringProfiles)
			.where(eq(scoringProfiles.isDefault, true))
			.get();

		if (defaultCustom) {
			if (!this.BUILT_IN_IDS.has(defaultCustom.id)) {
				this.defaultProfile = this.mapDbToProfile(defaultCustom);
				return this.defaultProfile;
			}
			// Built-in profile marked as default — resolve with overrides
			const profile = await this.resolveBuiltInProfile(defaultCustom.id);
			if (profile) {
				this.defaultProfile = profile;
				return this.defaultProfile;
			}
		}

		// Check if a built-in is set as default in profile_size_limits
		const sizeLimitDefault = await db
			.select()
			.from(profileSizeLimits)
			.where(eq(profileSizeLimits.isDefault, true))
			.get();

		if (sizeLimitDefault) {
			const profile = await this.resolveBuiltInProfile(sizeLimitDefault.profileId);
			if (profile) {
				this.defaultProfile = profile;
				return this.defaultProfile;
			}
		}

		// Fall back to built-in balanced
		this.defaultProfile = (await this.resolveBuiltInProfile('balanced')) ?? BALANCED_PROFILE;
		return this.defaultProfile;
	}

	/**
	 * Get all scoring profiles (built-in + custom).
	 * Built-ins are resolved from code + override tables.
	 * Custom profiles are loaded from database.
	 */
	async getAllProfiles(): Promise<ScoringProfile[]> {
		const [dbRows, builtInProfiles] = await Promise.all([
			db.select().from(scoringProfiles).all(),
			Promise.all(Array.from(this.BUILT_IN_IDS).map((id) => this.resolveBuiltInProfile(id)))
		]);

		const customProfiles = dbRows
			.filter((r) => !this.BUILT_IN_IDS.has(r.id))
			.map((r) => this.mapDbToProfile(r));

		const validBuiltIns = builtInProfiles.filter((p): p is ScoringProfile => p !== null);

		return [...validBuiltIns, ...customProfiles];
	}

	/**
	 * Seed and sync default scoring profiles to database.
	 * Only seeds CUSTOM profiles — built-in profiles (quality, balanced, compact, streamer)
	 * are resolved from code + override tables at runtime, not stored here.
	 *
	 * - INSERT: If custom profile doesn't exist in DB, create it
	 * - UPDATE: If custom profile exists in DB, sync ALL fields except isDefault
	 */
	async seedDefaultScoringProfiles(): Promise<void> {
		const existingIds = (
			await db.select({ id: scoringProfiles.id }).from(scoringProfiles).all()
		).map((r) => r.id);
		const existingSet = new Set(existingIds);

		const BUILT_IN_IDS = new Set(['quality', 'balanced', 'compact', 'streamer']);

		let seeded = 0;
		let updated = 0;

		for (const profile of DEFAULT_PROFILES) {
			// Skip built-in profiles — they are resolved from code + override tables at runtime
			if (BUILT_IN_IDS.has(profile.id)) {
				continue;
			}

			const values = {
				name: profile.name,
				description: profile.description ?? null,
				tags: profile.tags ?? [],
				upgradesAllowed: profile.upgradesAllowed ?? true,
				minScore: profile.minScore ?? 0,
				upgradeUntilScore: profile.upgradeUntilScore ?? -1,
				minScoreIncrement: profile.minScoreIncrement ?? 0,
				resolutionOrder: profile.resolutionOrder ?? null,
				formatScores: profile.formatScores ?? null,
				allowedProtocols: profile.allowedProtocols ?? null,
				updatedAt: new Date().toISOString()
			};

			if (existingSet.has(profile.id)) {
				await db.update(scoringProfiles).set(values).where(eq(scoringProfiles.id, profile.id));
				updated++;
			} else {
				await db.insert(scoringProfiles).values({
					id: profile.id,
					...values,
					isDefault: profile.id === 'balanced'
				});
				seeded++;
			}
		}

		if (seeded > 0) {
			logger.info(`Seeded ${seeded} default scoring profile(s) to database`);
		}
		if (updated > 0) {
			logger.info(`Synced ${updated} default scoring profile(s) with latest definitions`);
		}
	}

	/**
	 * Check if a parsed release meets the minimum requirements from the profile
	 */
	private meetsMinimum(
		parsed: ParsedRelease,
		profile: ScoringProfile
	): { ok: boolean; reason?: string } {
		// Check minimum resolution
		if (profile.minResolution) {
			const minOrder = RESOLUTION_ORDER[profile.minResolution];
			const releaseOrder = RESOLUTION_ORDER[parsed.resolution];
			if (releaseOrder < minOrder) {
				return {
					ok: false,
					reason: `Resolution ${parsed.resolution} below minimum ${profile.minResolution}`
				};
			}
		}

		// Check maximum resolution
		if (profile.maxResolution) {
			const maxOrder = RESOLUTION_ORDER[profile.maxResolution];
			const releaseOrder = RESOLUTION_ORDER[parsed.resolution];
			if (releaseOrder > maxOrder) {
				return {
					ok: false,
					reason: `Resolution ${parsed.resolution} above maximum ${profile.maxResolution}`
				};
			}
		}

		// Check allowed sources
		if (profile.allowedSources && profile.allowedSources.length > 0) {
			if (!profile.allowedSources.includes(parsed.source)) {
				return {
					ok: false,
					reason: `Source ${parsed.source} not in allowed list`
				};
			}
		}

		// Check excluded sources
		if (profile.excludedSources && profile.excludedSources.length > 0) {
			if (profile.excludedSources.includes(parsed.source)) {
				return {
					ok: false,
					reason: `Source ${parsed.source} is excluded`
				};
			}
		}

		return { ok: true };
	}

	/**
	 * Calculate an enhanced quality score using the scoring engine
	 * Combines profile filtering with full format-based scoring
	 * @param fileSizeBytes - Optional file size in bytes for size filtering
	 * @param sizeContext - Optional context for media-specific size validation
	 */
	calculateEnhancedScore(
		parsed: ParsedRelease,
		profile: ScoringProfile,
		fileSizeBytes?: number,
		sizeContext?: SizeValidationContext,
		indexerName?: string
	): EnhancedQualityResult {
		// First, check profile requirements (pass/fail filter)
		const minCheck = this.meetsMinimum(parsed, profile);

		// Build release attributes for scoring engine
		const attributes: ReleaseAttributes = {
			title: parsed.originalTitle,
			cleanTitle: parsed.cleanTitle,
			year: parsed.year,
			resolution: parsed.resolution,
			source: parsed.source,
			codec: parsed.codec,
			hdr: parsed.hdr,
			audioCodec: parsed.audioCodec,
			audioChannels: parsed.audioChannels,
			hasAtmos: parsed.hasAtmos,
			releaseGroup: parsed.releaseGroup,
			streamingService: parsed.streamingService,
			edition: parsed.edition,
			languages: parsed.languages,
			indexerName, // Pass indexer name for indexer-based matching
			isRemux: parsed.isRemux,
			isRepack: parsed.isRepack,
			isProper: parsed.isProper,
			is3d: parsed.is3d,
			isSeasonPack: parsed.episode?.isSeasonPack,
			isCompleteSeries: parsed.episode?.isCompleteSeries
		};

		// Run the scoring engine with file size and media context for size filtering
		const scoringResult = scoreRelease(
			parsed.originalTitle,
			profile,
			attributes,
			fileSizeBytes,
			sizeContext
		);

		// Check for scoring engine bans, size rejections, and minimum score
		const accepted =
			minCheck.ok &&
			!scoringResult.isBanned &&
			!scoringResult.sizeRejected &&
			scoringResult.meetsMinimum;
		let rejectionReason = minCheck.reason;

		if (!rejectionReason && scoringResult.isBanned) {
			rejectionReason = `Banned: ${scoringResult.bannedReasons.join(', ')}`;
		}

		if (!rejectionReason && scoringResult.sizeRejected) {
			rejectionReason = scoringResult.sizeRejectionReason;
		}

		if (!rejectionReason && !scoringResult.meetsMinimum) {
			rejectionReason = `Score ${scoringResult.totalScore} below minimum ${profile.minScore ?? 0}`;
		}

		// Use raw score directly - no normalization needed with new additive scoring
		const qualityScore = scoringResult.totalScore;

		return {
			accepted,
			rejectionReason,
			score: qualityScore,
			scoringResult,
			matchedFormats: scoringResult.matchedFormats.map((f) => f.format.name)
		};
	}

	/**
	 * Rank multiple releases using the scoring engine
	 */
	rankReleases(
		releases: Array<{ parsed: ParsedRelease; name: string }>,
		profile: ScoringProfile
	): Array<{
		name: string;
		parsed: ParsedRelease;
		result: ScoringResult;
		rank: number;
	}> {
		const withAttrs = releases.map((r) => ({
			name: r.name,
			parsed: r.parsed,
			attributes: this.parsedToAttributes(r.parsed)
		}));

		const ranked = rankReleases(
			withAttrs.map((r) => ({ name: r.name, attributes: r.attributes })),
			profile
		);

		return ranked.map((r, i) => ({
			name: r.releaseName,
			parsed: withAttrs[i].parsed,
			result: r,
			rank: r.rank
		}));
	}

	/**
	 * Check if a candidate release is an upgrade over an existing one
	 */
	checkUpgrade(
		existing: ParsedRelease,
		candidate: ParsedRelease,
		profile: ScoringProfile,
		options: { minimumImprovement?: number } = {}
	): {
		isUpgrade: boolean;
		improvement: number;
		existing: ScoringResult;
		candidate: ScoringResult;
	} {
		const existingAttrs = this.parsedToAttributes(existing);
		const candidateAttrs = this.parsedToAttributes(candidate);

		return isUpgrade(existing.originalTitle, candidate.originalTitle, profile, {
			minimumImprovement: options.minimumImprovement ?? profile.minScoreIncrement,
			existingAttrs,
			candidateAttrs
		});
	}

	/**
	 * Convert ParsedRelease to ReleaseAttributes
	 */
	private parsedToAttributes(parsed: ParsedRelease): ReleaseAttributes {
		return {
			title: parsed.originalTitle,
			cleanTitle: parsed.cleanTitle,
			year: parsed.year,
			resolution: parsed.resolution,
			source: parsed.source,
			codec: parsed.codec,
			hdr: parsed.hdr,
			audioCodec: parsed.audioCodec,
			audioChannels: parsed.audioChannels,
			hasAtmos: parsed.hasAtmos,
			releaseGroup: parsed.releaseGroup,
			streamingService: parsed.streamingService,
			edition: parsed.edition,
			languages: parsed.languages,
			isRemux: parsed.isRemux,
			isRepack: parsed.isRepack,
			isProper: parsed.isProper,
			is3d: parsed.is3d,
			isSeasonPack: parsed.episode?.isSeasonPack,
			isCompleteSeries: parsed.episode?.isCompleteSeries
		};
	}

	/**
	 * Map database row to ScoringProfile
	 *
	 * Profiles are standalone - no runtime inheritance. If a DB profile doesn't
	 * have formatScores, check if it's a built-in profile ID and use those scores.
	 */
	private mapDbToProfile(row: typeof scoringProfiles.$inferSelect): ScoringProfile {
		// If this ID matches a built-in profile and DB has no formatScores, use built-in scores
		const builtInProfile = getProfile(row.id);

		return {
			id: row.id,
			name: row.name,
			description: row.description ?? '',
			tags: row.tags ?? [],
			upgradesAllowed: row.upgradesAllowed ?? true,
			minScore: row.minScore ?? 0,
			upgradeUntilScore: row.upgradeUntilScore ?? -1,
			minScoreIncrement: row.minScoreIncrement ?? 0,
			movieMinSizeGb: this.coerceNullableNumber(row.movieMinSizeGb),
			movieMaxSizeGb: this.coerceNullableNumber(row.movieMaxSizeGb),
			episodeMinSizeMb: this.coerceNullableNumber(row.episodeMinSizeMb),
			episodeMaxSizeMb: this.coerceNullableNumber(row.episodeMaxSizeMb),
			resolutionOrder: (row.resolutionOrder as Resolution[]) ?? [
				'2160p',
				'1080p',
				'720p',
				'480p',
				'unknown'
			],
			// Filtering constraints - fall back to built-in profile
			minResolution: builtInProfile?.minResolution ?? null,
			maxResolution: builtInProfile?.maxResolution ?? null,
			allowedSources: builtInProfile?.allowedSources ?? null,
			excludedSources: builtInProfile?.excludedSources ?? null,
			// allowedProtocols: use DB value, fall back to built-in profile, then default
			allowedProtocols: row.allowedProtocols ??
				builtInProfile?.allowedProtocols ?? ['torrent', 'usenet'],
			// formatScores: use DB value if present, otherwise use built-in scores, otherwise empty
			formatScores: row.formatScores ?? builtInProfile?.formatScores ?? {}
		};
	}
}

/**
 * Singleton instance
 */
export const qualityFilter = new QualityFilter();
