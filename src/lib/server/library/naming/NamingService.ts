/**
 * Media Naming Service
 *
 * Handles generating consistent folder and file names for movies and TV shows.
 * Follows TRaSH Guides naming conventions for compatibility with media servers.
 *
 * @see https://trash-guides.info/Radarr/Radarr-recommended-naming-scheme/
 * @see https://trash-guides.info/Sonarr/Sonarr-recommended-naming-scheme/
 */

import { extname } from 'path';

/**
 * Parsed media info for naming
 */
export interface MediaNamingInfo {
	// Core info
	title: string;
	year?: number;
	tmdbId?: number;
	tvdbId?: number;
	imdbId?: string;

	// Edition/version
	edition?: string;

	// Quality info
	resolution?: string;
	source?: string;
	codec?: string;
	hdr?: string;
	bitDepth?: string;
	is3D?: boolean;

	// Audio info
	audioCodec?: string;
	audioChannels?: string;
	audioLanguages?: string[];

	// Release info
	releaseGroup?: string;
	proper?: boolean;
	repack?: boolean;

	// TV specific
	seasonNumber?: number;
	episodeNumbers?: number[];
	absoluteNumber?: number;
	episodeTitle?: string;
	airDate?: string;
	isDaily?: boolean;
	isAnime?: boolean;

	// Original file extension
	originalExtension?: string;
}

/**
 * Naming format configuration
 */
export interface NamingConfig {
	// Movie formats
	movieFolderFormat: string;
	movieFileFormat: string;

	// TV formats
	seriesFolderFormat: string;
	seasonFolderFormat: string;
	episodeFileFormat: string;
	dailyEpisodeFormat: string;
	animeEpisodeFormat: string;
	multiEpisodeStyle: 'extend' | 'duplicate' | 'repeat' | 'scene' | 'range';

	// Options
	replaceSpacesWith?: string;
	colonReplacement: 'delete' | 'dash' | 'spaceDash' | 'spaceDashSpace' | 'smart';
	mediaServerIdFormat: 'plex' | 'jellyfin';
	includeQuality: boolean;
	includeMediaInfo: boolean;
	includeReleaseGroup: boolean;
}

/**
 * Default naming configuration (TRaSH Guides aligned)
 * @see https://trash-guides.info/Radarr/Radarr-recommended-naming-scheme/
 * @see https://trash-guides.info/Sonarr/Sonarr-recommended-naming-scheme/
 */
export const DEFAULT_NAMING_CONFIG: NamingConfig = {
	// Movie folder: "Movie Title (2024) {tmdb-12345}" (Plex) or "[tmdbid-12345]" (Jellyfin)
	movieFolderFormat: '{CleanTitle} ({Year}) {MediaId}',
	// Movie file: "Movie Title (2024) {edition-Extended} [Bluray-1080p][DV HDR10][DTS-HD MA 7.1][x265]-GROUP"
	movieFileFormat:
		'{CleanTitle} ({Year}) {edition-{Edition}} [{QualityFull}]{[{HDR}]}{[{AudioCodec} {AudioChannels}]}{[{VideoCodec}]}{-{ReleaseGroup}}',

	// Series folder: "Series Title (2024) {tvdb-12345}" (Plex) or "[tvdbid-12345]" (Jellyfin)
	seriesFolderFormat: '{CleanTitle} ({Year}) {SeriesId}',
	// Season: "Season 01"
	seasonFolderFormat: 'Season {Season:00}',
	// Episode: "Series Title (2024) - S01E01 - Episode Title [Bluray-1080p][DTS-HD MA 5.1][x265]-GROUP"
	episodeFileFormat:
		'{SeriesCleanTitle} ({Year}) - S{Season:00}E{Episode:00} - {EpisodeCleanTitle} [{QualityFull}]{[{HDR}]}{[{AudioCodec} {AudioChannels}]}{[{VideoCodec}]}{-{ReleaseGroup}}',
	// Daily: "Series Title (2024) - 2024-01-15 - Episode Title [Quality]"
	dailyEpisodeFormat:
		'{SeriesCleanTitle} ({Year}) - {AirDate} - {EpisodeCleanTitle} [{QualityFull}]{[{VideoCodec}]}{-{ReleaseGroup}}',
	// Anime: "Series Title (2024) - S01E01 - 001 - Episode Title [Quality][10bit][x265]-GROUP"
	animeEpisodeFormat:
		'{SeriesCleanTitle} ({Year}) - S{Season:00}E{Episode:00} - {Absolute:000} - {EpisodeCleanTitle} [{QualityFull}]{[{HDR}]}{[{BitDepth}bit]}{[{VideoCodec}]}{[{AudioCodec} {AudioChannels}]}{-{ReleaseGroup}}',
	multiEpisodeStyle: 'range',

	colonReplacement: 'smart',
	mediaServerIdFormat: 'plex',
	includeQuality: true,
	includeMediaInfo: true,
	includeReleaseGroup: true
};

