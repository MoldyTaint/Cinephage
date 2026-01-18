/**
 * Assrt Types
 *
 * Chinese subtitle provider with API.
 */

/** Assrt API search response */
export interface AssrtSearchResponse {
	status: number;
	errmsg?: string;
	sub?: {
		subs: AssrtSubtitle[];
	};
}

/** Assrt subtitle */
export interface AssrtSubtitle {
	id: number;
	videoname: string;
	native_name?: string;
	release_site?: string;
	upload_time?: string;
	lang?: {
		desc: string;
		langlist: AssrtLanguage[];
	};
}

/** Assrt language */
export interface AssrtLanguage {
	lang: string;
	langcn?: string;
}

/** Assrt detail response */
export interface AssrtDetailResponse {
	status: number;
	sub?: {
		subs: Array<{
			filelist: AssrtFile[];
		}>;
	};
}

/** Assrt file */
export interface AssrtFile {
	f: string; // filename
	s?: number; // size
	url?: string;
}

/** Provider configuration */
export interface AssrtConfig {
	/** API token (required) */
	token: string;
}

/** Supported languages */
export const ASSRT_LANGUAGES = ['zh', 'zh-cn', 'zh-tw', 'en'];

/** Language code mapping to Assrt codes */
export const ASSRT_LANGUAGE_MAP: Record<string, string> = {
	zh: 'chs',
	'zh-cn': 'chs',
	'zh-tw': 'cht',
	en: 'eng'
};

/** API base URL */
export const ASSRT_API_URL = 'https://api.assrt.net/v1';
