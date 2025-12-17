/**
 * Scoring Engine - Public API
 *
 * A comprehensive scoring system for evaluating media releases.
 * The scoring engine is the foundation that profiles configure.
 *
 * Architecture:
 * - Types: Core interfaces and type definitions
 * - Formats: Custom format definitions (resolution, audio, groups, etc.)
 * - Matcher: Evaluates releases against format conditions
 * - Scorer: Calculates total scores based on matched formats and profile
 * - Profiles: Pre-configured scoring philosophies (Quality, Balanced, Compact, Streamer)
 *
 * Profiles are standalone - they define complete format->score mappings.
 * Formats no longer have defaultScore; scores are entirely defined by profiles.
 *
 * Usage:
 * ```typescript
 * import { scoreRelease, BALANCED_PROFILE, rankReleases } from './scoring';
 *
 * // Score a single release
 * const result = scoreRelease('Movie.2024.2160p.BluRay.REMUX.HEVC.TrueHD.Atmos-FGT', BALANCED_PROFILE);
 * console.log(result.totalScore); // High score
 * console.log(result.breakdown); // Score by category
 *
 * // Compare releases
 * const comparison = compareReleases(release1, release2, QUALITY_PROFILE);
 * console.log(comparison.winner); // 'release1' | 'release2' | 'tie'
 *
 * // Rank multiple releases
 * const ranked = rankReleases([{ name: release1 }, { name: release2 }], COMPACT_PROFILE);
 * console.log(ranked[0].rank); // Best release is rank 1
 *
 * // Check for upgrade
 * const upgrade = isUpgrade(existingRelease, candidateRelease, BALANCED_PROFILE);
 * console.log(upgrade.isUpgrade); // true if candidate is better
 * ```
 */

// =============================================================================
// Types
// =============================================================================

export type {
	// Format types
	CustomFormat,
	FormatCondition,
	ConditionType,
	FormatCategory,

	// Matching types
	ConditionMatchResult,
	MatchedFormat,
	ScoredFormat,

	// Release types
	ReleaseAttributes,

	// Profile types
	ScoringProfile,
	FormatScore,
	SizeValidationContext,
	PackPreference,

	// Result types
	ScoringResult,
	ScoreBreakdown,
	CategoryBreakdown,

	// Re-exported parser types
	Resolution,
	Source,
	Codec,
	HdrFormat,
	AudioFormat
} from './types.js';

export {
	BANNED_SCORE,
	DEFAULT_RESOLUTION_ORDER,
	DEFAULT_PACK_PREFERENCE,
	calculatePackBonus
} from './types.js';

// =============================================================================
// Scoring Functions
// =============================================================================

export {
	// Core scoring
	scoreRelease,
	parseRelease,

	// Comparison & ranking
	compareReleases,
	rankReleases,
	filterQualityReleases,

	// Upgrade detection
	isUpgrade,

	// Utilities
	explainScore,
	getMatchedFormatIds,
	debugRelease
} from './scorer.js';

// =============================================================================
// Matching Functions
// =============================================================================

export {
	// Condition evaluation
	evaluateCondition,
	evaluateFormat,

	// Format matching
	matchFormats,
	matchesFormat,

	// Attribute extraction
	extractAttributes,

	// Cache management
	clearPatternCache
} from './matcher.js';

// =============================================================================
// Profiles
// =============================================================================

export {
	// Default profiles
	QUALITY_PROFILE,
	BALANCED_PROFILE,
	COMPACT_PROFILE,
	STREAMER_PROFILE,

	// Profile collections
	DEFAULT_PROFILES,
	PROFILE_BY_ID,

	// Profile utilities
	getProfile,
	getBuiltInProfileIds,
	isBuiltInProfile
} from './profiles.js';

// =============================================================================
// Format Registry
// =============================================================================

export {
	// All formats combined
	ALL_FORMATS,
	FORMAT_BY_ID,
	FORMAT_COUNTS,

	// Format utilities
	getFormat,
	getFormatsByCategory,
	getFormatsByTag,

	// Resolution formats
	RESOLUTION_2160P_FORMATS,
	RESOLUTION_1080P_FORMATS,
	RESOLUTION_720P_FORMATS,
	RESOLUTION_SD_FORMATS,
	ALL_RESOLUTION_FORMATS,

	// Release groups (individual detection, no tiers)
	RELEASE_GROUP_FORMATS,
	RELEASE_GROUP_NAMES,
	ALL_GROUP_TIER_FORMATS,
	isKnownGroup,

	// Audio formats
	LOSSLESS_AUDIO_FORMATS,
	ATMOS_FORMATS,
	HQ_LOSSY_AUDIO_FORMATS,
	STANDARD_AUDIO_FORMATS,
	LOSSLESS_AUDIO_GROUP,
	ALL_AUDIO_FORMATS,

	// HDR formats
	DOLBY_VISION_FORMATS,
	DOLBY_VISION_FORMAT,
	DOLBY_VISION_NO_FALLBACK_FORMAT,
	HDR10_FORMATS,
	HDR10_PLUS_FORMAT,
	HDR10_FORMAT,
	HDR_GENERIC_FORMAT,
	OTHER_HDR_FORMATS,
	HLG_FORMAT,
	PQ_FORMAT,
	SDR_FORMAT,
	MISSING_HDR_FORMATS,
	HDR_FORMATS,
	ALL_HDR_FORMATS,

	// Streaming services
	PREMIUM_STREAMING_FORMATS,
	HBO_STREAMING_FORMATS,
	STANDARD_STREAMING_FORMATS,
	INTERNATIONAL_STREAMING_FORMATS,
	ALL_STREAMING_FORMATS,

	// Banned/deceptive (hard blocked)
	BANNED_RETAGGING,
	BANNED_FAKE_HDR,
	BANNED_CONTENT,
	BANNED_SOURCES,
	ALL_BANNED_FORMATS,
	BANNED_GROUP_NAMES,
	isBannedGroup,

	// Enhancement formats
	BANNED_FORMATS,
	UPSCALED_FORMAT,
	AI_UPSCALED_TV_FORMAT,
	AI_UPSCALED_MOVIE_FORMAT,
	THREE_D_FORMAT,
	FULL_DISC_FORMAT,
	X264_2160P_FORMAT,
	XVID_FORMAT,
	REPACK_FORMATS,
	IMAX_FORMATS,
	IMAX_ENHANCED_FORMAT,
	IMAX_FORMAT,
	EDITION_FORMATS,
	CODEC_FORMATS,
	TV_FORMATS,
	LANGUAGE_FORMATS,
	EXTRAS_FORMAT,
	ALL_ENHANCEMENT_FORMATS
} from './formats/index.js';
