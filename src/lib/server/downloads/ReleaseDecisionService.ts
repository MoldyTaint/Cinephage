/**
 * ReleaseDecisionService
 *
 * Centralized decision engine that validates releases before grabbing.
 * Handles all media types: movies, series, seasons, and episodes.
 *
 * This mirrors Radarr/Sonarr's approach where ALL grabs (manual, automatic, RSS)
 * go through the same decision logic to ensure consistent upgrade behavior.
 *
 * Key responsibilities:
 * 1. Fetch existing files for the target media
 * 2. Check blocklist for known problematic releases
 * 3. Evaluate if release is an upgrade over existing files
 * 4. Handle season pack logic (majority benefit rule)
 * 5. Provide detailed decision results for UI display
 */

import { db } from '$lib/server/db/index.js';
import {
	movies,
	movieFiles,
	series,
	episodes,
	episodeFiles,
	scoringProfiles
} from '$lib/server/db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { isUpgrade, scoreRelease } from '$lib/server/scoring/scorer.js';
import { getProfile } from '$lib/server/scoring/profiles.js';
import {
	ReleaseBlocklistSpecification,
	type ReleaseCandidate
} from '$lib/server/monitoring/specifications/index.js';
import type { ScoringProfile } from '$lib/server/scoring/types.js';
import { logger } from '$lib/logging/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Upgrade status for UI display
 */
export type UpgradeStatus = 'upgrade' | 'sidegrade' | 'downgrade' | 'new' | 'blocked' | 'rejected';

/**
 * Statistics for season/series pack decisions
 */
export interface UpgradeStats {
	/** Number of episodes that would be upgraded */
	improved: number;
	/** Number of episodes that would stay the same quality */
	unchanged: number;
	/** Number of episodes that would be downgraded */
	downgraded: number;
	/** Number of episodes that are new (no existing file) */
	newEpisodes: number;
	/** Total episodes evaluated */
	total: number;
}

/**
 * Result of a release decision evaluation
 */
export interface ReleaseDecisionResult {
	/** Whether the release should be grabbed */
	accepted: boolean;
	/** Human-readable reason for the decision */
	reason?: string;
	/** Machine-readable rejection type for UI handling */
	rejectionType?: string;
	/** Whether this release is an upgrade over existing */
	isUpgrade: boolean;
	/** Upgrade status for UI display */
	upgradeStatus: UpgradeStatus;
	/** Statistics for season packs */
	upgradeStats?: UpgradeStats;
	/** Score of the candidate release */
	candidateScore?: number;
	/** Score of the existing file (if any) */
	existingScore?: number;
	/** Score improvement */
	scoreImprovement?: number;
}

/**
 * Options for decision evaluation
 */
export interface DecisionOptions {
	/** Skip blocklist check */
	skipBlocklist?: boolean;
	/** Allow sidegrades (same score) */
	allowSidegrade?: boolean;
	/** Force accept regardless of upgrade status (for manual override) */
	force?: boolean;
}

/**
 * Release info needed for decision making
 */
export interface ReleaseInfo {
	title: string;
	size?: number;
	infoHash?: string;
	indexerId?: string;
	downloadUrl?: string;
	magnetUrl?: string;
}

// ============================================================================
// ReleaseDecisionService
// ============================================================================

class ReleaseDecisionService {
	private static instance: ReleaseDecisionService;

	static getInstance(): ReleaseDecisionService {
		if (!ReleaseDecisionService.instance) {
			ReleaseDecisionService.instance = new ReleaseDecisionService();
		}
		return ReleaseDecisionService.instance;
	}

	// --------------------------------------------------------------------------
	// Movie Decisions
	// --------------------------------------------------------------------------

