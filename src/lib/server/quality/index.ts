/**
 * Quality Module
 *
 * Provides quality filtering, TMDB matching, and release enrichment
 */

// Types
export type { QualityPreset, QualityMatchResult, ScoreComponents } from './types.js';
export { DEFAULT_PRESETS } from './types.js';

// Quality Filter
export { QualityFilter, qualityFilter, type EnhancedQualityResult } from './QualityFilter.js';

// TMDB Matcher
export { TmdbMatcher, tmdbMatcher, type TmdbMatch, type TmdbHint } from './TmdbMatcher.js';

// Release Enricher
export {
	ReleaseEnricher,
	releaseEnricher,
	type EnrichmentOptions,
	type EnrichmentResult
} from './ReleaseEnricher.js';

// Re-export scoring engine types for convenience
export type {
	ScoringProfile,
	ScoringResult,
	CustomFormat,
	FormatCategory,
	ReleaseAttributes,
	ScoreBreakdown,
	CategoryBreakdown,
	ScoredFormat
} from '../scoring/index.js';

export {
	DEFAULT_PROFILES,
	QUALITY_PROFILE,
	BALANCED_PROFILE,
	COMPACT_PROFILE,
	STREAMER_PROFILE,
	scoreRelease,
	rankReleases,
	isUpgrade,
	getProfile,
	isBuiltInProfile,
	getBuiltInProfileIds
} from '../scoring/index.js';
