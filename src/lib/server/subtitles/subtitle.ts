/**
 * Subtitle Class - Based on Bazarr/Subliminal architecture
 *
 * Rich subtitle representation with get_matches() scoring, encoding handling,
 * and provider-specific subclasses.
 */

import { Language } from './language';
import { Video, isEpisode, isMovie } from './video';
import type { SubtitleFormat, LanguageCode } from './types';

/**
 * Match types for scoring
 */
export type MatchType =
	| 'hash'
	| 'title'
	| 'series'
	| 'year'
	| 'season'
	| 'episode'
	| 'release_group'
	| 'source'
	| 'resolution'
	| 'video_codec'
	| 'audio_codec'
	| 'streaming_service'
	| 'imdb_id'
	| 'tmdb_id'
	| 'tvdb_id';

/**
 * Base Subtitle class
 *
 * Based on Bazarr's subliminal_patch/subtitle.py Subtitle class.
 * Each provider extends this with its own subtitle type.
 */
export abstract class Subtitle {
	/** Provider name (e.g., 'opensubtitles', 'subdl') */
	abstract readonly providerName: string;

	/** Provider-specific subtitle ID */
	readonly id: string;

	/** Language of this subtitle */
	readonly language: Language;

	/** URL to the subtitle page on the provider */
	readonly pageLink?: string;

	// Provider capability flags
	/** Whether hash match can be verified by this provider */
	hashVerifiable = false;

	/** Whether HI status can be verified by this provider */
	hearingImpairedVerifiable = false;

	// Match tracking
	/** Set of match types found */
	matches: Set<MatchType> = new Set();

	// Release information
	/** Release name/group info for matching */
	releaseInfo?: string;

	/** Uploader name */
	uploader?: string;

	// Quality indicators
	/** Whether this is a hash-based match */
	isHashMatch = false;

	/** Whether this matched the wrong FPS */
	wrongFps = false;

	/** Skip if FPS doesn't match */
	skipWrongFps = true;

	/** Whether series didn't match (for episodes) */
	wrongSeries = false;

	/** Whether season/episode didn't match */
	wrongSeasonEpisode = false;

	// Pack support
	/** Whether this is a subtitle pack (multiple episodes) */
	isPack = false;

	/** Pack metadata */
	packData?: SubtitlePackData;

	// File information
	/** Original filename from provider */
	filename?: string;

	/** Subtitle format */
	format: SubtitleFormat = 'srt';

	/** File size in bytes */
	size?: number;

	/** Download count from provider */
	downloadCount?: number;

	/** User rating from provider */
	rating?: number;

	/** Upload date */
	uploadDate?: Date;

	// Encoding
	/** Detected encoding */
	private _encoding?: string;

	/** Guessed encoding (fallback) */
	private _guessedEncoding?: string;

	/** Whether format has been validated */
	private _isValid = false;

	// Content
	/** Raw subtitle content (after download) */
	private _content?: Buffer;

	/** Decoded text content */
	private _text?: string;

	/** Use original format (don't convert) */
	useOriginalFormat = false;

	// FPS tracking
	/** Expected video FPS */
	videoFps?: number;

	/** Subtitle's native FPS (if applicable) */
	subtitleFps?: number;

	// Storage
	/** Path where subtitle was stored */
	storagePath?: string;

	// Modifications applied
	mods?: string[];

	// For search request context
	/** Release group that was asked for */
	askedForReleaseGroup?: string;

	/** Episode number that was asked for */
	askedForEpisode?: number;

	constructor(id: string, language: Language, options: SubtitleOptions = {}) {
		this.id = id;
		this.language = language;
		this.pageLink = options.pageLink;
		this.releaseInfo = options.releaseInfo;
		this.filename = options.filename;
		this.uploader = options.uploader;
		this.downloadCount = options.downloadCount;
		this.rating = options.rating;
		this.uploadDate = options.uploadDate;
		this.format = options.format ?? 'srt';
	}