	/**
	 * Evaluate a release for a movie
	 */
	async evaluateForMovie(
		movieId: string,
		release: ReleaseInfo,
		options: DecisionOptions = {}
	): Promise<ReleaseDecisionResult> {
		logger.debug('[ReleaseDecision] Evaluating release for movie', {
			movieId,
			release: release.title
		});

		try {
			// Fetch movie with profile
			const movie = await db.query.movies.findFirst({
				where: eq(movies.id, movieId),
				with: { scoringProfile: true }
			});

			if (!movie) {
				return this.createRejectedResult('Movie not found', 'movie_not_found');
			}

			// Check blocklist (skip when forced)
			if (!options.force && !options.skipBlocklist) {
				const blocklistResult = await this.checkBlocklist(release, { movieId });
				if (!blocklistResult.accepted) {
					return blocklistResult;
				}
			}

			// Fetch existing file
			const existingFile = await db.query.movieFiles.findFirst({
				where: eq(movieFiles.movieId, movieId)
			});

			// Get profile (use movie's profile, fallback to default)
			const profile = await this.getEffectiveProfile(movie.scoringProfileId);
			if (!profile) {
				return this.createRejectedResult('No quality profile configured', 'no_profile');
			}

			// If no existing file, this is a new download
			if (!existingFile) {
				// Skip score validation when forced
				if (!options.force) {
					// Score the release to ensure it meets minimum requirements
					const fullProfile = getProfile(profile.id);
					if (fullProfile) {
						const scoreResult = scoreRelease(
							release.title,
							fullProfile as ScoringProfile,
							undefined,
							release.size,
							{
								mediaType: 'movie'
							}
						);

						if (scoreResult.isBanned) {
							return this.createRejectedResult(
								`Release banned: ${scoreResult.bannedReasons.join(', ')}`,
								'banned'
							);
						}

						if (scoreResult.sizeRejected) {
							return this.createRejectedResult(
								scoreResult.sizeRejectionReason || 'Size rejected',
								'size_rejected'
							);
						}

						if (!scoreResult.meetsMinimum) {
							return this.createRejectedResult('Release below minimum score', 'below_minimum');
						}
					}
				}

				return this.createAcceptedResult('new', 'No existing file - new download', {
					candidateScore: undefined,
					isUpgrade: false
				});
			}

			// Existing file found - this is an upgrade scenario
			// Check if this is literally the same release (same torrent hash)
			if (existingFile.infoHash && release.infoHash) {
				if (existingFile.infoHash.toLowerCase() === release.infoHash.toLowerCase()) {
					return this.createRejectedResult(
						'Same release already downloaded (matching torrent hash)',
						'same_hash',
						'rejected'
					);
				}
			}

			// When forced, skip validation but still mark as upgrade so old file gets replaced
			if (options.force) {
				return this.createAcceptedResult('upgrade', 'Force override - replacing existing file', {
					isUpgrade: true
				});
			}

			// Check if upgrades are allowed
			if (!profile.upgradesAllowed) {
				return this.createRejectedResult(
					'Upgrades not allowed by profile',
					'upgrades_not_allowed',
					'rejected'
				);
			}

			// Evaluate upgrade
			return await this.evaluateUpgrade(
				existingFile.sceneName || existingFile.relativePath,
				release,
				profile,
				'movie',
				options
			);
		} catch (error) {
			logger.error('[ReleaseDecision] Error evaluating movie release', { error, movieId });
			return this.createRejectedResult(
				error instanceof Error ? error.message : 'Unknown error',
				'error'
			);
		}
	}

	// --------------------------------------------------------------------------
	// Episode Decisions
	// --------------------------------------------------------------------------

	/**
	 * Evaluate a release for a single episode
	 */
	async evaluateForEpisode(
		episodeId: string,
		release: ReleaseInfo,
		options: DecisionOptions = {}
	): Promise<ReleaseDecisionResult> {
		logger.debug('[ReleaseDecision] Evaluating release for episode', {
			episodeId,
			release: release.title
		});

		try {
			// Fetch episode with series and profile
			const episode = await db.query.episodes.findFirst({
				where: eq(episodes.id, episodeId),
				with: {
					series: {
						with: { scoringProfile: true }
					}
				}
			});

			if (!episode || !episode.series) {
				return this.createRejectedResult('Episode not found', 'episode_not_found');
			}

			// Check blocklist (skip when forced)
			if (!options.force && !options.skipBlocklist) {
				const blocklistResult = await this.checkBlocklist(release, {
					seriesId: episode.seriesId
				});
				if (!blocklistResult.accepted) {
					return blocklistResult;
				}
			}

			// Get profile
			const profile = await this.getEffectiveProfile(episode.series.scoringProfileId);
			if (!profile) {
				return this.createRejectedResult('No quality profile configured', 'no_profile');
			}

			// Find existing file for this episode
			const existingFile = await this.findEpisodeFile(episodeId, episode.seriesId);

			// If no existing file, new download
			if (!existingFile) {
				// Skip score validation when forced
				if (!options.force) {
					// Score the release to ensure it meets minimum requirements
					const fullProfile = getProfile(profile.id);
					if (fullProfile) {
						const scoreResult = scoreRelease(
							release.title,
							fullProfile as ScoringProfile,
							undefined,
							release.size,
							{
								mediaType: 'tv',
								isSeasonPack: false
							}
						);

						if (scoreResult.isBanned) {
							return this.createRejectedResult(
								`Release banned: ${scoreResult.bannedReasons.join(', ')}`,
								'banned'
							);
						}

						if (scoreResult.sizeRejected) {
							return this.createRejectedResult(
								scoreResult.sizeRejectionReason || 'Size rejected',
								'size_rejected'
							);
						}

						if (!scoreResult.meetsMinimum) {
							return this.createRejectedResult('Release below minimum score', 'below_minimum');
						}
					}
				}

				return this.createAcceptedResult('new', 'No existing file - new download', {
					isUpgrade: false
				});
			}

			// Existing file found - this is an upgrade scenario
			// Check if this is literally the same release (same torrent hash)
			if (existingFile.infoHash && release.infoHash) {
				if (existingFile.infoHash.toLowerCase() === release.infoHash.toLowerCase()) {
					return this.createRejectedResult(
						'Same release already downloaded (matching torrent hash)',
						'same_hash',
						'rejected'
					);
				}
			}

			// When forced, skip validation but still mark as upgrade so old file gets replaced
			if (options.force) {
				return this.createAcceptedResult('upgrade', 'Force override - replacing existing file', {
					isUpgrade: true
				});
			}

			// Check if upgrades allowed
			if (!profile.upgradesAllowed) {
				return this.createRejectedResult(
					'Upgrades not allowed by profile',
					'upgrades_not_allowed',
					'rejected'
				);
			}

			// Evaluate upgrade
			return await this.evaluateUpgrade(
				existingFile.sceneName || existingFile.relativePath,
				release,
				profile,
				'tv',
				options
			);
		} catch (error) {
			logger.error('[ReleaseDecision] Error evaluating episode release', { error, episodeId });
			return this.createRejectedResult(
				error instanceof Error ? error.message : 'Unknown error',
				'error'
			);
		}
	}

