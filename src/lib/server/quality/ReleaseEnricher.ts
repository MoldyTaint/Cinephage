/**
 * Release Enricher
 *
 * Orchestrates the enrichment pipeline for search results:
 * 1. Parse release titles
 * 2. Score against quality preset + scoring profile
 * 3. Match to TMDB
 * 4. Filter rejected releases
 */

import type { ReleaseResult, EnhancedReleaseResult } from '../indexers/types';
import { parseRelease } from '../indexers/parser/index.js';
import { qualityFilter, QualityFilter, type EnhancedQualityResult } from './QualityFilter.js';
import { tmdbMatcher, TmdbMatcher, type TmdbHint } from './TmdbMatcher.js';
import type { QualityPreset, ScoreComponents } from './types.js';
import type { ScoringProfile, SizeValidationContext, PackPreference } from '../scoring/index.js';
import { calculatePackBonus } from '../scoring/types.js';
import { logger } from '$lib/logging';

/**
 * Options for enrichment
 */
export interface EnrichmentOptions {
	/** Quality preset ID to filter/score against */
	qualityPresetId?: string;

	/** Scoring profile ID for detailed quality scoring */
	scoringProfileId?: string;

	/** Whether to match releases to TMDB entries */
	matchToTmdb?: boolean;

	/** Hint for TMDB matching (if caller already knows the target) */
	tmdbHint?: TmdbHint;

	/** Whether to filter out rejected releases */
	filterRejected?: boolean;

	/** Minimum score to include (0-1000) */
	minScore?: number;

	/** Whether to use enhanced scoring (scoring engine) vs legacy */
	useEnhancedScoring?: boolean;

	/** Media type for size validation ('movie' or 'tv') */
	mediaType?: 'movie' | 'tv';

	/** Episode count for the target season (used for season pack size validation) */
	seasonEpisodeCount?: number;
}

/**
 * Result of enrichment
 */
export interface EnrichmentResult {
	/** Enriched releases */
	releases: EnhancedReleaseResult[];

	/** Number of releases that were rejected */
	rejectedCount: number;

	/** Quality preset used (if any) */
	qualityPreset?: QualityPreset;

	/** Scoring profile used (if any) */
	scoringProfile?: ScoringProfile;

	/** Processing time in ms */
	enrichTimeMs: number;
}

/**
 * ReleaseEnricher - Enriches search results with parsed metadata and quality scoring
 */
export class ReleaseEnricher {
	constructor(
		private filter: QualityFilter = qualityFilter,
		private matcher: TmdbMatcher = tmdbMatcher
	) {}

	/**
	 * Enrich a batch of releases
	 */
	async enrich(
		releases: ReleaseResult[],
		options: EnrichmentOptions = {}
	): Promise<EnrichmentResult> {
		const startTime = Date.now();

		// Default to enhanced scoring
		const useEnhanced = options.useEnhancedScoring !== false;

		// Load quality preset if specified
		let preset: QualityPreset | undefined;
		if (options.qualityPresetId) {
			preset = (await this.filter.getPreset(options.qualityPresetId)) ?? undefined;
		}
		if (!preset) {
			preset = await this.filter.getDefaultPreset();
		}

		// Load scoring profile if using enhanced scoring
		let profile: ScoringProfile | undefined;
		if (useEnhanced) {
			if (options.scoringProfileId) {
				profile = (await this.filter.getProfile(options.scoringProfileId)) ?? undefined;
			}
			if (!profile) {
				profile = await this.filter.getDefaultScoringProfile();
			}

			// Debug logging for profile scoring issues
			logger.info('[ReleaseEnricher] Using profile', {
				requestedId: options.scoringProfileId,
				loadedId: profile?.id,
				loadedName: profile?.name,
				formatScoresCount: profile ? Object.keys(profile.formatScores).length : 0,
				sampleKeys: profile ? Object.keys(profile.formatScores).slice(0, 5) : []
			});
		}

		// Enrich each release
		const enrichedPromises = releases.map((release) =>
			this.enrichSingle(release, preset!, profile, options)
		);
		let enriched = await Promise.all(enrichedPromises);

		// Count rejected before filtering
		const rejectedCount = enriched.filter((r) => r.rejected).length;

		// Filter rejected if requested
		if (options.filterRejected) {
			enriched = enriched.filter((r) => !r.rejected);
		}

		// Filter by minimum score if specified
		if (options.minScore !== undefined) {
			enriched = enriched.filter((r) => r.totalScore >= options.minScore!);
		}

		// Sort by total score (descending)
		enriched.sort((a, b) => b.totalScore - a.totalScore);

		return {
			releases: enriched,
			rejectedCount,
			qualityPreset: preset,
			scoringProfile: profile,
			enrichTimeMs: Date.now() - startTime
		};
	}

