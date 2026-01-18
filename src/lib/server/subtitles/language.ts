/**
 * Language Class - Based on Bazarr/Subliminal architecture
 *
 * Rich language representation with forced/HI as first-class attributes.
 * Supports language equivalence and per-provider converters.
 */

import { SUPPORTED_LANGUAGES, type LanguageCode, type LanguageDefinition } from './types';

/**
 * Language class with forced/hearing impaired as first-class attributes
 *
 * Based on Bazarr's subzero/language.py Language class
 */
export class Language {
	/** ISO 639-1 code (2-letter) */
	readonly alpha2: string;

	/** ISO 639-2 code (3-letter) */
	readonly alpha3: string;

	/** English name */
	readonly name: string;

	/** Native name */
	readonly nativeName?: string;

	/** Country/region code (e.g., 'BR' for pt-BR) */
	readonly country?: string;

	/** Script variant (e.g., 'Latn', 'Cyrl') */
	readonly script?: string;

	/** Whether this is forced subtitles */
	forced: boolean;

	/** Whether this is for hearing impaired (SDH/CC) */
	hi: boolean;

	constructor(alpha2: string, options: LanguageOptions = {}) {
		this.alpha2 = alpha2.toLowerCase();
		this.forced = options.forced ?? false;
		this.hi = options.hi ?? false;
		this.country = options.country;
		this.script = options.script;

		// Look up language definition
		const langDef = Language.findDefinition(this.alpha2);
		this.alpha3 = langDef?.code3 ?? this.alpha2;
		this.name = langDef?.name ?? alpha2;
		this.nativeName = langDef?.nativeName;
	}

	/**
	 * Find language definition from SUPPORTED_LANGUAGES
	 */
	private static findDefinition(code: string): LanguageDefinition | undefined {
		const normalizedCode = code.toLowerCase();

		// Check main languages
		const mainLang = SUPPORTED_LANGUAGES.find((l) => l.code === normalizedCode);
		if (mainLang) return mainLang;

		// Check variants (e.g., pt-br)
		for (const lang of SUPPORTED_LANGUAGES) {
			if (lang.variants) {
				const variant = lang.variants.find((v) => v.code === normalizedCode);
				if (variant) {
					return {
						...lang,
						code: variant.code,
						name: variant.name
					};
				}
			}
		}

		return undefined;
	}

	/**
	 * Create Language from ISO 639-1 or 639-2 code
	 */
	static fromCode(code: string, options: LanguageOptions = {}): Language {
		// Handle 3-letter codes
		if (code.length === 3) {
			const langDef = SUPPORTED_LANGUAGES.find((l) => l.code3 === code.toLowerCase());
			if (langDef) {
				return new Language(langDef.code, options);
			}
		}
		return new Language(code, options);
	}

	/**
	 * Create Language from alpha3 (ISO 639-2) code
	 */
	static fromAlpha3(alpha3: string, options: LanguageOptions = {}): Language {
		return Language.fromCode(alpha3, options);
	}

	/**
	 * Create a new Language with modified attributes (like Bazarr's rebuild)
	 */
	rebuild(overrides: Partial<LanguageOptions> = {}): Language {
		return new Language(this.alpha2, {
			forced: overrides.forced ?? this.forced,
			hi: overrides.hi ?? this.hi,
			country: overrides.country ?? this.country,
			script: overrides.script ?? this.script
		});
	}

	/**
	 * Create forced variant
	 */
	toForced(): Language {
		return this.rebuild({ forced: true, hi: false });
	}

	/**
	 * Create hearing impaired variant
	 */
	toHearingImpaired(): Language {
		return this.rebuild({ hi: true, forced: false });
	}

	/**
	 * Create regular (non-forced, non-HI) variant
	 */
	toRegular(): Language {
		return this.rebuild({ forced: false, hi: false });
	}

	/**
	 * Check equality (including forced/hi attributes)
	 */
	equals(other: Language): boolean {
		return (
			this.alpha2 === other.alpha2 &&
			this.country === other.country &&
			this.script === other.script &&
			this.forced === other.forced &&
			this.hi === other.hi
		);
	}

	/**
	 * Check if languages are equivalent (ignoring forced/hi)
	 */
	isEquivalent(other: Language): boolean {
		return (
			this.alpha2 === other.alpha2 && this.country === other.country && this.script === other.script
		);
	}

	/**
	 * Get string representation for display
	 */
	toString(): string {
		let result = this.name;
		if (this.country) {
			result += ` (${this.country})`;
		}
		if (this.forced) {
			result += ' [Forced]';
		}
		if (this.hi) {
			result += ' [HI]';
		}
		return result;
	}

	/**
	 * Get code for file naming
	 */
	toFileCode(): string {
		let code = this.alpha2;
		if (this.country) {
			code += `-${this.country.toLowerCase()}`;
		}
		if (this.forced) {
			code += '.forced';
		}
		if (this.hi) {
			code += '.hi';
		}
		return code;
	}

	/**
	 * Get simple code (alpha2 with optional country)
	 */
	get code(): LanguageCode {
		if (this.country) {
			return `${this.alpha2}-${this.country.toLowerCase()}`;
		}
		return this.alpha2;
	}