	// --------------------------------------------------------------------------
	// Season Decisions
	// --------------------------------------------------------------------------

	/**
	 * Evaluate a release for a season (season pack)
	 * Uses majority benefit rule - accept if more episodes benefit than are harmed
	 */
	async evaluateForSeason(
		seriesId: string,
		seasonNumber: number,
		release: ReleaseInfo,
		options: DecisionOptions = {}
	): Promise<ReleaseDecisionResult> {
		logger.debug('[ReleaseDecision] Evaluating release for season', {
			seriesId,
			seasonNumber,
			release: release.title
		});

		try {
			// Fetch series with profile
			const seriesData = await db.query.series.findFirst({
				where: eq(series.id, seriesId),
				with: { scoringProfile: true }
			});

			if (!seriesData) {
				return this.createRejectedResult('Series not found', 'series_not_found');
			}

			// Check blocklist (skip when forced)
			if (!options.force && !options.skipBlocklist) {
				const blocklistResult = await this.checkBlocklist(release, { seriesId });
				if (!blocklistResult.accepted) {
					return blocklistResult;
				}
			}

			// Fetch all episodes in the season
			const seasonEpisodes = await db.query.episodes.findMany({
				where: and(eq(episodes.seriesId, seriesId), eq(episodes.seasonNumber, seasonNumber))
			});

			if (seasonEpisodes.length === 0) {
				return this.createRejectedResult('No episodes found in season', 'no_episodes');
			}

			// Get profile
			const profile = await this.getEffectiveProfile(seriesData.scoringProfileId);
			if (!profile) {
				return this.createRejectedResult('No quality profile configured', 'no_profile');
			}

			// Fetch existing files for all episodes
			const episodeIds = seasonEpisodes.map((ep) => ep.id);
			const existingFiles = await this.findEpisodeFilesForEpisodes(episodeIds, seriesId);
			const existingFileMap = new Map(existingFiles.map((f) => [f.episodeIds?.[0], f]));

			// Check if there are existing files (for upgrade detection)
			const hasExistingFiles = existingFiles.length > 0;

			// When forced with existing files, skip validation but mark as upgrade
			if (options.force) {
				const stats: UpgradeStats = {
					improved: hasExistingFiles ? existingFiles.length : 0,
					unchanged: 0,
					downgraded: 0,
					newEpisodes: seasonEpisodes.length - existingFiles.length,
					total: seasonEpisodes.length
				};

				if (hasExistingFiles) {
					return this.createAcceptedResult('upgrade', 'Force override - replacing existing files', {
						upgradeStats: stats,
						isUpgrade: true
					});
				} else {
					return this.createAcceptedResult('new', 'Force override - new season pack', {
						upgradeStats: stats,
						isUpgrade: false
					});
				}
			}

			// Get full profile for scoring
			const fullProfile = getProfile(profile.id);
			if (!fullProfile) {
				return this.createRejectedResult('Profile not found', 'no_profile');
			}

			// Score the candidate release (as season pack)
			const candidateScore = scoreRelease(
				release.title,
				fullProfile as ScoringProfile,
				undefined,
				release.size,
				{
					mediaType: 'tv',
					isSeasonPack: true,
					episodeCount: seasonEpisodes.length
				}
			);

			// Check if banned or size rejected
			if (candidateScore.isBanned) {
				return this.createRejectedResult(
					`Release banned: ${candidateScore.bannedReasons.join(', ')}`,
					'banned'
				);
			}

			if (candidateScore.sizeRejected) {
				return this.createRejectedResult(
					candidateScore.sizeRejectionReason || 'Size rejected',
					'size_rejected'
				);
			}

			// Calculate upgrade stats for each episode
			const stats: UpgradeStats = {
				improved: 0,
				unchanged: 0,
				downgraded: 0,
				newEpisodes: 0,
				total: seasonEpisodes.length
			};

			for (const episode of seasonEpisodes) {
				const existingFile = existingFileMap.get(episode.id);

				if (!existingFile) {
					stats.newEpisodes++;
					continue;
				}

				const existingFileName = existingFile.sceneName || existingFile.relativePath;
				const comparison = isUpgrade(
					existingFileName,
					release.title,
					fullProfile as ScoringProfile,
					{
						minimumImprovement: profile.minScoreIncrement || 0,
						allowSidegrade: options.allowSidegrade ?? false
					}
				);

				if (comparison.isUpgrade) {
					stats.improved++;
				} else if (comparison.improvement === 0) {
					stats.unchanged++;
				} else {
					stats.downgraded++;
				}
			}

			// Determine overall decision using majority benefit rule
			// Accept if: (improved + newEpisodes) > downgraded
			const netBenefit = stats.improved + stats.newEpisodes - stats.downgraded;
			const hasExistingFilesForDecision = stats.total > stats.newEpisodes;

			logger.debug('[ReleaseDecision] Season pack stats', {
				seriesId,
				seasonNumber,
				stats,
				netBenefit,
				hasExistingFiles: hasExistingFilesForDecision
			});

			// If no existing files, this is all new content
			if (!hasExistingFilesForDecision) {
				if (!candidateScore.meetsMinimum) {
					return this.createRejectedResult('Release below minimum score', 'below_minimum');
				}
				return this.createAcceptedResult('new', 'Season pack - all new episodes', {
					upgradeStats: stats,
					candidateScore: candidateScore.totalScore,
					isUpgrade: false
				});
			}

			// Check if upgrades allowed
			if (!profile.upgradesAllowed && stats.improved > 0) {
				return this.createRejectedResult(
					'Upgrades not allowed by profile',
					'upgrades_not_allowed',
					'rejected',
					stats
				);
			}

			// Apply majority benefit rule
			if (netBenefit <= 0) {
				return this.createRejectedResult(
					`Season pack would not improve quality (${stats.improved} improved, ${stats.downgraded} downgraded, ${stats.newEpisodes} new)`,
					'no_net_benefit',
					'downgrade',
					stats
				);
			}

			// Accept - net positive benefit
			const upgradeStatus: UpgradeStatus =
				stats.downgraded > 0 ? 'sidegrade' : stats.improved > 0 ? 'upgrade' : 'new';

			return this.createAcceptedResult(
				upgradeStatus,
				`Season pack benefits ${stats.improved + stats.newEpisodes}/${stats.total} episodes`,
				{
					upgradeStats: stats,
					candidateScore: candidateScore.totalScore,
					isUpgrade: stats.improved > 0
				}
			);
		} catch (error) {
			logger.error('[ReleaseDecision] Error evaluating season release', {
				error,
				seriesId,
				seasonNumber
			});
			return this.createRejectedResult(
				error instanceof Error ? error.message : 'Unknown error',
				'error'
			);
		}
	}