/**
 * Characters that are illegal in file/folder names
 */
// eslint-disable-next-line no-control-regex
const ILLEGAL_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;

/**
 * Smart colon replacement patterns
 * Handles cases like "Movie: Subtitle" -> "Movie - Subtitle"
 */
const COLON_PATTERNS = [
	{ pattern: /:\s+/g, replacement: ' - ' }, // ": " -> " - "
	{ pattern: /\s+:/g, replacement: ' -' }, // " :" -> " -"
	{ pattern: /:/g, replacement: '' } // Standalone ":" -> ""
];

/**
 * Media Naming Service
 */
export class NamingService {
	private config: NamingConfig;

	constructor(config: Partial<NamingConfig> = {}) {
		this.config = { ...DEFAULT_NAMING_CONFIG, ...config };
	}

	/**
	 * Get the current naming configuration
	 */
	getConfig(): NamingConfig {
		return { ...this.config };
	}

	/**
	 * Update the naming configuration
	 */
	updateConfig(config: Partial<NamingConfig>): void {
		this.config = { ...this.config, ...config };
	}

	/**
	 * Generate a movie folder name
	 */
	generateMovieFolderName(info: MediaNamingInfo): string {
		return this.formatName(this.config.movieFolderFormat, info);
	}

	/**
	 * Generate a movie file name (without extension)
	 */
	generateMovieFileName(info: MediaNamingInfo): string {
		const name = this.formatName(this.config.movieFileFormat, info);
		const ext = info.originalExtension || '';
		return name + ext;
	}

	/**
	 * Generate a series folder name
	 */
	generateSeriesFolderName(info: MediaNamingInfo): string {
		return this.formatName(this.config.seriesFolderFormat, info);
	}

	/**
	 * Generate a season folder name
	 */
	generateSeasonFolderName(seasonNumber: number): string {
		return this.formatName(this.config.seasonFolderFormat, {
			title: '',
			seasonNumber
		});
	}

	/**
	 * Generate an episode file name
	 */
	generateEpisodeFileName(info: MediaNamingInfo): string {
		let format = this.config.episodeFileFormat;

		// Select appropriate format based on content type
		if (info.isDaily && info.airDate) {
			format = this.config.dailyEpisodeFormat;
		} else if (info.isAnime) {
			format = this.config.animeEpisodeFormat;
		}

		const name = this.formatName(format, info);
		const ext = info.originalExtension || '';
		return name + ext;
	}

	/**
	 * Format a name using the given format string and info
	 */
	private formatName(format: string, info: MediaNamingInfo): string {
		let result = format;

		// Process conditional blocks first: {[{Value}]} or {prefix{Value}}
		// These are only included if the inner value exists
		result = this.processConditionalBlocks(result, info);

		// Replace standard tokens
		result = this.replaceTokens(result, info);

		// Clean up the result
		result = this.cleanName(result);

		return result;
	}

	/**
	 * Process conditional blocks like {[{Quality}]} or {edition-{Edition}}
	 * Only includes the block content if the inner value exists
	 */
	private processConditionalBlocks(format: string, info: MediaNamingInfo): string {
		// Pattern: {prefix{Token}suffix} or {[{Token}]} etc.
		// Match outer braces that contain inner {Token} patterns
		const conditionalPattern = /\{([^{}]*)\{([A-Za-z:0-9]+)\}([^{}]*)\}/g;

		return format.replace(conditionalPattern, (match, prefix, token, suffix) => {
			const value = this.getTokenValue(token, info);
			if (value && value.trim()) {
				return prefix + value + suffix;
			}
			return '';
		});
	}

