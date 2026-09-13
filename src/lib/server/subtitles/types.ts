/**
 * Subtitle Management System - Core Types
 */

import type { LanguageTag } from '$lib/shared/languages.js';

/**
 * Canonical language code.
 * @see $lib/shared/languages for the single language registry.
 */
export type LanguageCode = LanguageTag;

/** Subtitle file format */
export type SubtitleFormat = 'srt' | 'ass' | 'sub' | 'vtt' | 'ssa' | 'unknown';

/**
 * All supported provider implementations.
 * This is the single source of truth - add new providers here.
 */
export const PROVIDER_IMPLEMENTATIONS = [
	'opensubtitles',
	'opensubtitlesorg',
	'podnapisi',
	'addic7ed',
	'subdl',
	'yifysubtitles',
	'gestdown',
	'subf2m',
	'supersubtitles',
	// Regional providers
	'napiprojekt',
	'legendasdivx',
	'betaseries',
	'assrt'
] as const;

/** Provider implementation type (derived from the const array) */
export type ProviderImplementation = (typeof PROVIDER_IMPLEMENTATIONS)[number];

/** Sync options for alass */
export interface SyncOptionsType {
	referenceType?: 'video' | 'subtitle';
	referencePath?: string;
	splitPenalty?: number;
	noSplits?: boolean;
}

/** Subtitle history action types */
export type SubtitleAction =
	'downloaded' | 'deleted' | 'synced' | 'upgraded' | 'manual_upload' | 'discovered';

/** Blacklist reason types */
export type BlacklistReason = 'wrong_content' | 'out_of_sync' | 'poor_quality' | 'manual';

/**
 * Search criteria for subtitle lookup
 */
export interface SubtitleSearchCriteria {
	// Video file info (when available)
	filePath?: string;
	fileSize?: number;
	videoHash?: string; // OpenSubtitles hash
	fps?: number; // Video frame rate

	// Media identification
	imdbId?: string;
	tmdbId?: number;
	tvdbId?: number; // For TV show lookups
	title: string;
	originalTitle?: string;
	year?: number;

	// For TV episodes
	seriesTitle?: string;
	season?: number;
	episode?: number;
	episodeTitle?: string;

	// Language preferences
	languages: LanguageCode[];

	// Filters
	includeForced?: boolean;
	includeHearingImpaired?: boolean;
	excludeHearingImpaired?: boolean;
}

/**
 * Score breakdown for a subtitle match
 */
export interface SubtitleScoreBreakdown {
	hashMatch: number;
	titleMatch: number;
	yearMatch: number;
	releaseGroupMatch: number;
	sourceMatch: number;
	codecMatch: number;
	hiPenalty: number;
	forcedBonus: number;
}

/**
 * Result from a subtitle search
 */
export interface SubtitleSearchResult {
	// Provider info
	providerId: string;
	providerName: string;
	providerSubtitleId: string;

	// Basic info
	language: LanguageCode;
	title: string;
	releaseName?: string;
	fileName?: string;

	// Subtitle properties
	isForced: boolean;
	isHearingImpaired: boolean;
	format: SubtitleFormat;

	// Scoring
	isHashMatch: boolean;
	matchScore: number;
	scoreBreakdown?: SubtitleScoreBreakdown;

	// Download info
	downloadUrl?: string;
	downloadCount?: number;
	rating?: number;
	uploadDate?: string;
	uploader?: string;
	pageLink?: string; // Link to subtitle page on provider

	// File info
	fileSize?: number;

	// Originating movie file when this result came from a per-file search.
	// Wired into SubtitleDownloadService as a fallback target when no explicit
	// movieFileId option is supplied.
	movieFileId?: string;
}

/**
 * Provider configuration from database
 */
export interface SubtitleProviderConfig {
	id: string;
	name: string;
	implementation: ProviderImplementation;
	enabled: boolean;
	priority: number;
	apiKey?: string;
	username?: string;
	password?: string;
	settings?: Record<string, unknown>;
	requestsPerMinute: number;
	// Health tracking
	lastError?: string;
	lastErrorAt?: string;
	consecutiveFailures: number;
	throttledUntil?: string;
}

/**
 * Provider search options
 */
export interface ProviderSearchOptions {
	maxResults?: number;
	timeout?: number;
}

/**
 * Aggregated search result across providers
 */
export interface AggregatedSearchResult {
	results: SubtitleSearchResult[];
	totalResults: number;
	searchTimeMs: number;
	providerResults: Array<{
		providerId: string;
		providerName: string;
		resultCount: number;
		error?: string;
		searchTimeMs: number;
	}>;
}

/**
 * Result from downloading a subtitle
 */
export interface SubtitleDownloadResult {
	subtitleId: string;
	path: string;
	language: LanguageCode;
	format: SubtitleFormat;
	wasSynced: boolean;
	syncOffset: number | null;
	wasUpgrade: boolean;
	replacedSubtitleId?: string;
}

/**
 * Subtitle status for a media item
 */
export interface SubtitleStatus {
	satisfied: boolean;
	missing: Array<{
		code: LanguageCode;
		forced: boolean;
		hearingImpaired: boolean;
	}>;
	existing: Array<{
		language: LanguageCode;
		subtitleId: string;
		isForced: boolean;
		isHearingImpaired: boolean;
		matchScore?: number;
	}>;
}

/**
 * Sync result from alass
 */
export interface SubtitleSyncResult {
	success: boolean;
	offsetMs: number;
	error?: string;
}

/**
 * Media context for subtitle operations
 */
export interface MediaContext {
	type: 'movie' | 'episode';
	id: string;
	title: string;
	year?: number;
	imdbId?: string;
	tmdbId?: number;
	// For episodes
	seriesId?: string;
	seriesTitle?: string;
	season?: number;
	episode?: number;
	// File info
	filePath?: string;
	fileSize?: number;
	rootFolderPath?: string;
}