	// --------------------------------------------------------------------------
	// Series Decisions (for multi-season packs or series-wide releases)
	// --------------------------------------------------------------------------

	/**
	 * Evaluate a release for an entire series
	 * Aggregates across all seasons
	 */
	async evaluateForSeries(
		seriesId: string,
		release: ReleaseInfo,
		options: DecisionOptions = {}
	): Promise<ReleaseDecisionResult> {
		logger.debug('[ReleaseDecision] Evaluating release for series', {
			seriesId,
			release: release.title
		});

		try {
			// Fetch series with profile
			const seriesData = await db.query.series.findFirst({
				where: eq(series.id, seriesId),
				with: { scoringProfile: true }
			});

			if (!seriesData) {
				return this.createRejectedResult('Series not found', 'series_not_found');
			}

			// Check blocklist (skip when forced)
			if (!options.force && !options.skipBlocklist) {
				const blocklistResult = await this.checkBlocklist(release, { seriesId });
				if (!blocklistResult.accepted) {
					return blocklistResult;
				}
			}

			// Fetch ALL episodes in the series
			const allEpisodes = await db.query.episodes.findMany({
				where: eq(episodes.seriesId, seriesId)
			});

			if (allEpisodes.length === 0) {
				return this.createRejectedResult('No episodes found in series', 'no_episodes');
			}

			// Get profile
			const profile = await this.getEffectiveProfile(seriesData.scoringProfileId);
			if (!profile) {
				return this.createRejectedResult('No quality profile configured', 'no_profile');
			}

			// Fetch all existing files
			const episodeIds = allEpisodes.map((ep) => ep.id);
			const existingFiles = await this.findEpisodeFilesForEpisodes(episodeIds, seriesId);
			const existingFileMap = new Map<string, (typeof existingFiles)[0]>();
			for (const file of existingFiles) {
				for (const epId of file.episodeIds || []) {
					existingFileMap.set(epId, file);
				}
			}

			// Check if there are existing files (for upgrade detection)
			const hasExistingFiles = existingFiles.length > 0;

			// When forced with existing files, skip validation but mark as upgrade
			if (options.force) {
				const stats: UpgradeStats = {
					improved: hasExistingFiles ? existingFiles.length : 0,
					unchanged: 0,
					downgraded: 0,
					newEpisodes: allEpisodes.length - existingFiles.length,
					total: allEpisodes.length
				};

				if (hasExistingFiles) {
					return this.createAcceptedResult('upgrade', 'Force override - replacing existing files', {
						upgradeStats: stats,
						isUpgrade: true
					});
				} else {
					return this.createAcceptedResult('new', 'Force override - new series pack', {
						upgradeStats: stats,
						isUpgrade: false
					});
				}
			}

			// Get full profile for scoring
			const fullProfile = getProfile(profile.id);
			if (!fullProfile) {
				return this.createRejectedResult('Profile not found', 'no_profile');
			}

			// Score candidate (estimate based on total episodes)
			const candidateScore = scoreRelease(
				release.title,
				fullProfile as ScoringProfile,
				undefined,
				release.size,
				{
					mediaType: 'tv',
					isSeasonPack: true,
					episodeCount: allEpisodes.length
				}
			);

			if (candidateScore.isBanned) {
				return this.createRejectedResult(
					`Release banned: ${candidateScore.bannedReasons.join(', ')}`,
					'banned'
				);
			}

			if (candidateScore.sizeRejected) {
				return this.createRejectedResult(
					candidateScore.sizeRejectionReason || 'Size rejected',
					'size_rejected'
				);
			}

			// Calculate stats
			const stats: UpgradeStats = {
				improved: 0,
				unchanged: 0,
				downgraded: 0,
				newEpisodes: 0,
				total: allEpisodes.length
			};

			for (const episode of allEpisodes) {
				const existingFile = existingFileMap.get(episode.id);

				if (!existingFile) {
					stats.newEpisodes++;
					continue;
				}

				const existingFileName = existingFile.sceneName || existingFile.relativePath;
				const comparison = isUpgrade(
					existingFileName,
					release.title,
					fullProfile as ScoringProfile,
					{
						minimumImprovement: profile.minScoreIncrement || 0,
						allowSidegrade: options.allowSidegrade ?? false
					}
				);

				if (comparison.isUpgrade) {
					stats.improved++;
				} else if (comparison.improvement === 0) {
					stats.unchanged++;
				} else {
					stats.downgraded++;
				}
			}

			// Apply majority benefit rule
			const netBenefit = stats.improved + stats.newEpisodes - stats.downgraded;
			const hasExistingFilesForDecision = stats.total > stats.newEpisodes;

			if (!hasExistingFilesForDecision) {
				if (!candidateScore.meetsMinimum) {
					return this.createRejectedResult('Release below minimum score', 'below_minimum');
				}
				return this.createAcceptedResult('new', 'Series pack - all new episodes', {
					upgradeStats: stats,
					candidateScore: candidateScore.totalScore,
					isUpgrade: false
				});
			}

			if (!profile.upgradesAllowed && stats.improved > 0) {
				return this.createRejectedResult(
					'Upgrades not allowed by profile',
					'upgrades_not_allowed',
					'rejected',
					stats
				);
			}

			if (netBenefit <= 0) {
				return this.createRejectedResult(
					`Series pack would not improve quality (${stats.improved} improved, ${stats.downgraded} downgraded, ${stats.newEpisodes} new)`,
					'no_net_benefit',
					'downgrade',
					stats
				);
			}

			const upgradeStatus: UpgradeStatus =
				stats.downgraded > 0 ? 'sidegrade' : stats.improved > 0 ? 'upgrade' : 'new';

			return this.createAcceptedResult(
				upgradeStatus,
				`Series pack benefits ${stats.improved + stats.newEpisodes}/${stats.total} episodes`,
				{
					upgradeStats: stats,
					candidateScore: candidateScore.totalScore,
					isUpgrade: stats.improved > 0
				}
			);
		} catch (error) {
			logger.error('[ReleaseDecision] Error evaluating series release', { error, seriesId });
			return this.createRejectedResult(
				error instanceof Error ? error.message : 'Unknown error',
				'error'
			);
		}
	}

