/**
 * Application-wide configuration constants.
 * Centralizes magic numbers and hardcoded values for maintainability.
 */

/**
 * TMDB API configuration.
 */
export const TMDB = {
	/** Base URL for TMDB API v3 */
	BASE_URL: 'https://api.themoviedb.org/3',

	/** Default region for watch providers */
	DEFAULT_REGION: 'US'
} as const;

/**
 * Search and indexer configuration.
 */
export const SEARCH = {
	/** Default page size for search results */
	PAGE_SIZE: 20,

	/** Maximum results to fetch per indexer */
	MAX_INDEXER_RESULTS: 50,

	/** Minimum vote count for quality filtering on discover */
	MIN_VOTE_COUNT: 50
} as const;

/**
 * UI configuration.
 */
export const UI = {
	/** Scroll threshold (px) for triggering infinite scroll */
	INFINITE_SCROLL_THRESHOLD: 200,

	/** IntersectionObserver root margin for infinite scroll */
	INFINITE_SCROLL_ROOT_MARGIN: '200px',

	/** Maximum items to display before applying limits (prevents memory issues) */
	MAX_DISPLAY_ITEMS: 500
} as const;

/**
 * Download and import configuration.
 */
export const DOWNLOAD = {
	/** Minimum file size to consider for import (50MB) */
	MIN_IMPORT_SIZE_BYTES: 50 * 1024 * 1024,

	/** Minimum file size for library scanning (10MB) */
	MIN_SCAN_SIZE_BYTES: 10 * 1024 * 1024,

	/** Download monitor poll interval when downloads are active (5 seconds) */
	POLL_INTERVAL_ACTIVE_MS: 5_000,

	/** Download monitor poll interval when idle (30 seconds) */
	POLL_INTERVAL_IDLE_MS: 30_000,

	/** Grace period after queueing before considering download missing (30 seconds) */
	GRACE_PERIOD_MS: 30_000
} as const;

/**
 * Video file extensions for media library.
 */
export const VIDEO_EXTENSIONS = [
	'.mkv',
	'.mp4',
	'.avi',
	'.m4v',
	'.mov',
	'.wmv',
	'.mpg',
	'.mpeg',
	'.m2ts',
	'.ts',
	'.webm',
	'.flv',
	'.vob'
] as const;

export const VIDEO_EXTENSIONS_SET = new Set<string>(VIDEO_EXTENSIONS);

/**
 * Sample/extra file patterns to exclude from import.
 */
export const EXCLUDED_FILE_PATTERNS = [
	/\bsample\b/i,
	/\btrailer\b/i,
	/\bteaser\b/i,
	/\bpromo\b/i,
	/\bfeaturette\b/i,
	/\bbehind[\s._-]?the[\s._-]?scenes?\b/i,
	/\bdeleted[\s._-]?scenes?\b/i,
	/\bextras?\b/i,
	/\bbonus\b/i
] as const;

/**
 * Dangerous file extensions that indicate malware or unwanted content.
 * If a download folder contains files with these extensions, the import should be rejected.
 * @see https://github.com/Radarr/Radarr/blob/develop/src/NzbDrone.Core/MediaFiles/MediaFileExtensions.cs
 */
export const DANGEROUS_EXTENSIONS = [
	'.arj',
	'.lnk',
	'.lzh',
	'.ps1',
	'.scr',
	'.vbs',
	'.zipx'
] as const;

/**
 * Executable file extensions.
 * Downloads containing executables are suspicious and likely malware.
 * @see https://github.com/Radarr/Radarr/blob/develop/src/NzbDrone.Core/MediaFiles/MediaFileExtensions.cs
 */
export const EXECUTABLE_EXTENSIONS = ['.bat', '.cmd', '.exe', '.sh'] as const;

/**
 * Genre ID mappings between Movie and TV APIs.
 *
 * TMDB uses different genre IDs for movies vs TV shows.
 * This mapping allows unified filtering across both content types.
 *
 * @see https://developers.themoviedb.org/3/genres/get-movie-list
 * @see https://developers.themoviedb.org/3/genres/get-tv-list
 */
export const GENRE_MAPPINGS = {
	/**
	 * Maps movie genre IDs to their TV equivalents.
	 */
	MOVIE_TO_TV: {
		'28': '10759', // Action -> Action & Adventure
		'12': '10759', // Adventure -> Action & Adventure
		'14': '10765', // Fantasy -> Sci-Fi & Fantasy
		'878': '10765', // Sci-Fi -> Sci-Fi & Fantasy
		'10752': '10768' // War -> War & Politics
	} as const,

	/**
	 * Maps TV genre IDs to their movie equivalents.
	 */
	TV_TO_MOVIE: {
		'10759': '28', // Action & Adventure -> Action
		'10765': '14', // Sci-Fi & Fantasy -> Fantasy
		'10768': '10752' // War & Politics -> War
	} as const
} as const;
