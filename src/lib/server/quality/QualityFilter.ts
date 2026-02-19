/**
 * Quality Filter
 *
 * Filters and scores releases based on scoring profiles.
 *
 * The scoring engine provides format-based scoring with resolution order,
 * release group tiers, audio preferences, and more.
 *
 * Legacy QualityPreset support is maintained internally for basic filtering
 * (resolution min/max, source filtering) using hardcoded defaults.
 */

import type { ParsedRelease, Resolution, Source } from '../indexers/parser/types.js';
import {
	RESOLUTION_ORDER,
	SOURCE_ORDER,
	CODEC_ORDER,
	AUDIO_ORDER
} from '../indexers/parser/types.js';
import type { QualityPreset, QualityMatchResult } from './types.js';
import { db } from '../db/index.js';
import { createChildLogger } from '$lib/logging';

const logger = createChildLogger({ module: 'QualityFilter' });
import { scoringProfiles, profileSizeLimits } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { DEFAULT_PRESETS } from './types.js';

// Import new scoring engine
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
 * Combined quality result with both preset filter and scoring engine result
 */
export interface EnhancedQualityResult extends QualityMatchResult {
	/** Full scoring result from the scoring engine (if profile available) */
	scoringResult?: ScoringResult;
	/** Matched format names for display */
	matchedFormats?: string[];
}

/**
 * QualityFilter - Filter and score releases based on quality preferences
 */