	// --------------------------------------------------------------------------
	// Bulk Episode Decisions
	// --------------------------------------------------------------------------

	/**
	 * Evaluate a release for multiple specific episodes
	 * Used when grabbing a release that covers selected episodes
	 */
	async evaluateForEpisodes(
		episodeIds: string[],
		release: ReleaseInfo,
		options: DecisionOptions = {}
	): Promise<ReleaseDecisionResult> {
		logger.debug('[ReleaseDecision] Evaluating release for episodes', {
			episodeCount: episodeIds.length,
			release: release.title
		});

		if (options.force) {
			return this.createAcceptedResult('new', 'Force override enabled');
		}

		if (episodeIds.length === 0) {
			return this.createRejectedResult('No episodes specified', 'no_episodes');
		}

		// For single episode, use the simpler method
		if (episodeIds.length === 1) {
			return this.evaluateForEpisode(episodeIds[0], release, options);
		}

		try {
			// Fetch episodes with series
			const targetEpisodes = await db.query.episodes.findMany({
				where: inArray(episodes.id, episodeIds),
				with: {
					series: {
						with: { scoringProfile: true }
					}
				}
			});

			if (targetEpisodes.length === 0) {
				return this.createRejectedResult('Episodes not found', 'episodes_not_found');
			}

			// All episodes should be from same series
			const seriesId = targetEpisodes[0].seriesId;
			const seriesData = targetEpisodes[0].series;

			if (!seriesData) {
				return this.createRejectedResult('Series not found', 'series_not_found');
			}

			// Check blocklist
			if (!options.skipBlocklist) {
				const blocklistResult = await this.checkBlocklist(release, { seriesId });
				if (!blocklistResult.accepted) {
					return blocklistResult;
				}
			}

			// Get profile
			const profile = await this.getEffectiveProfile(seriesData.scoringProfileId);
			if (!profile) {
				return this.createRejectedResult('No quality profile configured', 'no_profile');
			}

			// Fetch existing files
			const existingFiles = await this.findEpisodeFilesForEpisodes(episodeIds, seriesId);
			const existingFileMap = new Map<string, (typeof existingFiles)[0]>();
			for (const file of existingFiles) {
				for (const epId of file.episodeIds || []) {
					existingFileMap.set(epId, file);
				}
			}

			// Get full profile
			const fullProfile = getProfile(profile.id);
			if (!fullProfile) {
				return this.createRejectedResult('Profile not found', 'no_profile');
			}

			// Score candidate
			const isMultiEp = targetEpisodes.length > 1;
			const candidateScore = scoreRelease(
				release.title,
				fullProfile as ScoringProfile,
				undefined,
				release.size,
				{
					mediaType: 'tv',
					isSeasonPack: isMultiEp,
					episodeCount: targetEpisodes.length
				}
			);

			if (candidateScore.isBanned) {
				return this.createRejectedResult(
					`Release banned: ${candidateScore.bannedReasons.join(', ')}`,
					'banned'
				);
			}

			if (candidateScore.sizeRejected) {
				return this.createRejectedResult(
					candidateScore.sizeRejectionReason || 'Size rejected',
					'size_rejected'
				);
			}

			// Calculate stats
			const stats: UpgradeStats = {
				improved: 0,
				unchanged: 0,
				downgraded: 0,
				newEpisodes: 0,
				total: targetEpisodes.length
			};

			for (const episode of targetEpisodes) {
				const existingFile = existingFileMap.get(episode.id);

				if (!existingFile) {
					stats.newEpisodes++;
					continue;
				}

				const existingFileName = existingFile.sceneName || existingFile.relativePath;
				const comparison = isUpgrade(
					existingFileName,
					release.title,
					fullProfile as ScoringProfile,
					{
						minimumImprovement: profile.minScoreIncrement || 0,
						allowSidegrade: options.allowSidegrade ?? false
					}
				);

				if (comparison.isUpgrade) {
					stats.improved++;
				} else if (comparison.improvement === 0) {
					stats.unchanged++;
				} else {
					stats.downgraded++;
				}
			}

			// Apply majority benefit rule
			const netBenefit = stats.improved + stats.newEpisodes - stats.downgraded;
			const hasExistingFiles = stats.total > stats.newEpisodes;

			if (!hasExistingFiles) {
				if (!candidateScore.meetsMinimum) {
					return this.createRejectedResult('Release below minimum score', 'below_minimum');
				}
				return this.createAcceptedResult('new', 'Multi-episode - all new', {
					upgradeStats: stats,
					candidateScore: candidateScore.totalScore,
					isUpgrade: false
				});
			}

			if (!profile.upgradesAllowed && stats.improved > 0) {
				return this.createRejectedResult(
					'Upgrades not allowed by profile',
					'upgrades_not_allowed',
					'rejected',
					stats
				);
			}

			if (netBenefit <= 0) {
				return this.createRejectedResult(
					`Release would not improve quality (${stats.improved} improved, ${stats.downgraded} downgraded)`,
					'no_net_benefit',
					'downgrade',
					stats
				);
			}

			const upgradeStatus: UpgradeStatus =
				stats.downgraded > 0 ? 'sidegrade' : stats.improved > 0 ? 'upgrade' : 'new';

			return this.createAcceptedResult(
				upgradeStatus,
				`Release benefits ${stats.improved + stats.newEpisodes}/${stats.total} episodes`,
				{
					upgradeStats: stats,
					candidateScore: candidateScore.totalScore,
					isUpgrade: stats.improved > 0
				}
			);
		} catch (error) {
			logger.error('[ReleaseDecision] Error evaluating episodes release', {
				error,
				episodeIds
			});
			return this.createRejectedResult(
				error instanceof Error ? error.message : 'Unknown error',
				'error'
			);
		}
	}

