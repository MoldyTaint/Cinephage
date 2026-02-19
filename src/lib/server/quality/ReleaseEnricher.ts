/**
 * Release Enricher
 *
 * Orchestrates the enrichment pipeline for search results:
 * 1. Parse release titles
 * 2. Score against quality preset + scoring profile
 * 3. Match to TMDB
 * 4. Filter rejected releases
 */

import type { ReleaseResult, EnhancedReleaseResult, IndexerProtocol } from '../indexers/types';
import { parseRelease } from '../indexers/parser/index.js';
import { qualityFilter, QualityFilter, type EnhancedQualityResult } from './QualityFilter.js';
import { tmdbMatcher, TmdbMatcher, type TmdbHint } from './TmdbMatcher.js';
import type { QualityPreset, ScoreComponents } from './types.js';
import type { ScoringProfile, SizeValidationContext, PackPreference } from '../scoring/index.js';
import { calculatePackBonus } from '../scoring/types.js';
import { logger } from '$lib/logging';
import { getProtocolHandler, type ProtocolContext } from '../indexers/protocols';
import type { ProtocolSettings } from '$lib/server/db/schema';

/**
 * Indexer configuration for protocol-specific rejection
 */
export interface IndexerConfigForEnrichment {
	id: string;
	name: string;
	protocol: IndexerProtocol;
	protocolSettings?: ProtocolSettings;
}

/**
 * Options for enrichment
 */
export interface EnrichmentOptions {
	/** Scoring profile ID for quality scoring */
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

	/** Indexer configs for protocol-specific rejection (seeder minimums, dead torrents, etc.) */
	indexerConfigs?: Map<string, IndexerConfigForEnrichment>;
}

/**
 * Result of enrichment
 */
export interface EnrichmentResult {
	/** Enriched releases */
	releases: EnhancedReleaseResult[];

	/** Number of releases that were rejected */
	rejectedCount: number;

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

		// Use hardcoded default preset for legacy filtering
		const preset = this.filter.getDefaultPreset();

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

		// Check protocol-specific rejection (seeder minimums, dead torrents, etc.)
		let protocolRejectionReason: string | undefined;
		if (options.indexerConfigs) {
			const indexerConfig = options.indexerConfigs.get(release.indexerId);
			if (indexerConfig?.protocolSettings) {
				const handler = getProtocolHandler(release.protocol);
				// Cast to ProtocolContext settings type (db schema uses null, protocol types use undefined)
				const context: ProtocolContext = {
					indexerId: indexerConfig.id,
					indexerName: indexerConfig.name,
					baseUrl: '',
					settings: indexerConfig.protocolSettings as ProtocolContext['settings']
				};
				// Create a minimal enhanced result for the protocol handler check
				const tempEnhanced: EnhancedReleaseResult = {
					...release,
					parsed,
					quality,
					totalScore,
					scoreComponents: components,
					rejected: false
				};
				protocolRejectionReason = handler.shouldReject(tempEnhanced, context);
			}
		}

		// Build enhanced result
		// Consolidate all rejection reasons into an array (Radarr-style)
		const rejections: string[] = [];

		// Add quality-related rejections
		if (!quality.accepted) {
			if (quality.scoringResult?.sizeRejectionReason) {
				rejections.push(quality.scoringResult.sizeRejectionReason);
			}
			if (quality.scoringResult?.isBanned && quality.scoringResult.bannedReasons?.length) {
				rejections.push(...quality.scoringResult.bannedReasons.map((r: string) => `Banned: ${r}`));
			}
			if (rejections.length === 0) {
				rejections.push('Quality requirements not met');
			}
		}

		// Add protocol rejection
		if (!protocolAllowed) {
			rejections.push(
				`Protocol '${release.protocol}' not allowed for profile '${profile?.name || 'default'}' (allowed: ${allowedProtocols.join(', ')})`
			);
		}

		// Add protocol-specific rejection (dead torrents, seeder minimums, etc.)
		if (protocolRejectionReason) {
			rejections.push(protocolRejectionReason);
		}

		const enhanced: EnhancedReleaseResult = {
			...release,
			parsed,
			quality,
			totalScore,
			scoreComponents: components,
			rejected: rejections.length > 0,
			rejections,
			rejectionCount: rejections.length,
			// Keep rejectionReason for backwards compatibility (primary reason)
			rejectionReason: rejections.length > 0 ? rejections[0] : undefined,
			// qualityWeight is the normalized quality score (for debugging/display)
			qualityWeight: components.normalizedQualityScore
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
	 * - Only intrinsic quality factors that persist with the file are included
	 * - Ephemeral factors like seeders, freshness, and parsing confidence are NOT
	 *   included because they don't represent actual file quality and would cause
	 *   score mismatches between search results and existing files
	 *
	 * This ensures that search result scores match what the file will show after download.
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

		// Penalty for hardcoded subs (fixed penalty, not proportional)
		const hardcodedSubsPenalty = parsed.hasHardcodedSubs ? -50 : 0;

		// Calculate total score - only intrinsic quality factors
		const totalScore = Math.round(
			Math.max(0, baseScore + enhancementBonus + packBonus + hardcodedSubsPenalty)
		);

		// Build components breakdown
		const components: ScoreComponents = {
			rawQualityScore,
			normalizedQualityScore: baseScore,
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
