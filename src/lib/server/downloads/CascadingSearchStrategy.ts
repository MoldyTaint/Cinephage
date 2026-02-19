/**
 * CascadingSearchStrategy
 *
 * Provides smart episode searching that prioritizes season packs over individual episodes.
 * Uses a cascading approach:
 * 1. Group episodes by season
 * 2. Try season packs first for seasons with >= threshold missing (default 50%)
 * 3. Track grabbed episodes to skip duplicates
 * 4. Fall back to individual episode searches for remaining episodes
 *
 * This strategy is used by both SearchOnAdd (interactive) and MonitoringSearchService (automatic).
 */

import { getIndexerManager } from '$lib/server/indexers/IndexerManager.js';
import { getReleaseGrabService } from './ReleaseGrabService.js';
import {
	ReleaseBlocklistSpecification,
	type ReleaseCandidate
} from '$lib/server/monitoring/specifications/index.js';
import { scoreRelease } from '$lib/server/scoring/scorer.js';
import { qualityFilter } from '$lib/server/quality/index.js';
import { createChildLogger } from '$lib/logging';
import { db } from '$lib/server/db/index.js';
import { episodes } from '$lib/server/db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import type { SearchCriteria } from '$lib/server/indexers/types';
import type { ScoringProfile } from '$lib/server/scoring/types.js';

const logger = createChildLogger({ module: 'CascadingSearchStrategy' });

/**
 * Episode data needed for searching
 */
export interface EpisodeToSearch {
	id: string;
	seriesId: string;
	seasonNumber: number;
	episodeNumber: number;
	hasFile: boolean | null;
	monitored: boolean | null;
}

/**
 * Series data needed for searching
 */
export interface SeriesData {
	id: string;
	title: string;
	tmdbId: number;
	tvdbId?: number | null;
	imdbId?: string | null;
	scoringProfileId?: string | null;
}

/**
 * Result for a single episode search
 */
export interface EpisodeSearchResult {
	episodeId: string;
	episodeLabel: string; // e.g., "S01E05"
	searched: boolean;
	found: boolean;
	grabbed: boolean;
	releaseName?: string;
	queueItemId?: string;
	error?: string;
	/** Whether this episode was grabbed via a season pack */
	wasPackGrab?: boolean;
	/** If grabbed via pack, which season */
	packSeason?: number;
}

/**
 * Season pack grab details
 */
export interface SeasonPackGrab {
	seasonNumber: number;
	releaseName: string;
	episodesCovered: string[];
}

/**
 * Options for cascading search
 */
export interface CascadingSearchOptions {
	/** Series data */
	seriesData: SeriesData;
	/** Episodes to search for */
	episodes: EpisodeToSearch[];
	/** Scoring profile ID to use */
	scoringProfileId?: string;
	/** Search source: 'interactive' (manual) or 'automatic' (background) */
	searchSource: 'interactive' | 'automatic';
	/** Minimum percentage of season missing to try pack (default: 50) */
	seasonPackThreshold?: number;
	/** Minimum score for auto-grab (default: 0 = any passing release) */
	minScore?: number;
}

/**
 * Result of cascading search
 */
export interface CascadingSearchResult {
	/** Results for each episode */
	results: EpisodeSearchResult[];
	/** Season packs that were grabbed */
	seasonPacks: SeasonPackGrab[];
	/** Summary statistics */
	summary: {
		searched: number;
		found: number;
		grabbed: number;
		seasonPacksGrabbed: number;
		individualEpisodesGrabbed: number;
	};
	/** All episode IDs that were grabbed (including pack coverage) */
	grabbedEpisodeIds: Set<string>;
}

/**
 * Service for cascading episode searches
 */
class CascadingSearchStrategy {
	private readonly DEFAULT_PACK_THRESHOLD = 50; // 50%
	private readonly DEFAULT_MIN_SCORE = 0;