	/**
	 * Replace simple tokens like {Title}, {Year}
	 */
	private replaceTokens(format: string, info: MediaNamingInfo): string {
		const tokenPattern = /\{([A-Za-z:0-9]+)\}/g;

		return format.replace(tokenPattern, (match, token) => {
			const value = this.getTokenValue(token, info);
			return value || '';
		});
	}

	/**
	 * Get the value for a token
	 */
	private getTokenValue(token: string, info: MediaNamingInfo): string {
		// Handle formatting like {Season:00} or {Episode:00}
		const [name, formatSpec] = token.split(':');

		let value: string | number | undefined;

		switch (name.toLowerCase()) {
			// Core
			case 'title':
			case 'seriestitle':
				value = info.title;
				break;
			case 'cleantitle':
			case 'moviecleantitle':
			case 'seriescleantitle':
				value = this.generateCleanTitle(info.title);
				break;
			case 'year':
				value = info.year;
				break;
			case 'tmdbid':
				value = info.tmdbId;
				break;
			case 'tvdbid':
				value = info.tvdbId;
				break;
			case 'imdbid':
				value = info.imdbId;
				break;

			// Media Server IDs (format based on config)
			case 'mediaid':
			case 'movieid':
				value = this.formatMediaId(info.tmdbId, 'tmdb');
				break;
			case 'seriesid':
				// Prefer TVDB for series, fall back to TMDB
				if (info.tvdbId) {
					value = this.formatMediaId(info.tvdbId, 'tvdb');
				} else if (info.tmdbId) {
					value = this.formatMediaId(info.tmdbId, 'tmdb');
				}
				break;

			// Edition
			case 'edition':
				value = info.edition;
				break;

			// Quality
			case 'quality':
				value = this.buildQualityString(info);
				break;
			case 'qualityfull':
				value = this.buildQualityFullString(info);
				break;
			case 'resolution':
				value = info.resolution;
				break;
			case 'source':
				value = info.source;
				break;

			// Proper/Repack markers
			case 'proper':
				value = info.proper ? 'PROPER' : undefined;
				break;
			case 'repack':
				value = info.repack ? 'REPACK' : undefined;
				break;

			// Video
			case 'videocodec':
			case 'codec':
				value = this.normalizeCodec(info.codec);
				break;
			case 'hdr':
				value = info.hdr;
				break;
			case 'bitdepth':
				value = info.bitDepth;
				break;
			case '3d':
				value = info.is3D ? '3D' : undefined;
				break;

			// Audio
			case 'audiocodec':
				value = this.normalizeAudioCodec(info.audioCodec);
				break;
			case 'audiochannels':
				value = info.audioChannels;
				break;
			case 'audiolanguages':
				value = info.audioLanguages?.join(' ');
				break;

			// Release
			case 'releasegroup':
			case 'group':
				value = info.releaseGroup;
				break;

			// TV specific
			case 'season':
				value = info.seasonNumber;
				break;
			case 'episode':
				value = this.formatEpisodeNumbers(info.episodeNumbers, formatSpec);
				break;
			case 'absolute':
				value = info.absoluteNumber;
				break;
			case 'episodetitle':
				value = info.episodeTitle;
				break;
			case 'episodecleantitle':
				value = info.episodeTitle ? this.generateCleanTitle(info.episodeTitle) : undefined;
				break;
			case 'airdate':
				value = info.airDate;
				break;

			default:
				value = undefined;
		}

		if (value === undefined || value === null) {
			return '';
		}

		// Apply number formatting if specified
		if (typeof value === 'number' && formatSpec) {
			return this.formatNumber(value, formatSpec);
		}

		return String(value);
	}

	/**
	 * Build quality string like "Bluray-1080p" or "WEB-DL 2160p"
	 */
	private buildQualityString(info: MediaNamingInfo): string {
		const parts: string[] = [];

		if (info.source) {
			parts.push(this.normalizeSource(info.source));
		}

		if (info.resolution) {
			parts.push(info.resolution);
		}

		return parts.join('-');
	}

	/**
	 * Build full quality string with Proper/Repack markers
	 * e.g., "PROPER Bluray-1080p" or "REPACK WEB-DL-2160p"
	 */
	private buildQualityFullString(info: MediaNamingInfo): string {
		const parts: string[] = [];

		// Add Proper/Repack markers first (per Trash-Guides)
		if (info.proper) parts.push('Proper');
		if (info.repack) parts.push('Repack');

		// Then quality
		const quality = this.buildQualityString(info);
		if (quality) parts.push(quality);

		return parts.join(' ');
	}