	/**
	 * Compute matches between this subtitle and a video
	 *
	 * This is the core matching logic - each provider subclass should override
	 * to provide provider-specific matching based on its data.
	 */
	abstract getMatches(video: Video): Set<MatchType>;

	/**
	 * Get content as Buffer
	 */
	get content(): Buffer | undefined {
		return this._content;
	}

	/**
	 * Set content from download
	 */
	set content(value: Buffer | undefined) {
		this._content = value;
		this._text = undefined; // Reset decoded text
		this._isValid = false;
	}

	/**
	 * Get decoded text content
	 */
	get text(): string | undefined {
		if (!this._text && this._content) {
			this._text = this.decodeContent();
		}
		return this._text;
	}

	/**
	 * Get encoding (detected or guessed)
	 */
	get encoding(): string {
		return this._encoding ?? this._guessedEncoding ?? 'utf-8';
	}

	/**
	 * Set explicit encoding
	 */
	set encoding(value: string) {
		this._encoding = value;
	}

	/**
	 * Check if subtitle content is valid
	 */
	get isValid(): boolean {
		return this._isValid;
	}

	/**
	 * Whether this is a forced subtitle
	 */
	get isForced(): boolean {
		return this.language.forced;
	}

	/**
	 * Whether this is for hearing impaired
	 */
	get isHearingImpaired(): boolean {
		return this.language.hi;
	}

	/**
	 * Decode content using detected/specified encoding
	 */
	protected decodeContent(): string | undefined {
		if (!this._content) return undefined;

		try {
			const decoder = new TextDecoder(this.encoding);
			return decoder.decode(this._content);
		} catch {
			// Fallback to UTF-8
			return new TextDecoder('utf-8').decode(this._content);
		}
	}

	/**
	 * Guess encoding from content
	 * (Placeholder - actual implementation in encoding.ts)
	 */
	guessEncoding(): string {
		// Will be replaced with chardet-based detection
		this._guessedEncoding = 'utf-8';
		return this._guessedEncoding;
	}

	/**
	 * Validate subtitle format
	 */
	validate(): boolean {
		if (!this._content) {
			this._isValid = false;
			return false;
		}

		const text = this.text;
		if (!text) {
			this._isValid = false;
			return false;
		}

		// Basic format validation
		switch (this.format) {
			case 'srt':
				this._isValid = this.validateSrt(text);
				break;
			case 'ass':
			case 'ssa':
				this._isValid = this.validateAss(text);
				break;
			case 'vtt':
				this._isValid = this.validateVtt(text);
				break;
			default:
				this._isValid = true; // Allow unknown formats
		}

		return this._isValid;
	}

	/**
	 * Validate SRT format
	 */
	private validateSrt(text: string): boolean {
		// Check for typical SRT patterns: sequence number, timestamp, text
		const srtPattern =
			/^\d+\s*\r?\n\d{1,2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,.]\d{3}/m;
		return srtPattern.test(text);
	}

	/**
	 * Validate ASS/SSA format
	 */
	private validateAss(text: string): boolean {
		return text.includes('[Script Info]') || text.includes('[Events]');
	}

	/**
	 * Validate VTT format
	 */
	private validateVtt(text: string): boolean {
		return text.startsWith('WEBVTT') || text.includes('WEBVTT');
	}

	/**
	 * Convert to legacy SubtitleSearchResult format (backwards compatibility)
	 */
	toSearchResult(): LegacySubtitleSearchResult {
		return {
			providerId: this.providerName,
			providerName: this.providerName,
			providerSubtitleId: this.id,
			language: this.language.code,
			title: this.filename ?? this.releaseInfo ?? 'Unknown',
			releaseName: this.releaseInfo,
			fileName: this.filename,
			isForced: this.isForced,
			isHearingImpaired: this.isHearingImpaired,
			format: this.format,
			isHashMatch: this.isHashMatch || this.matches.has('hash'),
			matchScore: 0, // Will be computed by scoring service
			downloadUrl: this.pageLink,
			downloadCount: this.downloadCount,
			rating: this.rating,
			uploadDate: this.uploadDate?.toISOString(),
			uploader: this.uploader,
			fileSize: this.size
		};
	}

