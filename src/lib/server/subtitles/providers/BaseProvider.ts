/**
 * Base Subtitle Provider - Common functionality for all providers
 */

import type { ISubtitleProvider, ProviderTestResult } from './interfaces';
import type {
	SubtitleSearchCriteria,
	SubtitleSearchResult,
	SubtitleProviderConfig,
	ProviderSearchOptions,
	LanguageCode
} from '../types';
import { TimeoutError, ConnectionError } from '../errors/ProviderErrors';
import { logger } from '$lib/logging';

/**
 * Abstract base class for subtitle providers.
 * Implements common functionality and logging.
 */
export abstract class BaseSubtitleProvider implements ISubtitleProvider {
	protected config: SubtitleProviderConfig;

	constructor(config: SubtitleProviderConfig) {
		this.config = config;
	}

	/** Provider ID from config */
	get id(): string {
		return this.config.id;
	}

	/** Provider display name */
	get name(): string {
		return this.config.name;
	}

	/** Provider implementation type */
	abstract get implementation(): string;

	/** Languages supported by this provider */
	abstract get supportedLanguages(): LanguageCode[];

	/** Whether this provider supports hash-based matching */
	abstract get supportsHashSearch(): boolean;

	/**
	 * Search for subtitles - to be implemented by subclasses
	 */
	abstract search(
		criteria: SubtitleSearchCriteria,
		options?: ProviderSearchOptions
	): Promise<SubtitleSearchResult[]>;

	/**
	 * Download a subtitle - to be implemented by subclasses
	 */
	abstract download(result: SubtitleSearchResult): Promise<Buffer>;

	/**
	 * Test provider connectivity - to be implemented by subclasses
	 */
	abstract test(): Promise<ProviderTestResult>;

	/**
	 * Default implementation - checks if any requested language is supported
	 */
	canSearch(criteria: SubtitleSearchCriteria): boolean {
		// Check if we support at least one of the requested languages
		const hasLanguageSupport = criteria.languages.some((lang) =>
			this.supportedLanguages.includes(lang)
		);

		// Need at least a title or hash to search
		const hasSearchableInfo = criteria.title || criteria.videoHash;

		return hasLanguageSupport && !!hasSearchableInfo;
	}

	/**
	 * Helper: Log search operation
	 */
	protected logSearch(criteria: SubtitleSearchCriteria, resultCount: number): void {
		logger.debug(`[${this.name}] Search completed`, {
			provider: this.name,
			title: criteria.title,
			languages: criteria.languages,
			resultCount
		});
	}

	/**
	 * Helper: Log error
	 */
	protected logError(operation: string, error: unknown): void {
		logger.error(`[${this.name}] ${operation} failed`, {
			provider: this.name,
			error: error instanceof Error ? error.message : String(error)
		});
	}

	/**
	 * Helper: Make HTTP request with error handling
	 * Converts network errors to typed ProviderErrors for proper throttling
	 */
	protected async fetchWithTimeout(
		url: string,
		options: RequestInit & { timeout?: number } = {}
	): Promise<Response> {
		const { timeout = 30000, ...fetchOptions } = options;

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeout);

		try {
			const response = await fetch(url, {
				...fetchOptions,
				signal: controller.signal
			});
			return response;
		} catch (error) {
			// Convert network errors to typed errors for proper throttling
			if (error instanceof Error) {
				// AbortError from timeout
				if (error.name === 'AbortError') {
					throw new TimeoutError(this.implementation, timeout);
				}
				// Network errors (DNS, connection refused, etc.)
				if (
					error.message.includes('fetch failed') ||
					error.message.includes('ECONNREFUSED') ||
					error.message.includes('ENOTFOUND') ||
					error.message.includes('network')
				) {
					throw new ConnectionError(this.implementation, error.message);
				}
			}
			throw error;
		} finally {
			clearTimeout(timeoutId);
		}
	}

	/**
	 * Helper: Normalize language code to ISO 639-1
	 */
	protected normalizeLanguage(code: string): LanguageCode {
		// Handle common variations
		const normalized = code.toLowerCase().trim();

		// Map 3-letter codes to 2-letter
		const iso639_3to1: Record<string, string> = {
			eng: 'en',
			spa: 'es',
			fra: 'fr',
			fre: 'fr',
			deu: 'de',
			ger: 'de',
			ita: 'it',
			por: 'pt',
			rus: 'ru',
			jpn: 'ja',
			kor: 'ko',
			zho: 'zh',
			chi: 'zh',
			ara: 'ar',
			hin: 'hi',
			pol: 'pl',
			nld: 'nl',
			dut: 'nl',
			swe: 'sv',
			nor: 'no',
			dan: 'da',
			fin: 'fi',
			tur: 'tr',
			heb: 'he',
			tha: 'th',
			vie: 'vi',
			ind: 'id',
			ces: 'cs',
			cze: 'cs',
			slk: 'sk',
			slo: 'sk',
			hun: 'hu',
			ron: 'ro',
			rum: 'ro',
			bul: 'bg',
			hrv: 'hr',
			srp: 'sr',
			ukr: 'uk',
			ell: 'el',
			gre: 'el'
		};

		// If it's a 3-letter code, try to convert
		if (normalized.length === 3 && iso639_3to1[normalized]) {
			return iso639_3to1[normalized];
		}

		// If it's already 2 letters, return as-is
		if (normalized.length === 2) {
			return normalized;
		}

		// Return original if we can't normalize
		return normalized;
	}

	/**
	 * Helper: Detect subtitle format from filename/content
	 */
	protected detectFormat(filename: string): 'srt' | 'ass' | 'sub' | 'vtt' | 'ssa' | 'unknown' {
		const ext = filename.toLowerCase().split('.').pop();
		switch (ext) {
			case 'srt':
				return 'srt';
			case 'ass':
				return 'ass';
			case 'ssa':
				return 'ssa';
			case 'sub':
				return 'sub';
			case 'vtt':
				return 'vtt';
			default:
				return 'unknown';
		}
	}

	/**
	 * Helper: Check if subtitle is forced based on filename
	 */
	protected isForced(filename: string): boolean {
		const lower = filename.toLowerCase();
		return (
			lower.includes('.forced.') ||
			lower.includes('.force.') ||
			lower.includes('forced') ||
			lower.includes('.pgs.') // PGS subtitles are often forced
		);
	}

	/**
	 * Helper: Check if subtitle is for hearing impaired
	 */
	protected isHearingImpaired(filename: string): boolean {
		const lower = filename.toLowerCase();
		return (
			lower.includes('.hi.') ||
			lower.includes('.sdh.') ||
			lower.includes('.cc.') ||
			lower.includes('hearing') ||
			lower.includes('impaired')
		);
	}
}