	/**
	 * Generate a clean title by removing special characters for filesystem compatibility
	 * Following Trash-Guides: strips characters like : / \ ? * " < > |
	 */
	private generateCleanTitle(title: string): string {
		return title
			.replace(/[:/\\?*"<>|]/g, '') // Remove filesystem-unsafe chars
			.replace(/\s+/g, ' ') // Normalize whitespace
			.trim();
	}

	/**
	 * Format media ID based on configured media server format
	 * Plex/Emby: {tmdb-12345} or {tvdb-12345}
	 * Jellyfin: [tmdbid-12345] or [tvdbid-12345]
	 */
	private formatMediaId(id: number | undefined, type: 'tmdb' | 'tvdb'): string | undefined {
		if (!id) return undefined;

		if (this.config.mediaServerIdFormat === 'jellyfin') {
			return `[${type}id-${id}]`;
		}
		// Plex/Emby format (default)
		return `{${type}-${id}}`;
	}

	/**
	 * Normalize source names to standard format
	 */
	private normalizeSource(source: string): string {
		const normalized = source.toLowerCase();

		const sourceMap: Record<string, string> = {
			bluray: 'Bluray',
			'blu-ray': 'Bluray',
			bdrip: 'Bluray',
			brrip: 'Bluray',
			remux: 'Remux',
			webdl: 'WEB-DL',
			'web-dl': 'WEB-DL',
			'web dl': 'WEB-DL',
			webrip: 'WEBRip',
			'web-rip': 'WEBRip',
			web: 'WEB',
			hdtv: 'HDTV',
			pdtv: 'PDTV',
			dsr: 'DSR',
			dvdrip: 'DVDRip',
			dvd: 'DVD',
			hdcam: 'HDCAM',
			hdrip: 'HDRip',
			cam: 'CAM',
			telesync: 'TS',
			ts: 'TS',
			telecine: 'TC',
			tc: 'TC',
			screener: 'SCR',
			scr: 'SCR',
			r5: 'R5'
		};

		return sourceMap[normalized] || source;
	}

	/**
	 * Normalize video codec names
	 */
	private normalizeCodec(codec?: string): string | undefined {
		if (!codec) return undefined;

		const normalized = codec.toLowerCase();

		const codecMap: Record<string, string> = {
			x264: 'x264',
			h264: 'x264',
			'h.264': 'x264',
			avc: 'x264',
			x265: 'x265',
			h265: 'x265',
			'h.265': 'x265',
			hevc: 'x265',
			xvid: 'XviD',
			divx: 'DivX',
			av1: 'AV1',
			vp9: 'VP9',
			mpeg2: 'MPEG2'
		};

		return codecMap[normalized] || codec;
	}

	/**
	 * Normalize audio codec names
	 */
	private normalizeAudioCodec(codec?: string): string | undefined {
		if (!codec) return undefined;

		const normalized = codec.toLowerCase().replace(/[^a-z0-9]/g, '');

		const codecMap: Record<string, string> = {
			// Lossless
			truehd: 'TrueHD',
			'truehd atmos': 'TrueHD Atmos',
			truhdatmos: 'TrueHD Atmos',
			dtshd: 'DTS-HD',
			dtshdma: 'DTS-HD MA',
			'dtshd ma': 'DTS-HD MA',
			dtsx: 'DTS-X',
			flac: 'FLAC',
			pcm: 'PCM',
			lpcm: 'LPCM',

			// Lossy
			dts: 'DTS',
			'dolby digital': 'DD',
			dd: 'DD',
			ddp: 'DD+',
			'dd+': 'DD+',
			ddplus: 'DD+',
			eac3: 'EAC3',
			ac3: 'AC3',
			aac: 'AAC',
			mp3: 'MP3',
			opus: 'Opus',
			vorbis: 'Vorbis'
		};

		return codecMap[normalized] || codec;
	}

	/**
	 * Format episode numbers based on multi-episode style
	 */
	private formatEpisodeNumbers(episodes?: number[], formatSpec?: string): string {
		if (!episodes || episodes.length === 0) return '';

		if (episodes.length === 1) {
			return this.formatNumber(episodes[0], formatSpec || '00');
		}

		const formatted = episodes.map((e) => this.formatNumber(e, formatSpec || '00'));

		switch (this.config.multiEpisodeStyle) {
			case 'extend':
				// S01E01E02E03
				return formatted
					.map((e) => `E${e}`)
					.join('')
					.slice(1); // Remove first E

			case 'duplicate':
				// S01E01-E02-E03
				return formatted.join('-E');

			case 'repeat':
				// S01E01 - S01E02 - S01E03 (handled at higher level)
				return formatted[0];

			case 'scene':
				// S01E01E02 (no padding for extra episodes)
				return (
					formatted[0] +
					episodes
						.slice(1)
						.map((e) => `E${e}`)
						.join('')
				);

			case 'range':
			default:
				// S01E01-E03
				if (episodes.length === 2) {
					return `${formatted[0]}-E${formatted[1]}`;
				}
				return `${formatted[0]}-E${formatted[formatted.length - 1]}`;
		}
	}

	/**
	 * Format a number with padding
	 */
	private formatNumber(num: number, format: string): string {
		// Format like "00" means pad to 2 digits
		const padLength = format.length;
		return String(num).padStart(padLength, '0');
	}

	/**
	 * Clean the final name - remove illegal characters, handle colons, etc.
	 */
	private cleanName(name: string): string {
		let result = name;

		// Handle colons based on config
		result = this.replaceColons(result);

		// Remove illegal characters
		result = result.replace(ILLEGAL_CHARS, '');

		// Clean up multiple spaces
		result = result.replace(/\s+/g, ' ');

		// Clean up empty brackets
		result = result.replace(/\[\s*\]/g, '');
		result = result.replace(/\(\s*\)/g, '');
		result = result.replace(/\{\s*\}/g, '');

		// Clean up multiple dashes
		result = result.replace(/-{2,}/g, '-');
		result = result.replace(/\s+-\s+-/g, ' -');

		// Clean up trailing/leading dashes and spaces
		result = result.replace(/^[\s-]+|[\s-]+$/g, '');

		// Replace spaces if configured
		if (this.config.replaceSpacesWith) {
			result = result.replace(/\s/g, this.config.replaceSpacesWith);
		}

		return result.trim();
	}

	/**
	 * Replace colons based on configuration
	 */
	private replaceColons(name: string): string {
		switch (this.config.colonReplacement) {
			case 'delete':
				return name.replace(/:/g, '');

			case 'dash':
				return name.replace(/:/g, '-');

			case 'spaceDash':
				return name.replace(/:/g, ' -');

			case 'spaceDashSpace':
				return name.replace(/:/g, ' - ');

			case 'smart':
			default: {
				let result = name;
				for (const { pattern, replacement } of COLON_PATTERNS) {
					result = result.replace(pattern, replacement);
				}
				return result;
			}
		}
	}
}

/**
 * Default naming service instance
 */
export const namingService = new NamingService();

/**
 * Helper to extract naming info from a parsed release
 */
export function releaseToNamingInfo(
	parsed: {
		title?: string;
		year?: number;
		resolution?: string | null;
		source?: string | null;
		codec?: string | null;
		hdr?: string | null;
		audio?: string | null;
		audioCodec?: string;
		audioChannels?: string;
		releaseGroup?: string;
		isProper?: boolean;
		isRepack?: boolean;
		edition?: string;
		episode?: { season?: number; episodes?: number[]; absoluteEpisode?: number };
	},
	originalPath?: string
): Partial<MediaNamingInfo> {
	return {
		resolution: parsed.resolution ?? undefined,
		source: parsed.source ?? undefined,
		codec: parsed.codec ?? undefined,
		hdr: parsed.hdr ?? undefined,
		audioCodec: parsed.audioCodec ?? parsed.audio ?? undefined,
		audioChannels: parsed.audioChannels,
		releaseGroup: parsed.releaseGroup,
		proper: parsed.isProper,
		repack: parsed.isRepack,
		edition: parsed.edition,
		seasonNumber: parsed.episode?.season,
		episodeNumbers: parsed.episode?.episodes,
		absoluteNumber: parsed.episode?.absoluteEpisode,
		originalExtension: originalPath ? extname(originalPath) : undefined
	};
}