	/**
	 * Enrich a single release
	 */
	private async enrichSingle(
		release: ReleaseResult,
		preset: QualityPreset,
		profile: ScoringProfile | undefined,
		options: EnrichmentOptions
	): Promise<EnhancedReleaseResult> {
		// Use cached parsed result if available (from SearchOrchestrator.filterBySeasonEpisode)
		// Otherwise parse the release title
		const releaseWithCache = release as ReleaseResult & {
			_parsedRelease?: ReturnType<typeof parseRelease>;
		};
		const parsed = releaseWithCache._parsedRelease ?? parseRelease(release.title);

		// Calculate quality score using enhanced scoring if profile available
		// Pass release.size (bytes) for file size filtering
		let quality: EnhancedQualityResult;
		if (profile) {
			// Build size validation context if media type is specified
			let sizeContext: SizeValidationContext | undefined;
			if (options.mediaType) {
				const isSeasonPack = parsed.episode?.isSeasonPack ?? false;
				sizeContext = {
					mediaType: options.mediaType,
					isSeasonPack,
					// For season packs, use the provided episode count
					// If not provided and it's a season pack, validation will reject it
					episodeCount: isSeasonPack ? options.seasonEpisodeCount : undefined
				};
			}
			quality = this.filter.calculateEnhancedScore(
				parsed,
				preset,
				profile,
				release.size,
				sizeContext,
				release.indexerName
			);
		} else {
			// Fallback to legacy scoring
			quality = this.filter.calculateScore(parsed, preset);
		}

		// Calculate total score with detailed breakdown
		// Pass pack preference from profile for TV content scoring
		const { totalScore, components } = this.calculateTotalScoreWithComponents(
			release,
			quality.score,
			quality.rawScore ?? quality.score,
			parsed,
			quality,
			profile?.packPreference
		);

		// Check if release protocol is allowed by the profile
		// Default to ['torrent', 'usenet'] if not specified (backward compatible)
		const allowedProtocols = profile?.allowedProtocols ?? ['torrent', 'usenet'];
		const protocolAllowed = allowedProtocols.includes(release.protocol);

		// Build enhanced result
		const enhanced: EnhancedReleaseResult = {
			...release,
			parsed,
			quality,
			totalScore,
			scoreComponents: components,
			rejected: !quality.accepted || !protocolAllowed,
			rejectionReason: !quality.accepted
				? quality.scoringResult?.sizeRejectionReason ||
					(quality.scoringResult?.isBanned
						? `Banned: ${quality.scoringResult.bannedReasons?.join(', ')}`
						: 'Quality requirements not met')
				: !protocolAllowed
					? `Protocol '${release.protocol}' not allowed for profile '${profile?.name || 'default'}' (allowed: ${allowedProtocols.join(', ')})`
					: undefined
		};

		// Add scoring result and matched formats if available
		if (quality.scoringResult) {
			enhanced.scoringResult = quality.scoringResult;
		}
		if (quality.matchedFormats) {
			enhanced.matchedFormats = quality.matchedFormats;
		}

		// Add episode match for TV releases
		if (parsed.episode) {
			enhanced.episodeMatch = {
				season: parsed.episode.season ?? 0,
				seasons: parsed.episode.seasons,
				episodes: parsed.episode.episodes ?? [],
				isSeasonPack: parsed.episode.isSeasonPack,
				isCompleteSeries: parsed.episode.isCompleteSeries
			};
		}

		// Match to TMDB if requested
		if (options.matchToTmdb) {
			try {
				const tmdbMatch = await this.matcher.match(parsed, options.tmdbHint);
				if (tmdbMatch) {
					enhanced.tmdbMatch = tmdbMatch;
				}
			} catch (error) {
				// TMDB matching is optional, don't fail the whole enrichment
				logger.error('TMDB matching failed', error, { releaseTitle: release.title });
			}
		}

		return enhanced;
	}

