/**
 * Types for unmatched files feature
 */

export interface UnmatchedFile {
	id: string;
	path: string;
	rootFolderId: string | null;
	rootFolderPath: string | null;
	mediaType: 'movie' | 'tv';
	size: number | null;
	parsedTitle: string | null;
	parsedYear: number | null;
	parsedSeason: number | null;
	parsedEpisode: number | null;
	suggestedMatches: SuggestedMatch[] | null;
	reason: UnmatchedReason | null;
	discoveredAt: string;
}

export interface SuggestedMatch {
	tmdbId: number;
	title: string;
	year?: number;
	confidence: number;
}

export type UnmatchedReason =
	| 'no_match'
	| 'low_confidence'
	| 'multiple_matches'
	| 'rejected'
	| 'parse_error'
	| 'manual_review';

export interface UnmatchedFolder {
	folderPath: string;
	folderName: string;
	mediaType: 'movie' | 'tv';
	fileCount: number;
	files: UnmatchedFile[];
	reasons: UnmatchedReason[];
	commonParsedTitle: string | null;
	isShowFolder: boolean;
	showName?: string;
	seasonFolders?: SeasonFolderInfo[];
}

export interface SeasonFolderInfo {
	path: string;
	name: string;
	seasonNumber?: number;
	fileCount: number;
}

export interface UnmatchedFilters {
	mediaType?: 'movie' | 'tv';
	groupBy?: 'immediate' | 'show';
	search?: string;
}

export interface PaginationState {
	page: number;
	limit: number;
	total: number;
	totalPages: number;
}

export interface MatchRequest {
	fileIds: string[];
	tmdbId: number;
	mediaType: 'movie' | 'tv';
	season?: number;
	episodeMapping?: Record<string, { season: number; episode: number }>;
}

export interface MatchResult {
	fileId: string;
	filePath: string;
	matched: boolean;
	tmdbId?: number;
	title?: string;
	confidence: number;
	reason?: string;
}

export interface BatchMatchResult {
	success: boolean;
	matched: number;
	failed: number;
	errors: string[];
	mediaId?: string;
}

export interface ProcessResult {
	success: boolean;
	processed: number;
	matched: number;
	failed: number;
	results: MatchResult[];
}

export interface LibraryIssue {
	id: string;
	title: string;
	year: number | null;
	mediaType: 'movie' | 'tv';
	posterPath: string | null;
	issue: 'missing_root_folder' | 'invalid_root_folder';
}

export interface RootFolderOption {
	id: string;
	name: string;
	path: string;
	mediaType: 'movie' | 'tv';
}

export interface UnmatchedState {
	files: UnmatchedFile[];
	folders: UnmatchedFolder[];
	filters: UnmatchedFilters;
	pagination: PaginationState;
	selectedFiles: Set<string>;
	loading: boolean;
	error: string | null;
}

export type ViewMode = 'list' | 'folder';