	// --------------------------------------------------------------------------
	// Helper Methods
	// --------------------------------------------------------------------------

	/**
	 * Check if release is blocklisted
	 */
	private async checkBlocklist(
		release: ReleaseInfo,
		context: { movieId?: string; seriesId?: string }
	): Promise<ReleaseDecisionResult> {
		const blocklistSpec = new ReleaseBlocklistSpecification(context);
		const candidate: ReleaseCandidate = {
			title: release.title,
			score: 0,
			size: release.size,
			infoHash: release.infoHash,
			indexerId: release.indexerId,
			downloadUrl: release.downloadUrl,
			magnetUrl: release.magnetUrl
		};

		const result = await blocklistSpec.isSatisfied(candidate);

		if (!result.accepted) {
			return {
				accepted: false,
				reason: result.reason || 'Release is blocklisted',
				rejectionType: 'blocklisted',
				isUpgrade: false,
				upgradeStatus: 'blocked'
			};
		}

		return { accepted: true, isUpgrade: false, upgradeStatus: 'new' };
	}

	/**
	 * Evaluate if a release is an upgrade over existing file
	 */
	private async evaluateUpgrade(
		existingFileName: string,
		release: ReleaseInfo,
		profile: typeof scoringProfiles.$inferSelect,
		mediaType: 'movie' | 'tv',
		options: DecisionOptions
	): Promise<ReleaseDecisionResult> {
		const fullProfile = getProfile(profile.id);
		if (!fullProfile) {
			return this.createRejectedResult('Profile not found', 'no_profile');
		}

		// Score both releases
		const comparison = isUpgrade(existingFileName, release.title, fullProfile as ScoringProfile, {
			minimumImprovement: profile.minScoreIncrement || 0,
			allowSidegrade: options.allowSidegrade ?? false,
			candidateSizeBytes: release.size
		});

		// Log detailed upgrade comparison
		logger.debug('[ReleaseDecision] Upgrade comparison result', {
			existingFile: existingFileName,
			candidateRelease: release.title,
			existingScore: comparison.existing.totalScore,
			candidateScore: comparison.candidate.totalScore,
			improvement: comparison.improvement,
			isUpgrade: comparison.isUpgrade,
			candidateMeetsMinimum: comparison.candidate.meetsMinimum,
			candidateIsBanned: comparison.candidate.isBanned,
			candidateSizeRejected: comparison.candidate.sizeRejected,
			minScoreIncrement: profile.minScoreIncrement
		});

		// Check if candidate passes basic requirements
		if (comparison.candidate.isBanned) {
			return this.createRejectedResult(
				`Release banned: ${comparison.candidate.bannedReasons.join(', ')}`,
				'banned'
			);
		}

		if (comparison.candidate.sizeRejected) {
			return this.createRejectedResult(
				comparison.candidate.sizeRejectionReason || 'Size rejected',
				'size_rejected'
			);
		}

		// Determine upgrade status
		let upgradeStatus: UpgradeStatus;
		if (comparison.improvement > 0) {
			upgradeStatus = 'upgrade';
		} else if (comparison.improvement === 0) {
			upgradeStatus = 'sidegrade';
		} else {
			upgradeStatus = 'downgrade';
		}

		// Check if it qualifies as an upgrade
		if (!comparison.isUpgrade) {
			// Determine specific reason
			if (comparison.improvement <= 0) {
				return this.createRejectedResult(
					'Release is not better quality',
					'quality_not_better',
					upgradeStatus
				);
			}
			if (comparison.improvement < (profile.minScoreIncrement || 0)) {
				return this.createRejectedResult(
					`Score improvement (${comparison.improvement}) below minimum increment (${profile.minScoreIncrement})`,
					'improvement_too_small',
					upgradeStatus
				);
			}
			return this.createRejectedResult(
				'Release does not qualify as upgrade',
				'not_upgrade',
				upgradeStatus
			);
		}

		// Note: upgradeUntilScore cutoff is only used by CutoffUnmetSpecification to decide
		// whether to SEARCH for upgrades, not to reject candidates that are found.
		// Once we're evaluating releases, we want the best one available.

		return this.createAcceptedResult(upgradeStatus, 'Release qualifies as upgrade', {
			candidateScore: comparison.candidate.totalScore,
			existingScore: comparison.existing.totalScore,
			scoreImprovement: comparison.improvement,
			isUpgrade: true
		});
	}