	/**
	 * Calculate total score with detailed breakdown of all components
	 *
	 * Scoring philosophy:
	 * - Quality score (0-1000) is the PRIMARY ranking factor
	 * - Bonuses are PROPORTIONAL to quality score to preserve relative rankings
	 * - Maximum bonus is capped at ~15% of quality score to prevent availability
	 *   from overwhelming quality differences
	 * - Pack bonuses are FIXED to strongly prefer packs over individual episodes
	 *
	 * This ensures that a 1080p bluray (score ~500) will always rank higher than
	 * a 720p webrip (score ~300) regardless of seeder counts.
	 */
	private calculateTotalScoreWithComponents(
		release: ReleaseResult,
		normalizedQualityScore: number,
		rawQualityScore: number,
		parsed: ReturnType<typeof parseRelease>,
		quality?: EnhancedQualityResult,
		packPreference?: PackPreference
	): { totalScore: number; components: ScoreComponents } {
		// Start with the normalized quality score as the base
		const baseScore = normalizedQualityScore;

		// Calculate individual bonus components
		// All bonuses are proportional to preserve quality ranking

		// Availability bonus: logarithmic seeder bonus, scaled by quality
		// Max ~5% of quality score for torrents with good seeders
		let availabilityBonus = 0;
		if (release.seeders !== undefined && release.seeders > 0) {
			// Log scale: 1 seeder = small bonus, 100 seeders = moderate, 1000+ = max
			const seederFactor = Math.min(1, Math.log10(release.seeders + 1) / 3);
			// Scale bonus to be proportional to quality (max 5% of base score, capped at 50)
			availabilityBonus = Math.min(50, Math.round(baseScore * 0.05 * seederFactor));
		}

		// Freshness bonus: prefer newer releases slightly
		// Max ~3% of quality score for very fresh releases
		let freshnessBonus = 0;
		const ageHours = (Date.now() - release.publishDate.getTime()) / (1000 * 60 * 60);
		if (ageHours < 24) {
			// Very fresh (< 24h): 3% bonus, capped at 30
			freshnessBonus = Math.min(30, Math.round(baseScore * 0.03));
		} else if (ageHours < 168) {
			// Fresh (< 1 week): 1.5% bonus, capped at 15
			freshnessBonus = Math.min(15, Math.round(baseScore * 0.015));
		}

		// Enhancement bonus for PROPER/REPACK (quality fixes)
		// Only apply if not already scored by the format matcher
		let enhancementBonus = 0;
		const hasEnhancementScore = quality?.matchedFormats?.some(
			(f) => f.toLowerCase().includes('repack') || f.toLowerCase().includes('proper')
		);
		if (!hasEnhancementScore && (parsed.isProper || parsed.isRepack)) {
			// Fixed bonus for quality improvements
			enhancementBonus = 20;
		}

		// Pack bonus: prioritize season/series packs for TV content
		// This is a fixed bonus (not proportional) to strongly prefer packs
		const episodeInfo = parsed.episode;
		const isSeasonPack = episodeInfo?.isSeasonPack ?? false;
		const isCompleteSeries = episodeInfo?.isCompleteSeries ?? false;
		const seasonCount = episodeInfo?.seasons?.length ?? (isSeasonPack ? 1 : 0);
		const packBonus = calculatePackBonus(
			isSeasonPack,
			isCompleteSeries,
			seasonCount,
			packPreference
		);

		// Confidence bonus: higher parsing confidence = more reliable match
		// Max ~3% of quality score
		const confidenceBonus = Math.min(30, Math.round(baseScore * 0.03 * parsed.confidence));

		// Penalty for hardcoded subs (fixed penalty, not proportional)
		const hardcodedSubsPenalty = parsed.hasHardcodedSubs ? -50 : 0;

		// Calculate total score (including pack bonus for TV content)
		const totalScore = Math.round(
			Math.max(
				0,
				baseScore +
					availabilityBonus +
					freshnessBonus +
					enhancementBonus +
					packBonus +
					confidenceBonus +
					hardcodedSubsPenalty
			)
		);

		// Build components breakdown
		const components: ScoreComponents = {
			rawQualityScore,
			normalizedQualityScore: baseScore,
			availabilityBonus,
			freshnessBonus,
			confidenceBonus,
			enhancementBonus,
			packBonus,
			hardcodedSubsPenalty,
			totalScore
		};

		return { totalScore, components };
	}

	/**
	 * Calculate total score combining quality and other factors
	 * @deprecated Use calculateTotalScoreWithComponents for detailed breakdown
	 */
	private calculateTotalScore(
		release: ReleaseResult,
		qualityScore: number,
		parsed: ReturnType<typeof parseRelease>,
		quality?: EnhancedQualityResult
	): number {
		const { totalScore } = this.calculateTotalScoreWithComponents(
			release,
			qualityScore,
			quality?.rawScore ?? qualityScore,
			parsed,
			quality
		);
		return totalScore;
	}
}

/**
 * Singleton instance
 */
export const releaseEnricher = new ReleaseEnricher();