	/**
	 * Search for episodes using cascading strategy:
	 * 1. Group by season
	 * 2. Try season packs for seasons with high missing %
	 * 3. Search remaining episodes individually
	 */
	async searchEpisodes(options: CascadingSearchOptions): Promise<CascadingSearchResult> {
		const {
			seriesData,
			episodes: episodesToSearch,
			scoringProfileId,
			searchSource,
			seasonPackThreshold = this.DEFAULT_PACK_THRESHOLD,
			minScore = this.DEFAULT_MIN_SCORE
		} = options;

		logger.info('[CascadingSearch] Starting cascading search', {
			seriesId: seriesData.id,
			title: seriesData.title,
			episodeCount: episodesToSearch.length,
			threshold: seasonPackThreshold,
			searchSource
		});

		const results: EpisodeSearchResult[] = [];
		const seasonPacks: SeasonPackGrab[] = [];
		const grabbedEpisodeIds = new Set<string>();

		// Group episodes by season
		const episodesBySeason = this.groupEpisodesBySeason(episodesToSearch);

		// Get total episode counts for each season
		const seasonTotalCounts = await this.getSeasonTotalCounts(
			seriesData.id,
			Array.from(episodesBySeason.keys())
		);

		// Load scoring profile if provided
		let profile: ScoringProfile | undefined;
		if (scoringProfileId) {
			profile = (await qualityFilter.getProfile(scoringProfileId)) ?? undefined;
		}

		// Phase 1: Try season packs for seasons with high missing %
		for (const [seasonNumber, seasonEpisodes] of episodesBySeason) {
			const totalInSeason = seasonTotalCounts.get(seasonNumber) ?? seasonEpisodes.length;
			const missingPercent = (seasonEpisodes.length / totalInSeason) * 100;

			logger.debug('[CascadingSearch] Analyzing season for pack search', {
				seriesTitle: seriesData.title,
				season: seasonNumber,
				missingEpisodes: seasonEpisodes.length,
				totalEpisodes: totalInSeason,
				missingPercent: missingPercent.toFixed(1),
				threshold: seasonPackThreshold
			});

			// Skip if less than threshold missing
			if (missingPercent < seasonPackThreshold) {
				logger.debug('[CascadingSearch] Skipping season pack search - not enough missing', {
					seriesTitle: seriesData.title,
					season: seasonNumber,
					missingPercent: missingPercent.toFixed(1)
				});
				continue;
			}

			// Try season pack search
			const packResult = await this.searchAndGrabSeasonPack({
				seriesData,
				seasonNumber,
				seasonEpisodes,
				totalEpisodes: totalInSeason,
				scoringProfileId,
				profile,
				searchSource,
				minScore
			});

			if (packResult.grabbed && packResult.episodesCovered) {
				// Mark all covered episodes as grabbed
				for (const epId of packResult.episodesCovered) {
					grabbedEpisodeIds.add(epId);
				}

				seasonPacks.push({
					seasonNumber,
					releaseName: packResult.releaseName || 'Unknown',
					episodesCovered: packResult.episodesCovered
				});

				logger.info('[CascadingSearch] Season pack grabbed successfully', {
					seriesTitle: seriesData.title,
					season: seasonNumber,
					releaseName: packResult.releaseName,
					episodesCovered: packResult.episodesCovered.length
				});

				// Add results for episodes covered by pack
				for (const ep of seasonEpisodes) {
					if (packResult.episodesCovered.includes(ep.id)) {
						results.push({
							episodeId: ep.id,
							episodeLabel: this.formatEpisodeLabel(ep.seasonNumber, ep.episodeNumber),
							searched: true,
							found: true,
							grabbed: true,
							releaseName: packResult.releaseName,
							queueItemId: packResult.queueItemId,
							wasPackGrab: true,
							packSeason: seasonNumber
						});
					}
				}
			} else {
				logger.debug('[CascadingSearch] No suitable season pack found', {
					seriesTitle: seriesData.title,
					season: seasonNumber,
					error: packResult.error
				});
			}

			// Rate limiting between season searches
			await this.delay(500);
		}

		// Phase 2: Search remaining episodes individually
		for (const [, seasonEpisodes] of episodesBySeason) {
			for (const episode of seasonEpisodes) {
				// Skip if already grabbed via pack
				if (grabbedEpisodeIds.has(episode.id)) {
					continue;
				}

				const episodeLabel = this.formatEpisodeLabel(episode.seasonNumber, episode.episodeNumber);

				logger.debug('[CascadingSearch] Searching for individual episode', {
					seriesTitle: seriesData.title,
					episode: episodeLabel
				});

				const episodeResult = await this.searchAndGrabEpisode({
					seriesData,
					episode,
					scoringProfileId,
					profile,
					searchSource,
					minScore
				});

				results.push({
					episodeId: episode.id,
					episodeLabel,
					searched: true,
					found: episodeResult.found,
					grabbed: episodeResult.grabbed,
					releaseName: episodeResult.releaseName,
					queueItemId: episodeResult.queueItemId,
					error: episodeResult.error,
					wasPackGrab: episodeResult.wasPackGrab,
					packSeason: episodeResult.packSeason
				});

				if (episodeResult.grabbed) {
					grabbedEpisodeIds.add(episode.id);

					// If the individual search grabbed a pack, mark all episodes in that season
					if (episodeResult.wasPackGrab && episodeResult.episodesCovered) {
						for (const epId of episodeResult.episodesCovered) {
							grabbedEpisodeIds.add(epId);
						}

						// Add pack to list if not already there
						if (!seasonPacks.some((p) => p.releaseName === episodeResult.releaseName)) {
							seasonPacks.push({
								seasonNumber: episodeResult.packSeason || episode.seasonNumber,
								releaseName: episodeResult.releaseName || 'Unknown',
								episodesCovered: episodeResult.episodesCovered
							});
						}
					}
				}

				// Rate limiting between episode searches
				await this.delay(500);
			}
		}

		// Calculate summary
		const summary = {
			searched: results.filter((r) => r.searched).length,
			found: results.filter((r) => r.found).length,
			grabbed: results.filter((r) => r.grabbed).length,
			seasonPacksGrabbed: seasonPacks.length,
			individualEpisodesGrabbed: results.filter((r) => r.grabbed && !r.wasPackGrab).length
		};

		logger.info('[CascadingSearch] Cascading search completed', {
			seriesId: seriesData.id,
			title: seriesData.title,
			...summary
		});

		return {
			results,
			seasonPacks,
			summary,
			grabbedEpisodeIds
		};
	}

