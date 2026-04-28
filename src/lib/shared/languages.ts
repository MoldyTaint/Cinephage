/**
 * Shared Language Definitions
 *
 * This module provides centralized language definitions that can be used
 * by both client-side (Svelte components) and server-side code.
 *
 * Single source of truth for all language-related functionality.
 */

/**
 * Language definition with metadata for UI and provider mapping
 */
export interface LanguageDefinition {
	/** ISO 639-1 code (2-letter) */
	code: string;
	/** ISO 639-2 code (3-letter) - for matching in filenames */
	code3?: string;
	/** English name */
	name: string;
	/** Native name */
	nativeName?: string;
	/** Regional variants (e.g., 'pt-br' for Brazilian Portuguese) */
	variants?: Array<{ code: string; name: string }>;
}

/**
 * Master list of supported languages for subtitle operations.
 * This is the single source of truth for all language-related functionality.
 * Languages are ordered by global usage/popularity for UI display.
 */
export const SUPPORTED_LANGUAGES: readonly LanguageDefinition[] = [
	{ code: 'en', code3: 'eng', name: 'English', nativeName: 'English' },
	{
		code: 'es',
		code3: 'spa',
		name: 'Spanish',
		nativeName: 'Español',
		variants: [{ code: 'es-la', name: 'Spanish (Latin America)' }]
	},
	{
		code: 'fr',
		code3: 'fre',
		name: 'French',
		nativeName: 'Français',
		variants: [{ code: 'fr-ca', name: 'French (Canada)' }]
	},
	{ code: 'de', code3: 'ger', name: 'German', nativeName: 'Deutsch' },
	{ code: 'it', code3: 'ita', name: 'Italian', nativeName: 'Italiano' },
	{
		code: 'pt',
		code3: 'por',
		name: 'Portuguese',
		nativeName: 'Português',
		variants: [{ code: 'pt-br', name: 'Portuguese (Brazil)' }]
	},
	{ code: 'ru', code3: 'rus', name: 'Russian', nativeName: 'Русский' },
	{
		code: 'zh',
		code3: 'chi',
		name: 'Chinese',
		nativeName: '中文',
		variants: [
			{ code: 'zh-tw', name: 'Chinese (Traditional)' },
			{ code: 'zh-cn', name: 'Chinese (Simplified)' }
		]
	},
	{ code: 'ja', code3: 'jpn', name: 'Japanese', nativeName: '日本語' },
	{ code: 'ko', code3: 'kor', name: 'Korean', nativeName: '한국어' },
	{ code: 'ar', code3: 'ara', name: 'Arabic', nativeName: 'العربية' },
	{ code: 'hi', code3: 'hin', name: 'Hindi', nativeName: 'हिन्दी' },
	{ code: 'nl', code3: 'dut', name: 'Dutch', nativeName: 'Nederlands' },
	{ code: 'pl', code3: 'pol', name: 'Polish', nativeName: 'Polski' },
	{ code: 'sv', code3: 'swe', name: 'Swedish', nativeName: 'Svenska' },
	{ code: 'no', code3: 'nor', name: 'Norwegian', nativeName: 'Norsk' },
	{ code: 'da', code3: 'dan', name: 'Danish', nativeName: 'Dansk' },
	{ code: 'fi', code3: 'fin', name: 'Finnish', nativeName: 'Suomi' },
	{ code: 'el', code3: 'gre', name: 'Greek', nativeName: 'Ελληνικά' },
	{ code: 'tr', code3: 'tur', name: 'Turkish', nativeName: 'Türkçe' },
	{ code: 'he', code3: 'heb', name: 'Hebrew', nativeName: 'עברית' },
	{ code: 'th', code3: 'tha', name: 'Thai', nativeName: 'ไทย' },
	{ code: 'vi', code3: 'vie', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
	{ code: 'cs', code3: 'cze', name: 'Czech', nativeName: 'Čeština' },
	{ code: 'hu', code3: 'hun', name: 'Hungarian', nativeName: 'Magyar' },
	{ code: 'ro', code3: 'rum', name: 'Romanian', nativeName: 'Română' },
	{ code: 'bg', code3: 'bul', name: 'Bulgarian', nativeName: 'Български' },
	{ code: 'uk', code3: 'ukr', name: 'Ukrainian', nativeName: 'Українська' },
	{ code: 'id', code3: 'ind', name: 'Indonesian', nativeName: 'Bahasa Indonesia' },
	{ code: 'ms', code3: 'may', name: 'Malay', nativeName: 'Bahasa Melayu' },
	{ code: 'hr', code3: 'hrv', name: 'Croatian', nativeName: 'Hrvatski' },
	{ code: 'sr', code3: 'srp', name: 'Serbian', nativeName: 'Српски' },
	{ code: 'sk', code3: 'slo', name: 'Slovak', nativeName: 'Slovenčina' },
	{ code: 'sl', code3: 'slv', name: 'Slovenian', nativeName: 'Slovenščina' },
	{ code: 'et', code3: 'est', name: 'Estonian', nativeName: 'Eesti' },
	{ code: 'lv', code3: 'lav', name: 'Latvian', nativeName: 'Latviešu' },
	{ code: 'lt', code3: 'lit', name: 'Lithuanian', nativeName: 'Lietuvių' },
	{ code: 'fa', code3: 'per', name: 'Persian', nativeName: 'فارسی' },
	{ code: 'bn', code3: 'ben', name: 'Bengali', nativeName: 'বাংলা' },
	{ code: 'ta', code3: 'tam', name: 'Tamil', nativeName: 'தமிழ்' },
	{ code: 'te', code3: 'tel', name: 'Telugu', nativeName: 'తెలుగు' },
	{ code: 'ml', code3: 'mal', name: 'Malayalam', nativeName: 'മലയാളം' },
	{ code: 'kn', code3: 'kan', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
	{ code: 'mr', code3: 'mar', name: 'Marathi', nativeName: 'मराठी' },
	{ code: 'gu', code3: 'guj', name: 'Gujarati', nativeName: 'ગુજરાતી' },
	{ code: 'pa', code3: 'pan', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' },
	{ code: 'ur', code3: 'urd', name: 'Urdu', nativeName: 'اردو' },
	{ code: 'ne', code3: 'nep', name: 'Nepali', nativeName: 'नेपाली' },
	{ code: 'si', code3: 'sin', name: 'Sinhala', nativeName: 'සිංහල' },
	{ code: 'my', code3: 'bur', name: 'Burmese', nativeName: 'မြန်မာဘာသာ' },
	{ code: 'km', code3: 'khm', name: 'Khmer', nativeName: 'ខ្មែរ' },
	{ code: 'lo', code3: 'lao', name: 'Lao', nativeName: 'ລາວ' },
	{ code: 'mn', code3: 'mon', name: 'Mongolian', nativeName: 'Монгол' },
	{ code: 'ka', code3: 'geo', name: 'Georgian', nativeName: 'ქართული' },
	{ code: 'az', code3: 'aze', name: 'Azerbaijani', nativeName: 'Azərbaycan' },
	{ code: 'kk', code3: 'kaz', name: 'Kazakh', nativeName: 'Қазақша' },
	{ code: 'uz', code3: 'uzb', name: 'Uzbek', nativeName: "O'zbek" },
	{ code: 'tl', code3: 'tgl', name: 'Tagalog', nativeName: 'Tagalog' },
	{ code: 'sw', code3: 'swa', name: 'Swahili', nativeName: 'Kiswahili' },
	{ code: 'am', code3: 'amh', name: 'Amharic', nativeName: 'አማርኛ' },
	{ code: 'is', code3: 'ice', name: 'Icelandic', nativeName: 'Íslenska' },
	{ code: 'mk', code3: 'mac', name: 'Macedonian', nativeName: 'Македонски' },
	{ code: 'bs', code3: 'bos', name: 'Bosnian', nativeName: 'Bosanski' },
	{ code: 'sq', code3: 'alb', name: 'Albanian', nativeName: 'Shqip' },
	{ code: 'cy', code3: 'wel', name: 'Welsh', nativeName: 'Cymraeg' },
	{ code: 'ga', code3: 'gle', name: 'Irish', nativeName: 'Gaeilge' },
	{ code: 'mt', code3: 'mlt', name: 'Maltese', nativeName: 'Malti' },
	{ code: 'eu', code3: 'baq', name: 'Basque', nativeName: 'Euskara' },
	{ code: 'ca', code3: 'cat', name: 'Catalan', nativeName: 'Català' },
	{ code: 'gl', code3: 'glg', name: 'Galician', nativeName: 'Galego' },
	{ code: 'af', code3: 'afr', name: 'Afrikaans', nativeName: 'Afrikaans' },
	{ code: 'hy', code3: 'arm', name: 'Armenian', nativeName: 'Հdelays' },
	{ code: 'be', code3: 'bel', name: 'Belarusian', nativeName: 'Беларуская' },
	{ code: 'ku', code3: 'kur', name: 'Kurdish', nativeName: 'Kurdî' },
	{ code: 'eo', code3: 'epo', name: 'Esperanto', nativeName: 'Esperanto' }
] as const;

/**
 * All language codes including variants, for dropdown/select options
 */
export const ALL_LANGUAGE_OPTIONS: readonly { code: string; name: string }[] =
	SUPPORTED_LANGUAGES.flatMap((lang) => [
		{ code: lang.code, name: lang.name },
		...(lang.variants ?? [])
	]);

/**
 * Set of all valid ISO 639-1 language codes for quick validation
 */
export const VALID_LANGUAGE_CODES: ReadonlySet<string> = new Set(
	SUPPORTED_LANGUAGES.flatMap((lang) => [lang.code, ...(lang.variants?.map((v) => v.code) ?? [])])
);

/**
 * Map for quick language name lookup by code
 */
export const LANGUAGE_CODE_TO_NAME: ReadonlyMap<string, string> = new Map(
	SUPPORTED_LANGUAGES.flatMap((lang) => [
		[lang.code, lang.name],
		...(lang.variants?.map((v) => [v.code, v.name] as [string, string]) ?? [])
	])
);

/**
 * Map for ISO 639-2 (3-letter) to ISO 639-1 (2-letter) conversion
 */
export const ISO639_2_TO_1: ReadonlyMap<string, string> = new Map(
	SUPPORTED_LANGUAGES.filter((lang) => lang.code3).map((lang) => [lang.code3!, lang.code])
);

/**
 * Common aliases for language codes
 */
const LANGUAGE_ALIASES: Record<string, string> = {
	pb: 'pt-br', // Brazilian Portuguese alias
	pob: 'pt-br', // Another Brazilian Portuguese alias
	chi: 'zh', // Chinese
	chs: 'zh-cn', // Chinese Simplified
	cht: 'zh-tw', // Chinese Traditional
	zht: 'zh-tw', // Chinese Traditional
	zhs: 'zh-cn', // Chinese Simplified
	nor: 'no', // Norwegian
	nob: 'no', // Norwegian Bokmål
	nno: 'no', // Norwegian Nynorsk
	ger: 'de', // German
	fre: 'fr', // French
	spa: 'es', // Spanish
	por: 'pt', // Portuguese
	jpn: 'ja', // Japanese
	kor: 'ko', // Korean
	ara: 'ar', // Arabic
	dut: 'nl', // Dutch
	rum: 'ro', // Romanian
	gre: 'el', // Greek
	heb: 'he', // Hebrew
	per: 'fa' // Persian/Farsi
};

/**
 * Validate if a language code is supported
 */
export function isValidLanguageCode(code: string): boolean {
	const lower = code.toLowerCase();
	return VALID_LANGUAGE_CODES.has(lower) || lower in LANGUAGE_ALIASES;
}

/**
 * Normalize a language code (lowercase, handle variants and aliases)
 */
export function normalizeLanguageCode(code: string): string {
	const lower = code.toLowerCase().trim();

	// Check if it's a valid 2-letter code
	if (VALID_LANGUAGE_CODES.has(lower)) {
		return lower;
	}

	// Try to convert from 3-letter code
	const converted = ISO639_2_TO_1.get(lower);
	if (converted) {
		return converted;
	}

	// Check aliases
	const aliased = LANGUAGE_ALIASES[lower];
	if (aliased) {
		return aliased;
	}

	return lower;
}

/**
 * Get language name from code
 */
export function getLanguageName(code: string): string {
	const normalized = normalizeLanguageCode(code);
	return LANGUAGE_CODE_TO_NAME.get(normalized) ?? code.toUpperCase();
}