	/**
	 * Get effective profile (media's profile or default)
	 * Falls back gracefully: specified profile -> default profile -> first available profile
	 */
	private async getEffectiveProfile(
		profileId: string | null | undefined
	): Promise<typeof scoringProfiles.$inferSelect | null> {
		if (profileId) {
			const profile = await db.query.scoringProfiles.findFirst({
				where: eq(scoringProfiles.id, profileId)
			});
			if (profile) return profile;

			// Profile ID specified but not found - log warning and fall through
			logger.warn('Specified profile not found, falling back', { profileId });
		}

		// Get default profile
		const defaultProfile = await db.query.scoringProfiles.findFirst({
			where: eq(scoringProfiles.isDefault, true)
		});

		if (defaultProfile) return defaultProfile;

		// No default set - fall back to first available profile
		const anyProfile = await db.query.scoringProfiles.findFirst();
		if (anyProfile) {
			logger.warn('No default profile set, using first available', { profileId: anyProfile.id });
		}

		return anyProfile || null;
	}

	/**
	 * Find episode file for a specific episode
	 */
	private async findEpisodeFile(
		episodeId: string,
		seriesId: string
	): Promise<typeof episodeFiles.$inferSelect | null> {
		// Filter by seriesId first to avoid full-table scan, then check episodeIds array
		const files = await db.query.episodeFiles.findMany({
			where: eq(episodeFiles.seriesId, seriesId)
		});

		for (const file of files) {
			if (file.episodeIds?.includes(episodeId)) {
				return file;
			}
		}

		return null;
	}