export class QualityFilter {
	private profilesCache: Map<string, ScoringProfile> = new Map();
	private defaultProfile: ScoringProfile | null = null;

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
			logger.debug('[QualityFilter] Cache cleared for profile', {
				profileId,
				wasCached: hadCached
			});
		} else {
			const count = this.profilesCache.size;
			this.profilesCache.clear();
			logger.debug('[QualityFilter] All profile cache cleared', { count });
		}
		this.defaultProfile = null;
	}

	/**
	 * Get a quality preset by ID from hardcoded defaults
	 * (Legacy: presets are no longer stored in database)
	 */
	getPreset(id: string): QualityPreset | null {
		return DEFAULT_PRESETS[id] ?? null;
	}

	/**
	 * Get a scoring profile by ID
	 * Falls back to built-in profiles if not in database
	 */
	async getProfile(id: string): Promise<ScoringProfile | null> {
		// Check cache first
		if (this.profilesCache.has(id)) {
			const cached = this.profilesCache.get(id)!;
			logger.debug('[QualityFilter.getProfile] Cache hit', {
				id,
				cachedName: cached.name,
				formatScoresCount: Object.keys(cached.formatScores).length
			});
			return cached;
		}

		// Check if this is a built-in profile ID
		const builtIn = getProfile(id);

		// Try database first (custom profiles or seeded built-in profiles)
		const result = await db.select().from(scoringProfiles).where(eq(scoringProfiles.id, id)).get();

		logger.debug('[QualityFilter.getProfile] Loading profile', {
			id,
			foundInDb: !!result,
			dbFormatScoresCount: result?.formatScores ? Object.keys(result.formatScores).length : 0,
			dbFormatScoresSample: result?.formatScores
				? Object.keys(result.formatScores).slice(0, 3)
				: [],
			isBuiltIn: !!builtIn
		});

		if (result) {
			let profile = this.mapDbToProfile(result);

			// For built-in profiles, merge size limits from profileSizeLimits table
			// (Size limits are stored separately from the seeded profile data)
			if (builtIn) {
				const sizeLimits = await db
					.select()
					.from(profileSizeLimits)
					.where(eq(profileSizeLimits.profileId, id))
					.get();

				if (sizeLimits) {
					profile = {
						...profile,
						movieMinSizeGb:
							this.coerceNullableNumber(sizeLimits.movieMinSizeGb) ?? profile.movieMinSizeGb,
						movieMaxSizeGb:
							this.coerceNullableNumber(sizeLimits.movieMaxSizeGb) ?? profile.movieMaxSizeGb,
						episodeMinSizeMb:
							this.coerceNullableNumber(sizeLimits.episodeMinSizeMb) ?? profile.episodeMinSizeMb,
						episodeMaxSizeMb:
							this.coerceNullableNumber(sizeLimits.episodeMaxSizeMb) ?? profile.episodeMaxSizeMb
					};
				}
			}

			this.profilesCache.set(id, profile);
			return profile;
		}

		// Fall back to built-in profiles (not in database)
		if (builtIn) {
			// Check for size limit overrides in profileSizeLimits table
			const sizeLimits = await db
				.select()
				.from(profileSizeLimits)
				.where(eq(profileSizeLimits.profileId, id))
				.get();

			const mergedProfile: ScoringProfile = {
				...builtIn,
				movieMinSizeGb: this.coerceNullableNumber(sizeLimits?.movieMinSizeGb),
				movieMaxSizeGb: this.coerceNullableNumber(sizeLimits?.movieMaxSizeGb),
				episodeMinSizeMb: this.coerceNullableNumber(sizeLimits?.episodeMinSizeMb),
				episodeMaxSizeMb: this.coerceNullableNumber(sizeLimits?.episodeMaxSizeMb)
			};

			this.profilesCache.set(id, mergedProfile);
			return mergedProfile;
		}

		return null;
	}

	/**
	 * Get the default quality preset from hardcoded defaults
	 * (Legacy: presets are no longer stored in database)
	 */
	getDefaultPreset(): QualityPreset {
		// Return the 'any' preset which allows all quality levels
		return DEFAULT_PRESETS['any'];
	}

	/**
	 * Get the default scoring profile
	 */
	async getDefaultScoringProfile(): Promise<ScoringProfile> {
		if (this.defaultProfile) {
			return this.defaultProfile;
		}

		// Check database for default custom profile
		const result = await db
			.select()
			.from(scoringProfiles)
			.where(eq(scoringProfiles.isDefault, true))
			.get();

		if (result) {
			let profile = this.mapDbToProfile(result);

			// For built-in profiles, merge size limits from profileSizeLimits table
			// (Size limits are stored separately from the seeded profile data)
			const builtIn = getProfile(result.id);
			if (builtIn) {
				const sizeLimits = await db
					.select()
					.from(profileSizeLimits)
					.where(eq(profileSizeLimits.profileId, result.id))
					.get();

				if (sizeLimits) {
					profile = {
						...profile,
						movieMinSizeGb:
							this.coerceNullableNumber(sizeLimits.movieMinSizeGb) ?? profile.movieMinSizeGb,
						movieMaxSizeGb:
							this.coerceNullableNumber(sizeLimits.movieMaxSizeGb) ?? profile.movieMaxSizeGb,
						episodeMinSizeMb:
							this.coerceNullableNumber(sizeLimits.episodeMinSizeMb) ?? profile.episodeMinSizeMb,
						episodeMaxSizeMb:
							this.coerceNullableNumber(sizeLimits.episodeMaxSizeMb) ?? profile.episodeMaxSizeMb
					};
				}
			}

			this.defaultProfile = profile;
			return this.defaultProfile;
		}

		// Check if a built-in profile is set as default in profileSizeLimits
		const defaultOverride = await db
			.select()
			.from(profileSizeLimits)
			.where(eq(profileSizeLimits.isDefault, true))
			.get();

		if (defaultOverride) {
			const builtIn = getProfile(defaultOverride.profileId);
			if (builtIn) {
				this.defaultProfile = {
					...builtIn,
					movieMinSizeGb: this.coerceNullableNumber(defaultOverride.movieMinSizeGb),
					movieMaxSizeGb: this.coerceNullableNumber(defaultOverride.movieMaxSizeGb),
					episodeMinSizeMb: this.coerceNullableNumber(defaultOverride.episodeMinSizeMb),
					episodeMaxSizeMb: this.coerceNullableNumber(defaultOverride.episodeMaxSizeMb)
				};
				return this.defaultProfile;
			}
		}

		// Fall back to built-in Balanced profile with size limits if available
		const balancedLimits = await db
			.select()
			.from(profileSizeLimits)
			.where(eq(profileSizeLimits.profileId, 'balanced'))
			.get();

		this.defaultProfile = {
			...BALANCED_PROFILE,
			movieMinSizeGb: this.coerceNullableNumber(balancedLimits?.movieMinSizeGb),
			movieMaxSizeGb: this.coerceNullableNumber(balancedLimits?.movieMaxSizeGb),
			episodeMinSizeMb: this.coerceNullableNumber(balancedLimits?.episodeMinSizeMb),
			episodeMaxSizeMb: this.coerceNullableNumber(balancedLimits?.episodeMaxSizeMb)
		};
		return this.defaultProfile;
	}

	/**
	 * Get all quality presets from hardcoded defaults
	 * (Legacy: presets are no longer stored in database)
	 */
	getAllPresets(): QualityPreset[] {
		return Object.values(DEFAULT_PRESETS);
	}

	/**
	 * Get all scoring profiles (database + built-in)
	 */
	async getAllProfiles(): Promise<ScoringProfile[]> {
		const dbProfiles = await db.select().from(scoringProfiles).all();
		const dbMapped = dbProfiles.map((r) => this.mapDbToProfile(r));

		// Add built-in profiles that aren't overridden
		const dbIds = new Set(dbMapped.map((p) => p.id));
		const builtIns = DEFAULT_PROFILES.filter((p) => !dbIds.has(p.id));

		return [...builtIns, ...dbMapped];
	}

	/**
	 * Seed default scoring profiles to database if they don't exist.
	 * This ensures built-in profile IDs (quality, balanced, compact, streamer) are valid
	 * foreign key targets when users assign them to movies/series.
	 */
	async seedDefaultScoringProfiles(): Promise<void> {
		const existingIds = (
			await db.select({ id: scoringProfiles.id }).from(scoringProfiles).all()
		).map((r) => r.id);
		const existingSet = new Set(existingIds);

		let seeded = 0;
		for (const profile of DEFAULT_PROFILES) {
			if (existingSet.has(profile.id)) {
				continue;
			}

			await db.insert(scoringProfiles).values({
				id: profile.id,
				name: profile.name,
				description: profile.description ?? null,
				tags: profile.tags ?? [],
				upgradesAllowed: profile.upgradesAllowed ?? true,
				minScore: profile.minScore ?? 0,
				upgradeUntilScore: profile.upgradeUntilScore ?? -1,
				minScoreIncrement: profile.minScoreIncrement ?? 0,
				resolutionOrder: profile.resolutionOrder ?? null,
				formatScores: profile.formatScores ?? null,
				isDefault: profile.id === 'balanced' // Balanced is the default profile
			});
			seeded++;
		}

		if (seeded > 0) {
			logger.info(`Seeded ${seeded} default scoring profile(s) to database`);
		}
	}

	/**
	 * Check if a parsed release meets the minimum requirements of a preset
	 */
	meetsMinimum(parsed: ParsedRelease, preset: QualityPreset): { ok: boolean; reason?: string } {
		// Check minimum resolution
		if (preset.minResolution) {
			const minOrder = RESOLUTION_ORDER[preset.minResolution];
			const releaseOrder = RESOLUTION_ORDER[parsed.resolution];
			if (releaseOrder < minOrder) {
				return {
					ok: false,
					reason: `Resolution ${parsed.resolution} below minimum ${preset.minResolution}`
				};
			}
		}

		// Check maximum resolution
		if (preset.maxResolution) {
			const maxOrder = RESOLUTION_ORDER[preset.maxResolution];
			const releaseOrder = RESOLUTION_ORDER[parsed.resolution];
			if (releaseOrder > maxOrder) {
				return {
					ok: false,
					reason: `Resolution ${parsed.resolution} above maximum ${preset.maxResolution}`
				};
			}
		}

		// Check allowed sources
		if (preset.allowedSources && preset.allowedSources.length > 0) {
			if (!preset.allowedSources.includes(parsed.source)) {
				return {
					ok: false,
					reason: `Source ${parsed.source} not in allowed list`
				};
			}
		}

		// Check excluded sources
		if (preset.excludedSources && preset.excludedSources.length > 0) {
			if (preset.excludedSources.includes(parsed.source)) {
				return {
					ok: false,
					reason: `Source ${parsed.source} is excluded`
				};
			}
		}

		return { ok: true };
	}

	/**
	 * Calculate a quality score for a parsed release (0-1000)
	 * Legacy method that uses weighted scoring - prefer calculateEnhancedScore
	 */
	calculateScore(parsed: ParsedRelease, preset: QualityPreset): QualityMatchResult {
		const minCheck = this.meetsMinimum(parsed, preset);

		// Calculate individual component scores
		const resolutionScore = this.scoreResolution(parsed.resolution, preset);
		const sourceScore = this.scoreSource(parsed.source, preset);
		const codecScore = this.scoreCodec(parsed.codec);
		const hdrScore = this.scoreHdr(parsed.hdr, preset);
		const audioScore = this.scoreAudio(parsed.audio);

		// Weighted combination (resolution and source are most important)
		const totalScore = Math.round(
			resolutionScore * 0.35 + // 35% weight
				sourceScore * 0.3 + // 30% weight
				codecScore * 0.15 + // 15% weight
				hdrScore * 0.1 + // 10% weight
				audioScore * 0.1 // 10% weight
		);

		return {
			accepted: minCheck.ok,
			rejectionReason: minCheck.reason,
			score: totalScore,
			scoreBreakdown: {
				resolution: resolutionScore,
				source: sourceScore,
				codec: codecScore,
				hdr: hdrScore,
				audio: audioScore
			}
		};
	}

	/**
	 * Calculate an enhanced quality score using the scoring engine
	 * Combines preset filtering with full format-based scoring
	 * @param fileSizeBytes - Optional file size in bytes for size filtering
	 * @param sizeContext - Optional context for media-specific size validation
	 */
	calculateEnhancedScore(
		parsed: ParsedRelease,
		preset: QualityPreset,
		profile: ScoringProfile,
		fileSizeBytes?: number,
		sizeContext?: SizeValidationContext,
		indexerName?: string
	): EnhancedQualityResult {
		// First, check preset requirements (pass/fail filter)
		const minCheck = this.meetsMinimum(parsed, preset);

		// Build release attributes for scoring engine
		const attributes: ReleaseAttributes = {
			title: parsed.originalTitle,
			cleanTitle: parsed.cleanTitle,
			year: parsed.year,
			resolution: parsed.resolution,
			source: parsed.source,
			codec: parsed.codec,
			hdr: parsed.hdr,
			audio: parsed.audio,
			releaseGroup: parsed.releaseGroup,
			streamingService: undefined, // Detected from title in scoring engine
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

		// Normalize score to 0-1000 using tiered approach
		// Preserves quality differentiation across different quality tiers
		const normalizedScore = this.normalizeScore(scoringResult.totalScore);

		// Get breakdown from legacy scoring for backward compatibility
		const legacyResult = this.calculateScore(parsed, preset);

		return {
			accepted,
			rejectionReason,
			score: normalizedScore,
			rawScore: scoringResult.totalScore, // Expose raw score for advanced users
			scoreBreakdown: legacyResult.scoreBreakdown,
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
			audio: parsed.audio,
			releaseGroup: parsed.releaseGroup,
			streamingService: undefined,
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
	 * Normalize scoring engine score to 0-1000 range
	 *
	 * Uses a tiered approach to preserve quality differentiation:
	 * - Scores are normalized relative to the profile's typical range
	 * - Uses logarithmic scaling for very high scores to prevent compression
	 * - Different quality tiers map to distinct score ranges
	 *
	 * Score ranges (approximate):
	 * - 0-200: Low quality (SD, cam, etc.)
	 * - 200-400: Basic quality (720p web)
	 * - 400-600: Good quality (1080p web/bluray)
	 * - 600-800: Great quality (4K web, 1080p remux)
	 * - 800-1000: Best quality (4K bluray, 4K remux)
	 */
	private normalizeScore(score: number): number {
		if (score === -Infinity) return 0;
		if (score === Infinity) return 1000;
		if (score <= 0) return 0;

		// Define expected score ranges for different quality tiers based on profile scores
		// These are calibrated against the EFFICIENT profile format scores
		const tierBoundaries = {
			// Typical raw scores (from scoring engine)
			lowQuality: 2000, // SD, 720p webrip
			basicQuality: 5000, // 720p bluray, 1080p webrip
			goodQuality: 10000, // 1080p bluray, 1080p webdl
			greatQuality: 15000, // 4K webdl, 1080p remux
			bestQuality: 25000 // 4K bluray, 4K remux with top audio
		};

		// Map raw scores to normalized ranges
		let normalized: number;

		if (score <= tierBoundaries.lowQuality) {
			// 0-2000 raw → 0-200 normalized
			normalized = (score / tierBoundaries.lowQuality) * 200;
		} else if (score <= tierBoundaries.basicQuality) {
			// 2000-5000 raw → 200-400 normalized
			const rangeScore = score - tierBoundaries.lowQuality;
			const rangeSize = tierBoundaries.basicQuality - tierBoundaries.lowQuality;
			normalized = 200 + (rangeScore / rangeSize) * 200;
		} else if (score <= tierBoundaries.goodQuality) {
			// 5000-10000 raw → 400-600 normalized
			const rangeScore = score - tierBoundaries.basicQuality;
			const rangeSize = tierBoundaries.goodQuality - tierBoundaries.basicQuality;
			normalized = 400 + (rangeScore / rangeSize) * 200;
		} else if (score <= tierBoundaries.greatQuality) {
			// 10000-15000 raw → 600-800 normalized
			const rangeScore = score - tierBoundaries.goodQuality;
			const rangeSize = tierBoundaries.greatQuality - tierBoundaries.goodQuality;
			normalized = 600 + (rangeScore / rangeSize) * 200;
		} else if (score <= tierBoundaries.bestQuality) {
			// 15000-25000 raw → 800-950 normalized
			const rangeScore = score - tierBoundaries.greatQuality;
			const rangeSize = tierBoundaries.bestQuality - tierBoundaries.greatQuality;
			normalized = 800 + (rangeScore / rangeSize) * 150;
		} else {
			// >25000 raw → 950-1000 (logarithmic to prevent outliers from dominating)
			const excess = score - tierBoundaries.bestQuality;
			const logBonus = Math.log10(excess / 1000 + 1) * 10;
			normalized = 950 + Math.min(50, logBonus);
		}

		return Math.max(0, Math.min(1000, Math.round(normalized)));
	}

	/**
	 * Score resolution (0-1000) - Legacy method
	 */
	private scoreResolution(resolution: Resolution, preset: QualityPreset): number {
		const order = RESOLUTION_ORDER[resolution];
		const maxPossible = RESOLUTION_ORDER['2160p'];

		// Base score from resolution order
		let score = (order / maxPossible) * 800;

		// Bonus if it matches preferred resolution
		if (preset.preferredResolution && resolution === preset.preferredResolution) {
			score += 200;
		}

		return Math.min(1000, Math.round(score));
	}

	/**
	 * Score source (0-1000) - Legacy method
	 */
	private scoreSource(source: Source, preset: QualityPreset): number {
		const order = SOURCE_ORDER[source];
		const maxPossible = SOURCE_ORDER['remux'];

		// Base score from source order
		let score = (order / maxPossible) * 1000;

		// If this source is in the allowed list, it's good
		if (preset.allowedSources && preset.allowedSources.includes(source)) {
			score = Math.max(score, 700);
		}

		return Math.max(0, Math.round(score));
	}

	/**
	 * Score codec (0-1000) - Legacy method
	 */
	private scoreCodec(codec: ParsedRelease['codec']): number {
		const order = CODEC_ORDER[codec];
		const maxPossible = CODEC_ORDER['av1'];

		return Math.max(0, Math.round((order / maxPossible) * 1000));
	}

	/**
	 * Score HDR (0-1000) - Legacy method
	 */
	private scoreHdr(hdr: ParsedRelease['hdr'], preset: QualityPreset): number {
		if (!hdr) {
			// No HDR - if preset prefers HDR, penalize slightly
			return preset.preferHdr ? 300 : 500;
		}

		// HDR present - higher scores for better formats
		// Following Profilarr scoring philosophy
		const hdrScores: Record<NonNullable<ParsedRelease['hdr']>, number> = {
			'dolby-vision': 1000, // Best - dynamic metadata with fallback
			'dolby-vision-hdr10+': 1000, // DV + HDR10+ combo
			'dolby-vision-hdr10': 1000, // DV + HDR10 fallback
			'dolby-vision-hlg': 900, // DV + HLG
			'dolby-vision-sdr': 800, // DV without HDR fallback
			'hdr10+': 900, // Dynamic metadata
			hdr10: 800, // Static metadata
			hdr: 750, // Generic HDR
			hlg: 700, // Broadcast HDR
			pq: 650, // Basic HDR transfer
			sdr: 500 // Standard dynamic range
		};

		return hdrScores[hdr] ?? 500;
	}

	/**
	 * Score audio (0-1000) - Legacy method
	 */
	private scoreAudio(audio: ParsedRelease['audio']): number {
		const order = AUDIO_ORDER[audio];
		const maxPossible = AUDIO_ORDER['atmos'];

		return Math.max(0, Math.round((order / maxPossible) * 1000));
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
