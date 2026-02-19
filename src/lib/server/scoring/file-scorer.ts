/**
 * File Scorer
 *
 * Computes scores for existing files in the library.
 * Used to display score visibility in the UI and determine upgrade eligibility.
 */

import { db } from '../db/index.js';
import { movies, movieFiles, series, episodes, episodeFiles } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { scoreRelease, parseRelease } from './scorer.js';
import { buildExistingAttrs, type ExistingFileRecord } from '../monitoring/specifications/utils.js';
import { QualityFilter } from '../quality/QualityFilter.js';
import type { ScoringProfile, ScoringResult, ReleaseAttributes } from './types.js';
import { BALANCED_PROFILE } from './profiles.js';

const qualityFilter = new QualityFilter();

/**
 * Normalize a raw score to 0-1000 range for comparison with search results.
 * Uses the same tiered approach as QualityFilter.normalizeScore.
 */
function normalizeScore(score: number): number {
	if (score === -Infinity) return 0;
	if (score === Infinity) return 1000;
	if (score <= 0) return 0;

	const tierBoundaries = {
		lowQuality: 2000,
		basicQuality: 5000,
		goodQuality: 10000,
		greatQuality: 15000,
		bestQuality: 25000
	};

	let normalized: number;

	if (score <= tierBoundaries.lowQuality) {
		normalized = (score / tierBoundaries.lowQuality) * 200;
	} else if (score <= tierBoundaries.basicQuality) {
		const rangeScore = score - tierBoundaries.lowQuality;
		const rangeSize = tierBoundaries.basicQuality - tierBoundaries.lowQuality;
		normalized = 200 + (rangeScore / rangeSize) * 200;
	} else if (score <= tierBoundaries.goodQuality) {
		const rangeScore = score - tierBoundaries.basicQuality;
		const rangeSize = tierBoundaries.goodQuality - tierBoundaries.basicQuality;
		normalized = 400 + (rangeScore / rangeSize) * 200;
	} else if (score <= tierBoundaries.greatQuality) {
		const rangeScore = score - tierBoundaries.goodQuality;
		const rangeSize = tierBoundaries.greatQuality - tierBoundaries.goodQuality;
		normalized = 600 + (rangeScore / rangeSize) * 200;
	} else if (score <= tierBoundaries.bestQuality) {
		const rangeScore = score - tierBoundaries.greatQuality;
		const rangeSize = tierBoundaries.bestQuality - tierBoundaries.greatQuality;
		normalized = 800 + (rangeScore / rangeSize) * 150;
	} else {
		const excess = score - tierBoundaries.bestQuality;
		const logBonus = Math.log10(excess / 1000 + 1) * 10;
		normalized = 950 + Math.min(50, logBonus);
	}

	return Math.round(normalized);
}

/**
 * Upgrade status for a file
 */
export interface UpgradeStatus {
	/** Whether upgrades are allowed for this profile */
	upgradesAllowed: boolean;
	/** Score threshold (kept for display purposes, but no longer enforced as hard stop) */
	upgradeUntilScore: number;
	/** Current file's score */
	currentScore: number;
	/**
	 * Whether file is at or above cutoff threshold
	 * NOTE: This is now informational only - cutoffs are no longer enforced as hard stops.
	 * Upgrades will still be searched for and grabbed if they provide meaningful improvement.
	 */
	isAtCutoff: boolean;
	/** Whether file meets minimum score threshold */
	meetsMinimum: boolean;
	/** Minimum improvement needed for upgrade */
	minScoreIncrement: number;
}

/**
 * Profile information for display
 */
export interface ProfileInfo {
	id: string;
	name: string;
	minScore: number;
	minScoreIncrement: number;
	upgradeUntilScore: number;
}

/**
 * Complete score result for an existing file
 */
export interface FileScoreResult {
	/** File ID */
	fileId: string;
	/** File name/path for display */
	fileName: string;
	/** Scene name if available */
	sceneName: string | null;
	/** Full scoring result from the engine */
	scoringResult: ScoringResult;
	/** Normalized score (0-1000) for comparison with search results */
	normalizedScore: number;
	/** Upgrade eligibility status */
	upgradeStatus: UpgradeStatus;
	/** Profile information */
	profileInfo: ProfileInfo;
	/** Detected attributes from the file */
	attributes: ReleaseAttributes;
	/** Where quality data came from */
	dataSource: 'stored' | 'parsed';
}

/**
 * Compute score for a movie's primary file
 */