	/**
	 * Helper: Compute common matches from video metadata
	 */
	protected computeCommonMatches(video: Video): Set<MatchType> {
		const matches = new Set<MatchType>();

		if (isMovie(video)) {
			// Movie matching
			if (this.matchesTitle(video.title, video.alternativeTitles)) {
				matches.add('title');
			}
			if (video.year && this.matchesYear(video.year)) {
				matches.add('year');
			}
			if (video.imdbId && this.matchesImdbId(video.imdbId)) {
				matches.add('imdb_id');
			}
			if (video.tmdbId && this.matchesTmdbId(video.tmdbId)) {
				matches.add('tmdb_id');
			}
		} else if (isEpisode(video)) {
			// Episode matching
			if (this.matchesSeries(video.series, video.alternativeSeries)) {
				matches.add('series');
			}
			if (video.year && this.matchesYear(video.year)) {
				matches.add('year');
			}
			if (this.matchesSeason(video.season)) {
				matches.add('season');
			}
			if (this.matchesEpisode(video.primaryEpisode)) {
				matches.add('episode');
			}
			if (video.seriesImdbId && this.matchesImdbId(video.seriesImdbId)) {
				matches.add('imdb_id');
			}
			if (video.seriesTmdbId && this.matchesTmdbId(video.seriesTmdbId)) {
				matches.add('tmdb_id');
			}
			if (video.tvdbId && this.matchesTvdbId(video.tvdbId)) {
				matches.add('tvdb_id');
			}
		}

		// Release info matching
		if (video.releaseGroup && this.matchesReleaseGroup(video.releaseGroup)) {
			matches.add('release_group');
		}
		if (video.source && this.matchesSource(video.source)) {
			matches.add('source');
		}
		if (video.resolution && this.matchesResolution(video.resolution)) {
			matches.add('resolution');
		}
		if (video.videoCodec && this.matchesVideoCodec(video.videoCodec)) {
			matches.add('video_codec');
		}
		if (video.audioCodec && this.matchesAudioCodec(video.audioCodec)) {
			matches.add('audio_codec');
		}
		if (video.streamingService && this.matchesStreamingService(video.streamingService)) {
			matches.add('streaming_service');
		}

		return matches;
	}

	// Override these in subclasses for provider-specific matching
	protected matchesTitle(title: string, alternatives: string[]): boolean {
		if (!this.releaseInfo) return false;
		const normalizedRelease = this.normalizeForMatching(this.releaseInfo);
		if (this.normalizeForMatching(title) === normalizedRelease) return true;
		return alternatives.some((alt) => this.normalizeForMatching(alt) === normalizedRelease);
	}

	protected matchesSeries(series: string, alternatives: string[]): boolean {
		if (!this.releaseInfo) return false;
		const normalizedRelease = this.normalizeForMatching(this.releaseInfo);
		if (normalizedRelease.includes(this.normalizeForMatching(series))) return true;
		return alternatives.some((alt) => normalizedRelease.includes(this.normalizeForMatching(alt)));
	}

	protected matchesYear(year: number): boolean {
		return this.releaseInfo?.includes(String(year)) ?? false;
	}

	protected matchesSeason(season: number): boolean {
		if (!this.releaseInfo) return false;
		const patterns = [
			new RegExp(`s${String(season).padStart(2, '0')}`, 'i'),
			new RegExp(`season\\s*${season}`, 'i')
		];
		return patterns.some((p) => p.test(this.releaseInfo!));
	}

	protected matchesEpisode(episode: number): boolean {
		if (!this.releaseInfo) return false;
		const patterns = [
			new RegExp(`e${String(episode).padStart(2, '0')}`, 'i'),
			new RegExp(`episode\\s*${episode}`, 'i')
		];
		return patterns.some((p) => p.test(this.releaseInfo!));
	}

	protected matchesImdbId(_imdbId: string): boolean {
		return false; // Override in subclass if provider returns IMDB ID
	}

