/**
 * Video Object Pattern - Based on Bazarr/Subliminal architecture
 *
 * Rich video representations that carry all metadata needed for subtitle matching.
 * Replaces flat SubtitleSearchCriteria with type-safe Movie/Episode classes.
 */

import type { LanguageCode } from './types';

/**
 * Video source types (where the video was obtained from)
 */
export type VideoSource =
	| 'BluRay'
	| 'Web'
	| 'HDTV'
	| 'DVD'
	| 'VHS'
	| 'CAM'
	| 'Screener'
	| 'PDTV'
	| 'DVB'
	| 'VOD'
	| 'unknown';

/**
 * Video resolution
 */
export type VideoResolution =
	'2160p' | '1080p' | '1080i' | '720p' | '576p' | '480p' | '360p' | 'unknown';

/**
 * Video codec
 */
export type VideoCodec =
	'H.265' | 'H.264' | 'MPEG-4' | 'MPEG-2' | 'XviD' | 'DivX' | 'VC-1' | 'VP9' | 'AV1' | 'unknown';

/**
 * Audio codec
 */
export type AudioCodec =
	| 'DTS-HD MA'
	| 'DTS-HD'
	| 'DTS'
	| 'TrueHD'
	| 'Dolby Atmos'
	| 'DD+'
	| 'DD'
	| 'AAC'
	| 'FLAC'
	| 'MP3'
	| 'PCM'
	| 'Opus'
	| 'unknown';

/**
 * Streaming service
 */
export type StreamingService =
	| 'Netflix'
	| 'Amazon Prime'
	| 'Disney+'
	| 'Apple TV+'
	| 'HBO Max'
	| 'Hulu'
	| 'Peacock'
	| 'Paramount+'
	| 'Crunchyroll'
	| 'Funimation'
	| 'unknown';

/**
 * Guessit-style hints for parsing assistance
 */
export interface VideoHints {
	type?: 'movie' | 'episode';
	title?: string;
	year?: number;
	season?: number;
	episode?: number;
	releaseGroup?: string;
	country?: string;
}

/**
 * Base Video class - common properties for all video types
 *
 * Based on Bazarr's subliminal_patch/video.py Video class
 */
export abstract class Video {
	/** Original file path */
	readonly originalPath: string;

	/** Resolved/absolute file path */
	readonly name: string;

	/** File size in bytes */
	size?: number;

	/** Video hash for OpenSubtitles matching */
	hashes: VideoHashes = {};

	// Release information (from guessit parsing)
	releaseGroup?: string;
	source?: VideoSource;
	resolution?: VideoResolution;
	videoCodec?: VideoCodec;
	audioCodec?: AudioCodec;
	streamingService?: StreamingService;
	edition?: string;

	// Technical metadata
	fps?: number;

	// Language information
	audioLanguages: LanguageCode[] = [];
	externalSubtitleLanguages: LanguageCode[] = [];

	// Parsing hints
	hints?: VideoHints;

	// Special content flag
	isSpecial = false;

	// External metadata URLs
	infoUrl?: string;

	constructor(name: string, originalPath?: string) {
		this.name = name;
		this.originalPath = originalPath ?? name;
	}

	/**
	 * Video type discriminator
	 */
	abstract get type(): 'movie' | 'episode';

	/**
	 * Create a Video from search criteria (backwards compatibility)
	 */
	static fromCriteria(criteria: VideoFromCriteriaParams): Video {
		if (criteria.type === 'episode' || criteria.season !== undefined) {
			return Episode.fromCriteria(criteria);
		}
		return Movie.fromCriteria(criteria);
	}

	/**
	 * Convert to flat criteria format (backwards compatibility)
	 */
	abstract toCriteria(): VideoToCriteriaResult;
}

/**
 * Video hashes for different providers
 */
export interface VideoHashes {
	opensubtitles?: string;
	napiprojekt?: string;
	shooter?: string;
	thesubdb?: string;
}

/**
 * Parameters for creating Video from criteria
 */
export interface VideoFromCriteriaParams {
	type: 'movie' | 'episode';
	filePath?: string;
	fileSize?: number;
	videoHash?: string;
	title: string;
	originalTitle?: string;
	year?: number;
	imdbId?: string;
	tmdbId?: number;
	// Episode-specific
	seriesTitle?: string;
	season?: number;
	episode?: number;
	episodeTitle?: string;
	// Anime IDs
	anidbId?: number;
	anidbEpisodeId?: number;
	anilistId?: number;
}

/**
 * Result type for toCriteria conversion
 */
export interface VideoToCriteriaResult {
	filePath?: string;
	fileSize?: number;
	videoHash?: string;
	title: string;
	originalTitle?: string;
	year?: number;
	imdbId?: string;
	tmdbId?: number;
	seriesTitle?: string;
	season?: number;
	episode?: number;
	episodeTitle?: string;
}

/**
 * Movie class - represents a feature film
 *
 * Based on Bazarr's subliminal_patch/video.py Movie class
 */
export class Movie extends Video {
	/** Movie title */
	title: string;

	/** Alternative/original title */
	alternativeTitles: string[] = [];

	/** Release year */
	year?: number;

	/** IMDB ID (e.g., 'tt1234567') */
	imdbId?: string;

	/** TMDB ID */
	tmdbId?: number;

	constructor(name: string, title: string, options: MovieOptions = {}) {
		super(name, options.originalPath);
		this.title = title;
		this.year = options.year;
		this.imdbId = options.imdbId;
		this.tmdbId = options.tmdbId;
		if (options.alternativeTitles) {
			this.alternativeTitles = options.alternativeTitles;
		}
		// Set hash if provided
		if (options.videoHash) {
			this.hashes.opensubtitles = options.videoHash;
		}
		this.size = options.fileSize;
	}

