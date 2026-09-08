import type { LanguageCode } from '../../types';

export const SUPERSUBTITLES_BASE_URL = 'https://feliratok.eu';
export const SUPERSUBTITLES_LANGUAGES: LanguageCode[] = ['hu', 'en'];

export interface SuperSubtitlesAutocompleteEntry {
	name?: unknown;
	ID?: unknown;
	id?: unknown;
}

export interface SuperSubtitlesEpisodeEntry {
	language?: unknown;
	nev?: unknown;
	baselink?: unknown;
	fnev?: unknown;
	felirat?: unknown;
	evad?: unknown;
	ep?: unknown;
	feltolto?: unknown;
	pontos_talalat?: unknown;
	evadpakk?: unknown;
}

export interface SuperSubtitlesCandidate {
	id: string;
	language: LanguageCode;
	title: string;
	year?: number;
	season?: number;
	episode?: number;
	isPack: boolean;
	isForced: boolean;
	releases: string[];
	fileName?: string;
	uploader?: string;
	downloadUrl: string;
	pageLink: string;
}

export interface SuperSubtitlesDownloadContext {
	id: string;
	season?: number;
	episode?: number;
	isPack: boolean;
}
