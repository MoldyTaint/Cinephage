/**
 * Library types for movies and TV series in the local library
 */

export interface Subtitle {
	id: string;
	language: string;
	isForced?: boolean;
	isHearingImpaired?: boolean;
	format?: string;
}

export interface MovieFile {
	id: string;
	relativePath: string;
	size: number | null;
	dateAdded: string | null;
	quality: QualityInfo | null;
	mediaInfo: MediaInfo | null;
	releaseGroup: string | null;
	edition: string | null;
}

export interface EpisodeFile {
	id: string;
	seriesId: string;
	seasonNumber: number;
	episodeIds: number[];
	relativePath: string;
	size: number | null;
	dateAdded: string | null;
	sceneName: string | null;
	releaseGroup: string | null;
	releaseType: string | null;
	quality: QualityInfo | null;
	mediaInfo: MediaInfo | null;
	edition: string | null;
	languages: string[] | null;
}

export interface QualityInfo {
	resolution?: string;
	source?: string;
	modifier?: string;
	revision?: number;
}

export interface MediaInfo {
	container?: string;
	videoCodec?: string;
	videoProfile?: string;
	videoBitrate?: number;
	videoBitDepth?: number;
	videoResolution?: { width: number; height: number };
	videoFps?: number;
	audioCodec?: string;
	audioChannels?: number;
	audioBitrate?: number;
	audioLanguages?: string[];
	subtitleLanguages?: string[];
	hdrFormat?: string | null;
	runtime?: number;
}

export interface LibraryMovie {
	id: string;
	tmdbId: number;
	imdbId: string | null;
	title: string;
	originalTitle: string | null;
	year: number | null;
	overview: string | null;
	posterPath: string | null;
	backdropPath: string | null;
	runtime: number | null;
	genres: string[] | null;
	path: string | null;
	rootFolderId: string | null;
	rootFolderPath: string | null;
	missingRootFolder?: boolean;
	scoringProfileId: string | null;
	monitored: boolean | null;
	minimumAvailability: string | null;
	wantsSubtitles: boolean | null;
	tmdbStatus?: string | null;
	releaseDate?: string | null;
	added: string;
	hasFile: boolean | null;
	files: MovieFile[];
	subtitles?: Subtitle[];
}

export interface LibrarySeries {
	id: string;
	tmdbId: number;
	tvdbId: number | null;
	imdbId: string | null;
	title: string;
	originalTitle: string | null;
	year: number | null;
	overview: string | null;
	posterPath: string | null;
	backdropPath: string | null;
	status: string | null;
	network: string | null;
	genres: string[] | null;
	path: string | null;
	rootFolderId: string | null;
	rootFolderPath: string | null;
	missingRootFolder?: boolean;
	scoringProfileId: string | null;
	monitored: boolean | null;
	seasonFolder: boolean | null;
	wantsSubtitles: boolean | null;
	added: string;
	episodeCount: number | null;
	episodeFileCount: number | null;
	percentComplete: number;
	totalSize?: number;
}

export type LibraryItem = LibraryMovie | LibrarySeries;

// Type guards
export function isLibraryMovie(item: LibraryItem): item is LibraryMovie {
	return 'hasFile' in item && 'files' in item;
}

export function isLibrarySeries(item: LibraryItem): item is LibrarySeries {
	return 'episodeCount' in item && 'episodeFileCount' in item;
}

// Sort options
export type SortDirection = 'asc' | 'desc';

export interface SortOption<T extends string = string> {
	field: T;
	direction: SortDirection;
	label: string;
}

// Filter options
export type MonitoredFilter = 'all' | 'monitored' | 'unmonitored';
export type FileStatusFilter = 'all' | 'hasFile' | 'missingFile';
export type SeriesStatusFilter = 'all' | 'continuing' | 'ended';
export type ProgressFilter = 'all' | 'complete' | 'inProgress' | 'notStarted';

export interface MovieFilters {
	monitored: MonitoredFilter;
	fileStatus: FileStatusFilter;
}

export interface SeriesFilters {
	monitored: MonitoredFilter;
	status: SeriesStatusFilter;
	progress: ProgressFilter;
}

// Helper to get quality display string
export function getQualityDisplay(quality: QualityInfo | null): string | null {
	if (!quality) return null;

	const parts: string[] = [];

	if (quality.resolution) {
		parts.push(quality.resolution);
	}

	return parts.length > 0 ? parts.join(' ') : null;
}

// Helper to get HDR format from media info
export function getHdrDisplay(mediaInfo: MediaInfo | null): string | null {
	if (!mediaInfo?.hdrFormat) return null;

	const format = mediaInfo.hdrFormat.toLowerCase();
	if (format.includes('dolby vision') || format.includes('dv')) return 'DV';
	if (format.includes('hdr10+')) return 'HDR10+';
	if (format.includes('hdr10') || format.includes('hdr')) return 'HDR10';
	if (format.includes('hlg')) return 'HLG';

	return mediaInfo.hdrFormat;
}

// Helper to get best quality from movie files
export function getBestQualityFromFiles(files: MovieFile[]): {
	quality: string | null;
	hdr: string | null;
} {
	if (!files || files.length === 0) {
		return { quality: null, hdr: null };
	}

	// Get the first file (typically there's only one)
	const file = files[0];
	return {
		quality: getQualityDisplay(file.quality),
		hdr: getHdrDisplay(file.mediaInfo)
	};
}