	get type(): 'movie' {
		return 'movie';
	}

	/**
	 * Create Movie from flat criteria
	 */
	static fromCriteria(criteria: VideoFromCriteriaParams): Movie {
		const movie = new Movie(criteria.filePath ?? criteria.title, criteria.title, {
			originalPath: criteria.filePath,
			year: criteria.year,
			imdbId: criteria.imdbId,
			tmdbId: criteria.tmdbId,
			videoHash: criteria.videoHash,
			fileSize: criteria.fileSize,
			alternativeTitles: criteria.originalTitle ? [criteria.originalTitle] : undefined
		});
		return movie;
	}

	toCriteria(): VideoToCriteriaResult {
		return {
			filePath: this.originalPath,
			fileSize: this.size,
			videoHash: this.hashes.opensubtitles,
			title: this.title,
			originalTitle: this.alternativeTitles[0],
			year: this.year,
			imdbId: this.imdbId,
			tmdbId: this.tmdbId
		};
	}
}

/**
 * Movie constructor options
 */
export interface MovieOptions {
	originalPath?: string;
	year?: number;
	imdbId?: string;
	tmdbId?: number;
	alternativeTitles?: string[];
	videoHash?: string;
	fileSize?: number;
}

/**
 * Episode class - represents a TV episode
 *
 * Based on Bazarr's subliminal_patch/video.py Episode class
 */
export class Episode extends Video {
	/** Series/show title */
	series: string;

	/** Alternative series titles */
	alternativeSeries: string[] = [];

	/** Season number */
	season: number;

	/** Episode number(s) - can be multiple for double episodes */
	episode: number | number[];

	/** Episode title */
	title?: string;

	/** Year the series started */
	year?: number;

	/** Original air date */
	originalAirDate?: Date;

	/** IMDB ID for the series */
	seriesImdbId?: string;

	/** IMDB ID for this specific episode */
	imdbId?: string;

	/** TMDB ID for the series */
	seriesTmdbId?: number;

	/** TVDB ID for the series */
	tvdbId?: number;

	// Anime-specific IDs
	anidbSeriesId?: number;
	anidbEpisodeId?: number;
	anilistId?: number;

	/** Whether the entire season has fully aired */
	seasonFullyAired?: boolean;

	constructor(
		name: string,
		series: string,
		season: number,
		episode: number | number[],
		options: EpisodeOptions = {}
	) {
		super(name, options.originalPath);
		this.series = series;
		this.season = season;
		this.episode = episode;
		this.title = options.title;
		this.year = options.year;
		this.seriesImdbId = options.seriesImdbId;
		this.imdbId = options.imdbId;
		this.seriesTmdbId = options.seriesTmdbId;
		this.tvdbId = options.tvdbId;
		this.anidbSeriesId = options.anidbSeriesId;
		this.anidbEpisodeId = options.anidbEpisodeId;
		this.anilistId = options.anilistId;
		if (options.alternativeSeries) {
			this.alternativeSeries = options.alternativeSeries;
		}
		// Set hash if provided
		if (options.videoHash) {
			this.hashes.opensubtitles = options.videoHash;
		}
		this.size = options.fileSize;
	}

	get type(): 'episode' {
		return 'episode';
	}

	/**
	 * Get primary episode number (first if multiple)
	 */
	get primaryEpisode(): number {
		return Array.isArray(this.episode) ? this.episode[0] : this.episode;
	}

	/**
	 * Check if this is a multi-episode file
	 */
	get isMultiEpisode(): boolean {
		return Array.isArray(this.episode) && this.episode.length > 1;
	}

	/**
	 * Create Episode from flat criteria
	 */
	static fromCriteria(criteria: VideoFromCriteriaParams): Episode {
		const episode = new Episode(
			criteria.filePath ?? criteria.title,
			criteria.seriesTitle ?? criteria.title,
			criteria.season ?? 1,
			criteria.episode ?? 1,
			{
				originalPath: criteria.filePath,
				title: criteria.episodeTitle,
				year: criteria.year,
				seriesImdbId: criteria.imdbId,
				seriesTmdbId: criteria.tmdbId,
				videoHash: criteria.videoHash,
				fileSize: criteria.fileSize,
				anidbSeriesId: criteria.anidbId,
				anidbEpisodeId: criteria.anidbEpisodeId,
				anilistId: criteria.anilistId
			}
		);
		return episode;
	}

	toCriteria(): VideoToCriteriaResult {
		return {
			filePath: this.originalPath,
			fileSize: this.size,
			videoHash: this.hashes.opensubtitles,
			title: this.title ?? this.series,
			seriesTitle: this.series,
			year: this.year,
			imdbId: this.seriesImdbId,
			tmdbId: this.seriesTmdbId,
			season: this.season,
			episode: this.primaryEpisode,
			episodeTitle: this.title
		};
	}
}

/**
 * Episode constructor options
 */
export interface EpisodeOptions {
	originalPath?: string;
	title?: string;
	year?: number;
	seriesImdbId?: string;
	imdbId?: string;
	seriesTmdbId?: number;
	tvdbId?: number;
	alternativeSeries?: string[];
	videoHash?: string;
	fileSize?: number;
	// Anime IDs
	anidbSeriesId?: number;
	anidbEpisodeId?: number;
	anilistId?: number;
}

/**
 * Type guard: Check if video is a Movie
 */
export function isMovie(video: Video): video is Movie {
	return video.type === 'movie';
}

/**
 * Type guard: Check if video is an Episode
 */
export function isEpisode(video: Video): video is Episode {
	return video.type === 'episode';
}