	/**
	 * Search for and grab a season pack
	 */
	private async searchAndGrabSeasonPack(options: {
		seriesData: SeriesData;
		seasonNumber: number;
		seasonEpisodes: EpisodeToSearch[];
		totalEpisodes: number;
		scoringProfileId?: string;
		profile?: ScoringProfile;
		searchSource: 'interactive' | 'automatic';
		minScore: number;
	}): Promise<{
		grabbed: boolean;
		releaseName?: string;
		queueItemId?: string;
		episodesCovered?: string[];
		error?: string;
	}> {
		const {
			seriesData,
			seasonNumber,
			seasonEpisodes,
			totalEpisodes,
			profile,
			searchSource,
			minScore
		} = options;

		const episodeIds = seasonEpisodes.map((e) => e.id);

		try {
			const indexerManager = await getIndexerManager();

			// Build search criteria - season only (no episode number) to get packs
			const criteria: SearchCriteria = {
				searchType: 'tv',
				query: seriesData.title,
				tmdbId: seriesData.tmdbId,
				tvdbId: seriesData.tvdbId ?? undefined,
				imdbId: seriesData.imdbId ?? undefined,
				season: seasonNumber
				// Note: No episode number - this will return season packs
			};

			// Perform enriched search
			const searchResult = await indexerManager.searchEnhanced(criteria, {
				searchSource,
				enrichment: {
					scoringProfileId: options.scoringProfileId,
					filterRejected: true,
					minScore,
					seasonEpisodeCount: totalEpisodes
				}
			});

			if (searchResult.releases.length === 0) {
				return { grabbed: false, error: 'No releases found' };
			}

			// Filter to only season packs
			const seasonPacks = searchResult.releases.filter((release) => {
				const isSeasonPack =
					release.parsed.episode?.isSeasonPack ?? release.episodeMatch?.isSeasonPack ?? false;
				const packSeasons = release.parsed.episode?.seasons ??
					release.episodeMatch?.seasons ?? [
						release.parsed.episode?.season ?? release.episodeMatch?.season
					];
				return isSeasonPack && packSeasons?.includes(seasonNumber);
			});

			if (seasonPacks.length === 0) {
				return { grabbed: false, error: 'No season packs found' };
			}

			// Find best non-blocklisted season pack
			const blocklistSpec = new ReleaseBlocklistSpecification({ seriesId: seriesData.id });

			for (const release of seasonPacks) {
				const releaseCandidate: ReleaseCandidate = {
					title: release.title,
					score: release.totalScore ?? 0,
					size: release.size,
					infoHash: release.infoHash
				};

				// Check blocklist
				const blocklistResult = await blocklistSpec.isSatisfied(releaseCandidate);
				if (!blocklistResult.accepted) {
					logger.debug('[CascadingSearch] Season pack blocklisted, trying next', {
						title: release.title,
						reason: blocklistResult.reason
					});
					continue;
				}

				// Validate release against scoring profile
				if (profile) {
					const scoreResult = scoreRelease(release.title, profile, undefined, release.size, {
						mediaType: 'tv',
						isSeasonPack: true,
						episodeCount: totalEpisodes
					});
					if (!scoreResult.meetsMinimum || scoreResult.isBanned || scoreResult.sizeRejected) {
						logger.debug('[CascadingSearch] Season pack rejected by scoring profile', {
							title: release.title,
							score: scoreResult.totalScore,
							reason: scoreResult.isBanned
								? 'banned'
								: scoreResult.sizeRejected
									? scoreResult.sizeRejectionReason
									: `score below minimum`
						});
						continue;
					}
				}

				// Found a valid season pack, grab it
				const grabService = getReleaseGrabService();
				const grabResult = await grabService.grabRelease(release, {
					mediaType: 'tv',
					seriesId: seriesData.id,
					episodeIds,
					seasonNumber,
					isAutomatic: searchSource === 'automatic'
				});

				if (grabResult.success) {
					return {
						grabbed: true,
						releaseName: grabResult.releaseName,
						queueItemId: grabResult.queueItemId,
						episodesCovered: grabResult.episodesCovered || episodeIds
					};
				}
			}

			return { grabbed: false, error: 'All season packs rejected or failed to grab' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return { grabbed: false, error: message };
		}
	}

	/**
	 * Search for and grab an individual episode
	 */
	private async searchAndGrabEpisode(options: {
		seriesData: SeriesData;
		episode: EpisodeToSearch;
		scoringProfileId?: string;
		profile?: ScoringProfile;
		searchSource: 'interactive' | 'automatic';
		minScore: number;
	}): Promise<{
		found: boolean;
		grabbed: boolean;
		releaseName?: string;
		queueItemId?: string;
		error?: string;
		wasPackGrab?: boolean;
		packSeason?: number;
		episodesCovered?: string[];
	}> {
		const { seriesData, episode, profile, searchSource, minScore } = options;

		try {
			const indexerManager = await getIndexerManager();

			// Build search criteria with season and episode
			const criteria: SearchCriteria = {
				searchType: 'tv',
				query: seriesData.title,
				tmdbId: seriesData.tmdbId,
				tvdbId: seriesData.tvdbId ?? undefined,
				imdbId: seriesData.imdbId ?? undefined,
				season: episode.seasonNumber,
				episode: episode.episodeNumber
			};

			// Get episode count for potential pack size validation
			const seasonEpisodeCount = await this.getSeasonTotalCount(
				seriesData.id,
				episode.seasonNumber
			);

			// Perform enriched search
			const searchResult = await indexerManager.searchEnhanced(criteria, {
				searchSource,
				enrichment: {
					scoringProfileId: options.scoringProfileId,
					filterRejected: true,
					minScore,
					seasonEpisodeCount
				}
			});

			if (searchResult.releases.length === 0) {
				return { found: false, grabbed: false, error: 'No releases found' };
			}

			// Find best non-blocklisted release
			const blocklistSpec = new ReleaseBlocklistSpecification({ seriesId: seriesData.id });

			for (const release of searchResult.releases) {
				const releaseCandidate: ReleaseCandidate = {
					title: release.title,
					score: release.totalScore ?? 0,
					size: release.size,
					infoHash: release.infoHash
				};

				// Check blocklist
				const blocklistResult = await blocklistSpec.isSatisfied(releaseCandidate);
				if (!blocklistResult.accepted) {
					logger.debug('[CascadingSearch] Release blocklisted, trying next', {
						title: release.title,
						reason: blocklistResult.reason
					});
					continue;
				}

				// Check if this is a season pack
				const isSeasonPack =
					release.parsed.episode?.isSeasonPack ?? release.episodeMatch?.isSeasonPack ?? false;

				// Validate release against scoring profile
				if (profile) {
					let episodeCount: number | undefined;
					if (isSeasonPack) {
						const releaseSeasons = release.parsed.episode?.seasons ?? release.episodeMatch?.seasons;
						const targetSeason = releaseSeasons?.[0] ?? episode.seasonNumber;
						episodeCount = await this.getSeasonTotalCount(seriesData.id, targetSeason);
					}

					const scoreResult = scoreRelease(release.title, profile, undefined, release.size, {
						mediaType: 'tv',
						isSeasonPack,
						episodeCount
					});
					if (!scoreResult.meetsMinimum || scoreResult.isBanned || scoreResult.sizeRejected) {
						logger.debug('[CascadingSearch] Release rejected by scoring profile', {
							title: release.title,
							score: scoreResult.totalScore,
							isSeasonPack
						});
						continue;
					}
				}

				// If this is a pack, get all episodes it would cover
				let episodesCovered: string[] | undefined;
				let packSeason: number | undefined;
				if (isSeasonPack) {
					packSeason =
						release.parsed.episode?.season ?? release.episodeMatch?.season ?? episode.seasonNumber;
					episodesCovered = await this.getSeasonEpisodeIds(seriesData.id, packSeason);
				}

				// Grab the release
				const grabService = getReleaseGrabService();
				const grabResult = await grabService.grabRelease(release, {
					mediaType: 'tv',
					seriesId: seriesData.id,
					episodeIds: isSeasonPack ? episodesCovered : [episode.id],
					seasonNumber: episode.seasonNumber,
					isAutomatic: searchSource === 'automatic'
				});

				if (grabResult.success) {
					return {
						found: true,
						grabbed: true,
						releaseName: grabResult.releaseName,
						queueItemId: grabResult.queueItemId,
						wasPackGrab: isSeasonPack,
						packSeason,
						episodesCovered: grabResult.episodesCovered
					};
				}
			}

			return { found: true, grabbed: false, error: 'All releases rejected or failed to grab' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return { found: false, grabbed: false, error: message };
		}
	}

	/**
	 * Group episodes by season number
	 */
	private groupEpisodesBySeason(
		episodesToSearch: EpisodeToSearch[]
	): Map<number, EpisodeToSearch[]> {
		const grouped = new Map<number, EpisodeToSearch[]>();

		for (const episode of episodesToSearch) {
			const existing = grouped.get(episode.seasonNumber) || [];
			existing.push(episode);
			grouped.set(episode.seasonNumber, existing);
		}

		return grouped;
	}

	/**
	 * Get total episode counts for multiple seasons
	 */
	private async getSeasonTotalCounts(
		seriesId: string,
		seasonNumbers: number[]
	): Promise<Map<number, number>> {
		const counts = new Map<number, number>();

		if (seasonNumbers.length === 0) return counts;

		const allEpisodes = await db.query.episodes.findMany({
			where: and(eq(episodes.seriesId, seriesId), inArray(episodes.seasonNumber, seasonNumbers)),
			columns: { seasonNumber: true }
		});

		for (const ep of allEpisodes) {
			counts.set(ep.seasonNumber, (counts.get(ep.seasonNumber) || 0) + 1);
		}

		return counts;
	}

	/**
	 * Get total episode count for a single season
	 */
	private async getSeasonTotalCount(seriesId: string, seasonNumber: number): Promise<number> {
		const seasonEpisodes = await db.query.episodes.findMany({
			where: and(eq(episodes.seriesId, seriesId), eq(episodes.seasonNumber, seasonNumber)),
			columns: { id: true }
		});
		return seasonEpisodes.length;
	}

	/**
	 * Get all episode IDs for a season
	 */
	private async getSeasonEpisodeIds(seriesId: string, seasonNumber: number): Promise<string[]> {
		const seasonEpisodes = await db.query.episodes.findMany({
			where: and(eq(episodes.seriesId, seriesId), eq(episodes.seasonNumber, seasonNumber)),
			columns: { id: true }
		});
		return seasonEpisodes.map((e) => e.id);
	}

	/**
	 * Format episode label (e.g., "S01E05")
	 */
	private formatEpisodeLabel(season: number, episode: number): string {
		return `S${season.toString().padStart(2, '0')}E${episode.toString().padStart(2, '0')}`;
	}

	/**
	 * Delay for rate limiting
	 */
	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

// Singleton instance
let strategyInstance: CascadingSearchStrategy | null = null;

/**
 * Get the CascadingSearchStrategy singleton
 */
export function getCascadingSearchStrategy(): CascadingSearchStrategy {
	if (!strategyInstance) {
		strategyInstance = new CascadingSearchStrategy();
	}
	return strategyInstance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetCascadingSearchStrategy(): void {
	strategyInstance = null;
}

// Also export the class for type usage
export { CascadingSearchStrategy };
