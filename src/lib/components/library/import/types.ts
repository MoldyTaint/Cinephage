export type MediaType = 'movie' | 'tv';

export interface MatchResult {
	tmdbId: number;
	title: string;
	year?: number;
	mediaType: MediaType;
	isAnime?: boolean;
	confidence: number;
	inLibrary: boolean;
	libraryId?: string;
	rootFolderId?: string | null;
	rootFolderPath?: string | null;
}

export interface DetectionGroup {
	id: string;
	displayName: string;
	sourceType: 'file' | 'folder';
	sourcePath: string;
	selectedFilePath: string;
	fileName: string;
	detectedFileCount: number;
	detectedSeasons?: number[];
	suggestedSeason?: number;
	parsedTitle: string;
	parsedYear?: number;
	parsedSeason?: number;
	parsedEpisode?: number;
	inferredMediaType: MediaType;
	matches?: MatchResult[];
}

export interface DetectionSection {
	id: string;
	label: string;
	mediaType: MediaType;
	items: DetectionGroup[];
	seasonSections?: TvSeasonSection[];
}

export interface TvSeasonSection {
	key: string;
	label: string;
	seasonNumber: number | null;
	items: DetectionGroup[];
}
