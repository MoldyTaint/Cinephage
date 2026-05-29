export type MetadataProviderId = 'tmdb' | 'anilist' | 'mal';
export type MetadataMediaType = 'movie' | 'tv' | 'anime';
export type MetadataProviderSelection = 'auto' | MetadataProviderId;

export interface MetadataSearchResult {
	id: string;
	title: string;
	originalTitle?: string;
	overview?: string;
	year?: number | null;
	posterUrl?: string | null;
	mediaType: MetadataMediaType;
	provider: MetadataProviderId;
}

export interface MetadataDetails {
	id: string;
	title: string;
	originalTitle?: string;
	overview?: string;
	year?: number | null;
	posterUrl?: string | null;
	backdropUrl?: string | null;
	genres?: string[];
	status?: string;
	studios?: string[];
	mediaType: MetadataMediaType;
	provider: MetadataProviderId;
}

export interface MetadataProvider {
	id: MetadataProviderId;
	name: string;
	description: string;
	isConfigured(): boolean;
	searchTitle(query: string, type: MetadataMediaType): Promise<MetadataSearchResult[]>;
	getDetails(id: string, type: MetadataMediaType): Promise<MetadataDetails | null>;
}

export interface MetadataProviderConfig {
	anilistEnabled: boolean;
	malClientId: string;
	animeProviderPriority: Array<Extract<MetadataProviderId, 'mal' | 'anilist' | 'tmdb'>>;
}