	protected matchesTmdbId(_tmdbId: number): boolean {
		return false; // Override in subclass if provider returns TMDB ID
	}

	protected matchesTvdbId(_tvdbId: number): boolean {
		return false; // Override in subclass if provider returns TVDB ID
	}

	protected matchesReleaseGroup(releaseGroup: string): boolean {
		if (!this.releaseInfo) return false;
		return this.normalizeForMatching(this.releaseInfo).includes(
			this.normalizeForMatching(releaseGroup)
		);
	}

	protected matchesSource(source: string): boolean {
		if (!this.releaseInfo) return false;
		const normalizedRelease = this.releaseInfo.toLowerCase();
		const sourceVariants: Record<string, string[]> = {
			BluRay: ['bluray', 'blu-ray', 'bdrip', 'brrip'],
			Web: ['web', 'web-dl', 'webdl', 'webrip', 'web-rip'],
			HDTV: ['hdtv', 'pdtv', 'dsr', 'dvb'],
			DVD: ['dvd', 'dvdrip', 'dvdscr']
		};
		const variants = sourceVariants[source] ?? [source.toLowerCase()];
		return variants.some((v) => normalizedRelease.includes(v));
	}

	protected matchesResolution(resolution: string): boolean {
		if (!this.releaseInfo) return false;
		return this.releaseInfo.toLowerCase().includes(resolution.toLowerCase());
	}

	protected matchesVideoCodec(codec: string): boolean {
		if (!this.releaseInfo) return false;
		const codecVariants: Record<string, string[]> = {
			'H.265': ['hevc', 'h265', 'x265', 'h.265'],
			'H.264': ['avc', 'h264', 'x264', 'h.264']
		};
		const variants = codecVariants[codec] ?? [codec.toLowerCase()];
		return variants.some((v) => this.releaseInfo!.toLowerCase().includes(v));
	}

	protected matchesAudioCodec(codec: string): boolean {
		if (!this.releaseInfo) return false;
		const codecVariants: Record<string, string[]> = {
			'DTS-HD MA': ['dts-hd', 'dts-hdma', 'dtshd'],
			TrueHD: ['truehd', 'true-hd'],
			'DD+': ['ddp', 'dd+', 'dolby digital plus', 'eac3'],
			DD: ['dd', 'dolby digital', 'ac3']
		};
		const variants = codecVariants[codec] ?? [codec.toLowerCase()];
		return variants.some((v) => this.releaseInfo!.toLowerCase().includes(v));
	}

	protected matchesStreamingService(service: string): boolean {
		if (!this.releaseInfo) return false;
		const serviceVariants: Record<string, string[]> = {
			Netflix: ['netflix', 'nf'],
			'Amazon Prime': ['amazon', 'amzn', 'prime'],
			'Disney+': ['disney', 'dsnp', 'disney+'],
			'Apple TV+': ['apple', 'atvp', 'atv+'],
			'HBO Max': ['hbo', 'hmax']
		};
		const variants = serviceVariants[service] ?? [service.toLowerCase()];
		return variants.some((v) => this.releaseInfo!.toLowerCase().includes(v));
	}

	/**
	 * Normalize string for matching (remove punctuation, lowercase)
	 */
	protected normalizeForMatching(str: string): string {
		return str
			.toLowerCase()
			.replace(/[^\w\s]/g, '')
			.replace(/\s+/g, ' ')
			.trim();
	}
}

/**
 * Subtitle constructor options
 */
export interface SubtitleOptions {
	pageLink?: string;
	releaseInfo?: string;
	filename?: string;
	uploader?: string;
	downloadCount?: number;
	rating?: number;
	uploadDate?: Date;
	format?: SubtitleFormat;
}

/**
 * Pack data for multi-episode subtitles
 */
export interface SubtitlePackData {
	/** Season number */
	season: number;
	/** Episodes included in pack */
	episodes: number[];
	/** File mappings */
	files?: Map<number, string>;
}

/**
 * Legacy result format for backwards compatibility
 */