	/**
	 * Find episode files for multiple episodes
	 */
	private async findEpisodeFilesForEpisodes(
		episodeIds: string[],
		seriesId: string
	): Promise<Array<typeof episodeFiles.$inferSelect>> {
		// Filter by seriesId first to avoid full-table scan, then filter by episodeIds
		const files = await db.query.episodeFiles.findMany({
			where: eq(episodeFiles.seriesId, seriesId)
		});

		return files.filter((file) => file.episodeIds?.some((epId) => episodeIds.includes(epId)));
	}

	/**
	 * Create accepted result
	 */
	private createAcceptedResult(
		upgradeStatus: UpgradeStatus,
		reason?: string,
		extras?: {
			upgradeStats?: UpgradeStats;
			candidateScore?: number;
			existingScore?: number;
			scoreImprovement?: number;
			isUpgrade?: boolean;
		}
	): ReleaseDecisionResult {
		return {
			accepted: true,
			reason,
			isUpgrade: extras?.isUpgrade ?? upgradeStatus === 'upgrade',
			upgradeStatus,
			upgradeStats: extras?.upgradeStats,
			candidateScore: extras?.candidateScore,
			existingScore: extras?.existingScore,
			scoreImprovement: extras?.scoreImprovement
		};
	}

	/**
	 * Create rejected result
	 */
	private createRejectedResult(
		reason: string,
		rejectionType: string,
		upgradeStatus: UpgradeStatus = 'rejected',
		upgradeStats?: UpgradeStats
	): ReleaseDecisionResult {
		return {
			accepted: false,
			reason,
			rejectionType,
			isUpgrade: false,
			upgradeStatus,
			upgradeStats
		};
	}
}

// Export singleton instance
export const releaseDecisionService = ReleaseDecisionService.getInstance();

// Export class for testing
export { ReleaseDecisionService };