	/**
	 * Parse language from string (e.g., "en", "pt-br", "en.forced", "en.hi")
	 */
	static parse(input: string): Language {
		const parts = input.toLowerCase().split('.');
		const [langPart, ...flags] = parts;

		const forced = flags.includes('forced') || flags.includes('force');
		const hi = flags.includes('hi') || flags.includes('sdh') || flags.includes('cc');

		// Handle language with country (e.g., pt-br)
		const [alpha2, country] = langPart.split('-');

		return new Language(alpha2, {
			forced,
			hi,
			country: country?.toUpperCase()
		});
	}
}

/**
 * Language constructor options
 */
export interface LanguageOptions {
	forced?: boolean;
	hi?: boolean;
	country?: string;
	script?: string;
}

/**
 * Language equivalence system - treat certain language pairs as equal
 *
 * Based on Bazarr's _LanguageEquals pattern
 */
export class LanguageEquivalence {
	private equivalences: Map<string, Set<string>> = new Map();

	constructor(pairs: LanguageEquivalencePair[] = []) {
		for (const pair of pairs) {
			this.addEquivalence(pair.from, pair.to);
		}
	}

	/**
	 * Add an equivalence between two language codes
	 */
	addEquivalence(from: string, to: string): void {
		const fromNorm = from.toLowerCase();
		const toNorm = to.toLowerCase();

		if (!this.equivalences.has(fromNorm)) {
			this.equivalences.set(fromNorm, new Set());
		}
		this.equivalences.get(fromNorm)!.add(toNorm);
	}

	/**
	 * Get all equivalent languages for a given code
	 */
	getEquivalent(code: string): string[] {
		const normalized = code.toLowerCase();
		const equivalents = this.equivalences.get(normalized);
		if (equivalents) {
			return [normalized, ...equivalents];
		}
		return [normalized];
	}

	/**
	 * Check if two language codes are equivalent
	 */
	areEquivalent(code1: string, code2: string): boolean {
		const norm1 = code1.toLowerCase();
		const norm2 = code2.toLowerCase();

		if (norm1 === norm2) return true;

		// Check if code2 is equivalent to code1
		const equivs1 = this.equivalences.get(norm1);
		if (equivs1?.has(norm2)) return true;

		// Check reverse
		const equivs2 = this.equivalences.get(norm2);
		if (equivs2?.has(norm1)) return true;

		return false;
	}

	/**
	 * Expand a set of languages to include all equivalents
	 */
	expandLanguages(languages: Language[]): Language[] {
		const result: Language[] = [...languages];
		const seenCodes = new Set(languages.map((l) => l.code));

		for (const lang of languages) {
			const equivalents = this.getEquivalent(lang.code);
			for (const equiv of equivalents) {
				if (!seenCodes.has(equiv)) {
					seenCodes.add(equiv);
					result.push(
						lang.rebuild({ country: equiv.includes('-') ? equiv.split('-')[1] : undefined })
					);
				}
			}
		}

		return result;
	}
}

/**
 * Language equivalence pair
 */
export interface LanguageEquivalencePair {
	from: string;
	to: string;
}

/**
 * Default language equivalences (common mappings)
 */
export const DEFAULT_LANGUAGE_EQUIVALENCES: LanguageEquivalencePair[] = [
	// Portuguese variants
	{ from: 'pt-br', to: 'pt' },
	{ from: 'pt', to: 'pt-br' },
	// Spanish variants
	{ from: 'es-la', to: 'es' },
	{ from: 'es', to: 'es-la' },
	// Chinese variants
	{ from: 'zh-cn', to: 'zh' },
	{ from: 'zh-tw', to: 'zh' },
	// French variants
	{ from: 'fr-ca', to: 'fr' },
	{ from: 'fr', to: 'fr-ca' }
];

/**
 * Provider-specific language converter
 *
 * Maps internal language codes to provider-specific codes
 */
export class LanguageConverter {
	private readonly toProvider: Map<string, string> = new Map();
	private readonly fromProvider: Map<string, string> = new Map();

	constructor(mappings: LanguageMapping[]) {
		for (const mapping of mappings) {
			this.toProvider.set(mapping.internal.toLowerCase(), mapping.provider);
			this.fromProvider.set(mapping.provider.toLowerCase(), mapping.internal);
		}
	}

	/**
	 * Convert internal code to provider code
	 */
	convertTo(internalCode: string): string {
		return this.toProvider.get(internalCode.toLowerCase()) ?? internalCode;
	}

	/**
	 * Convert provider code to internal code
	 */
	convertFrom(providerCode: string): string {
		return this.fromProvider.get(providerCode.toLowerCase()) ?? providerCode;
	}
}

/**
 * Language mapping for provider conversion
 */
export interface LanguageMapping {
	internal: string;
	provider: string;
}

/**
 * Pre-built converters for common providers
 */
export const PROVIDER_LANGUAGE_CONVERTERS = {
	opensubtitles: new LanguageConverter([
		{ internal: 'pt-br', provider: 'pob' },
		{ internal: 'zh-cn', provider: 'zhs' },
		{ internal: 'zh-tw', provider: 'zht' }
	]),
	addic7ed: new LanguageConverter([
		{ internal: 'pt-br', provider: 'Portuguese (Brazilian)' },
		{ internal: 'es-la', provider: 'Spanish (Latin America)' }
	])
};

/**
 * Helper: Create Language from legacy LanguageCode string
 */
export function languageFromCode(code: LanguageCode, forced = false, hi = false): Language {
	return Language.parse(code).rebuild({ forced, hi });
}

/**
 * Helper: Convert Language to legacy LanguageCode string
 */
export function languageToCode(language: Language): LanguageCode {
	return language.code;
}