export interface LegacySubtitleSearchResult {
	providerId: string;
	providerName: string;
	providerSubtitleId: string;
	language: LanguageCode;
	title: string;
	releaseName?: string;
	fileName?: string;
	isForced: boolean;
	isHearingImpaired: boolean;
	format: SubtitleFormat;
	isHashMatch: boolean;
	matchScore: number;
	downloadUrl?: string;
	downloadCount?: number;
	rating?: number;
	uploadDate?: string;
	uploader?: string;
	fileSize?: number;
}

/**
 * Generic subtitle implementation for simple providers
 */
export class GenericSubtitle extends Subtitle {
	readonly providerName: string;

	// Provider-specific IDs for matching
	imdbId?: string;
	tmdbId?: number;
	tvdbId?: number;

	// Episode-specific data
	seriesTitle?: string;
	season?: number;
	episode?: number;
	movieTitle?: string;
	year?: number;

	constructor(
		providerName: string,
		id: string,
		language: Language,
		options: GenericSubtitleOptions = {}
	) {
		super(id, language, options);
		this.providerName = providerName;
		this.imdbId = options.imdbId;
		this.tmdbId = options.tmdbId;
		this.tvdbId = options.tvdbId;
		this.seriesTitle = options.seriesTitle;
		this.season = options.season;
		this.episode = options.episode;
		this.movieTitle = options.movieTitle;
		this.year = options.year;
	}

	getMatches(video: Video): Set<MatchType> {
		const matches = this.computeCommonMatches(video);

		// Add hash match if flagged
		if (this.isHashMatch && this.hashVerifiable) {
			matches.add('hash');
		}

		// Provider returned IMDB ID
		if (this.imdbId) {
			if (isMovie(video) && video.imdbId === this.imdbId) {
				matches.add('imdb_id');
			} else if (isEpisode(video) && video.seriesImdbId === this.imdbId) {
				matches.add('imdb_id');
			}
		}

		// Provider returned TMDB ID
		if (this.tmdbId) {
			if (isMovie(video) && video.tmdbId === this.tmdbId) {
				matches.add('tmdb_id');
			} else if (isEpisode(video) && video.seriesTmdbId === this.tmdbId) {
				matches.add('tmdb_id');
			}
		}

		// Provider returned TVDB ID
		if (this.tvdbId && isEpisode(video) && video.tvdbId === this.tvdbId) {
			matches.add('tvdb_id');
		}

		// Direct series/season/episode matching from provider data
		if (isEpisode(video)) {
			if (this.seriesTitle) {
				const normalizedSeries = this.normalizeForMatching(this.seriesTitle);
				const normalizedVideoSeries = this.normalizeForMatching(video.series);
				if (normalizedSeries === normalizedVideoSeries) {
					matches.add('series');
				}
			}
			if (this.season === video.season) {
				matches.add('season');
			}
			if (this.episode === video.primaryEpisode) {
				matches.add('episode');
			}
		}

		// Direct movie title/year matching
		if (isMovie(video)) {
			if (this.movieTitle) {
				const normalizedTitle = this.normalizeForMatching(this.movieTitle);
				const normalizedVideoTitle = this.normalizeForMatching(video.title);
				if (normalizedTitle === normalizedVideoTitle) {
					matches.add('title');
				}
			}
			if (this.year === video.year) {
				matches.add('year');
			}
		}

		return matches;
	}

	protected matchesImdbId(imdbId: string): boolean {
		return this.imdbId === imdbId;
	}

	protected matchesTmdbId(tmdbId: number): boolean {
		return this.tmdbId === tmdbId;
	}

	protected matchesTvdbId(tvdbId: number): boolean {
		return this.tvdbId === tvdbId;
	}
}

/**
 * Generic subtitle options
 */
export interface GenericSubtitleOptions extends SubtitleOptions {
	imdbId?: string;
	tmdbId?: number;
	tvdbId?: number;
	seriesTitle?: string;
	season?: number;
	episode?: number;
	movieTitle?: string;
	year?: number;
}
