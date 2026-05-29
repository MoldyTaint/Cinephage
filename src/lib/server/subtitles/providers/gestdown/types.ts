/**
 * Gestdown API Types
 *
 * Gestdown is a TV subtitle database (Addic7ed proxy).
 * API v4: https://api.gestdown.info
 */

/** Gestdown show search response */
export interface GestdownShowResponse {
	shows?: GestdownShow[];
}

/** Gestdown show */
export interface GestdownShow {
	id: string;
	name: string;
	nbSeasons?: number;
	seasons?: number[];
	tvDbId?: number | null;
	tmdbId?: number;
	slug?: string;
}

/** Gestdown v4 season subtitle response (GET /shows/{id}/{season}/{lang}) */
export interface GestdownSeasonResponse {
	episodes?: GestdownEpisode[];
	seasonPacks?: unknown[];
}

/** Gestdown episode with nested subtitles */
export interface GestdownEpisode {
	subtitles: GestdownSubtitle[];
	season: number;
	number: number;
	title: string;
	show: string;
	discovered?: string;
}

/** Gestdown subtitle entry (v4 format) */
export interface GestdownSubtitle {
	subtitleId: string;
	version?: string;
	language: string;
	downloadUri: string;
	completed?: boolean;
	hearingImpaired?: boolean;
	hd?: boolean;
	corrected?: boolean;
	downloadCount?: number;
	source?: string;
	qualities?: string[];
	release?: string | null;
	discovered?: string;
}

/** Gestdown language mapping - ISO 639-1 to Gestdown language path names */
export const GESTDOWN_LANGUAGES: Record<string, string> = {
	en: 'english',
	es: 'spanish',
	fr: 'french',
	de: 'german',
	it: 'italian',
	pt: 'portuguese',
	'pt-br': 'portuguese-br',
	nl: 'dutch',
	pl: 'polish',
	ru: 'russian',
	ar: 'arabic',
	he: 'hebrew',
	tr: 'turkish',
	el: 'greek',
	hu: 'hungarian',
	ro: 'romanian',
	cs: 'czech',
	sv: 'swedish',
	da: 'danish',
	fi: 'finnish',
	no: 'norwegian',
	ja: 'japanese',
	ko: 'korean',
	zh: 'chinese',
	vi: 'vietnamese',
	th: 'thai',
	id: 'indonesian',
	fa: 'farsi',
	hi: 'hindi',
	uk: 'ukrainian',
	bg: 'bulgarian',
	hr: 'croatian',
	sr: 'serbian',
	sk: 'slovak',
	sl: 'slovenian',
	et: 'estonian',
	lv: 'latvian',
	lt: 'lithuanian'
};

/** Reverse mapping for parsing API responses */
export const GESTDOWN_LANGUAGE_REVERSE: Record<string, string> = Object.entries(
	GESTDOWN_LANGUAGES
).reduce(
	(acc, [iso, name]) => {
		acc[name.toLowerCase()] = iso;
		return acc;
	},
	{} as Record<string, string>
);