export async function computeMovieFileScore(movieId: string): Promise<FileScoreResult | null> {
	// Fetch movie with its files
	const movie = await db
		.select({
			id: movies.id,
			title: movies.title,
			scoringProfileId: movies.scoringProfileId
		})
		.from(movies)
		.where(eq(movies.id, movieId))
		.get();

	if (!movie) {
		return null;
	}

	// Get the movie's files
	const files = await db.select().from(movieFiles).where(eq(movieFiles.movieId, movieId)).all();

	if (files.length === 0) {
		return null;
	}

	// Use the first file (primary file)
	const file = files[0];

	// Get the scoring profile
	const profile = await getProfileForMedia(movie.scoringProfileId);

	// Build attributes from the file
	const fileRecord: ExistingFileRecord = {
		sceneName: file.sceneName,
		relativePath: file.relativePath,
		quality: file.quality,
		releaseGroup: file.releaseGroup
	};

	const existingAttrs = buildExistingAttrs(fileRecord);
	const dataSource: 'stored' | 'parsed' = existingAttrs ? 'stored' : 'parsed';

	// Get the release name for scoring
	const releaseName = file.sceneName || file.relativePath;

	// Score the release
	const scoringResult = scoreRelease(releaseName, profile, existingAttrs, file.size ?? undefined, {
		mediaType: 'movie'
	});

	// Calculate upgrade status
	const upgradeStatus = calculateUpgradeStatus(scoringResult, profile);

	// Get the final attributes (either from stored data or parsed)
	const attributes = existingAttrs ?? parseRelease(releaseName);

	return {
		fileId: file.id,
		fileName: file.relativePath,
		sceneName: file.sceneName ?? null,
		scoringResult,
		normalizedScore: normalizeScore(scoringResult.totalScore),
		upgradeStatus,
		profileInfo: {
			id: profile.id,
			name: profile.name,
			minScore: profile.minScore ?? 0,
			minScoreIncrement: profile.minScoreIncrement ?? 0,
			upgradeUntilScore: profile.upgradeUntilScore ?? -1
		},
		attributes,
		dataSource
	};
}

/**
 * Compute score for an episode's file
 */
export async function computeEpisodeFileScore(episodeId: string): Promise<FileScoreResult | null> {
	// Fetch the episode with its series
	const episode = await db
		.select({
			id: episodes.id,
			seriesId: episodes.seriesId,
			seasonNumber: episodes.seasonNumber,
			episodeNumber: episodes.episodeNumber,
			title: episodes.title
		})
		.from(episodes)
		.where(eq(episodes.id, episodeId))
		.get();

	if (!episode) {
		return null;
	}

	// Get the series for the profile
	const seriesRecord = await db
		.select({
			id: series.id,
			scoringProfileId: series.scoringProfileId
		})
		.from(series)
		.where(eq(series.id, episode.seriesId))
		.get();

	if (!seriesRecord) {
		return null;
	}

	// Find the file for this episode
	const files = await db
		.select()
		.from(episodeFiles)
		.where(eq(episodeFiles.seriesId, episode.seriesId))
		.all();

	// Find the file that contains this episode
	const file = files.find((f) => {
		const episodeIds = f.episodeIds ?? [];
		return episodeIds.includes(episodeId);
	});

	if (!file) {
		return null;
	}

	// Get the scoring profile
	const profile = await getProfileForMedia(seriesRecord.scoringProfileId);

	// Build attributes from the file
	const fileRecord: ExistingFileRecord = {
		sceneName: file.sceneName,
		relativePath: file.relativePath,
		quality: file.quality,
		releaseGroup: file.releaseGroup
	};

	const existingAttrs = buildExistingAttrs(fileRecord);
	const dataSource: 'stored' | 'parsed' = existingAttrs ? 'stored' : 'parsed';

	// Get the release name for scoring
	const releaseName = file.sceneName || file.relativePath;

	// Score the release
	const scoringResult = scoreRelease(releaseName, profile, existingAttrs, file.size ?? undefined, {
		mediaType: 'tv'
	});

	// Calculate upgrade status
	const upgradeStatus = calculateUpgradeStatus(scoringResult, profile);

	// Get the final attributes
	const attributes = existingAttrs ?? parseRelease(releaseName);

	return {
		fileId: file.id,
		fileName: file.relativePath,
		sceneName: file.sceneName ?? null,
		scoringResult,
		normalizedScore: normalizeScore(scoringResult.totalScore),
		upgradeStatus,
		profileInfo: {
			id: profile.id,
			name: profile.name,
			minScore: profile.minScore ?? 0,
			minScoreIncrement: profile.minScoreIncrement ?? 0,
			upgradeUntilScore: profile.upgradeUntilScore ?? -1
		},
		attributes,
		dataSource
	};
}

/**
 * Get the scoring profile for a media item
 */
async function getProfileForMedia(scoringProfileId: string | null): Promise<ScoringProfile> {
	if (scoringProfileId) {
		const profile = await qualityFilter.getProfile(scoringProfileId);
		if (profile) {
			return profile;
		}
	}

	// Fall back to balanced profile
	return BALANCED_PROFILE;
}

/**
 * Calculate upgrade status from scoring result and profile
 *
 * NOTE: isAtCutoff is now informational only - hard cutoffs have been removed.
 * Upgrades will always be searched for as long as upgradesAllowed is true.
 * The minScoreIncrement ensures only meaningful improvements are grabbed.
 */
function calculateUpgradeStatus(
	scoringResult: ScoringResult,
	profile: ScoringProfile
): UpgradeStatus {
	const currentScore = scoringResult.totalScore;
	const upgradeUntilScore = profile.upgradeUntilScore ?? -1;

	// Calculate if at threshold for informational/display purposes only
	// This no longer prevents upgrade searching - it's just a visual indicator
	const isAtCutoff = upgradeUntilScore > 0 && currentScore >= upgradeUntilScore;

	return {
		upgradesAllowed: profile.upgradesAllowed ?? true,
		upgradeUntilScore,
		currentScore,
		isAtCutoff,
		meetsMinimum: scoringResult.meetsMinimum,
		minScoreIncrement: profile.minScoreIncrement ?? 0
	};
}
