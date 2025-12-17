/**
 * Token Registry - single source of truth for all naming tokens
 */

import type { MediaNamingInfo, NamingConfig } from '../NamingService';
import type {
	TokenDefinition,
	TokenCategory,
	TokenApplicability,
	TokenMetadata,
	TokenValidationResult
} from './types';

/**
 * Central registry for all naming tokens
 */
export class TokenRegistry {
	private tokens: Map<string, TokenDefinition> = new Map();
	private aliasMap: Map<string, string> = new Map();

	/**
	 * Register a token definition
	 */
	register(token: TokenDefinition): void {
		const normalizedName = token.name.toLowerCase();
		this.tokens.set(normalizedName, token);

		if (token.aliases) {
			for (const alias of token.aliases) {
				this.aliasMap.set(alias.toLowerCase(), normalizedName);
			}
		}
	}

	/**
	 * Register multiple tokens at once
	 */
	registerAll(tokens: TokenDefinition[]): void {
		for (const token of tokens) {
			this.register(token);
		}
	}

	/**
	 * Get a token by name (case-insensitive)
	 */
	get(name: string): TokenDefinition | undefined {
		const normalized = name.toLowerCase();

		// Check direct match first
		const direct = this.tokens.get(normalized);
		if (direct) return direct;

		// Check aliases
		const aliasTarget = this.aliasMap.get(normalized);
		if (aliasTarget) {
			return this.tokens.get(aliasTarget);
		}

		return undefined;
	}

	/**
	 * Check if a token exists
	 */
	has(name: string): boolean {
		return this.get(name) !== undefined;
	}

	/**
	 * Get all registered tokens
	 */
	getAll(): TokenDefinition[] {
		return Array.from(this.tokens.values());
	}

	/**
	 * Get tokens filtered by category
	 */
	getByCategory(category: TokenCategory): TokenDefinition[] {
		return this.getAll().filter((t) => t.category === category);
	}

	/**
	 * Get tokens filtered by media type applicability
	 */
	getForMediaType(type: TokenApplicability): TokenDefinition[] {
		return this.getAll().filter((t) => t.applicability.includes(type));
	}

	/**
	 * Validate a token name and suggest alternatives for typos
	 */
	validate(name: string): TokenValidationResult {
		if (this.has(name)) {
			return { valid: true };
		}

		// Find similar tokens for suggestions
		const normalized = name.toLowerCase();
		const allNames = this.getAllNames();

		// Simple Levenshtein-like matching for suggestions
		let bestMatch: string | undefined;
		let bestScore = Infinity;

		for (const tokenName of allNames) {
			const score = this.levenshteinDistance(normalized, tokenName);
			if (score < bestScore && score <= 3) {
				bestScore = score;
				bestMatch = tokenName;
			}
		}

		return {
			valid: false,
			suggestion: bestMatch
		};
	}

	/**
	 * Render a token value
	 */
	render(name: string, info: MediaNamingInfo, config: NamingConfig, formatSpec?: string): string {
		const token = this.get(name);
		if (!token) {
			return '';
		}
		return token.render(info, config, formatSpec);
	}

	/**
	 * Get all token names including aliases
	 */
	private getAllNames(): string[] {
		const names: string[] = [];
		for (const token of this.tokens.values()) {
			names.push(token.name.toLowerCase());
			if (token.aliases) {
				names.push(...token.aliases.map((a) => a.toLowerCase()));
			}
		}
		return names;
	}

	/**
	 * Simple Levenshtein distance for typo detection
	 */
	private levenshteinDistance(a: string, b: string): number {
		const matrix: number[][] = [];

		for (let i = 0; i <= b.length; i++) {
			matrix[i] = [i];
		}
		for (let j = 0; j <= a.length; j++) {
			matrix[0][j] = j;
		}

		for (let i = 1; i <= b.length; i++) {
			for (let j = 1; j <= a.length; j++) {
				if (b.charAt(i - 1) === a.charAt(j - 1)) {
					matrix[i][j] = matrix[i - 1][j - 1];
				} else {
					matrix[i][j] = Math.min(
						matrix[i - 1][j - 1] + 1,
						matrix[i][j - 1] + 1,
						matrix[i - 1][j] + 1
					);
				}
			}
		}

		return matrix[b.length][a.length];
	}

	/**
	 * Get metadata for all tokens (for API/UI consumption)
	 */
	getMetadata(): TokenMetadata[] {
		return this.getAll().map((token) => ({
			name: token.name,
			aliases: token.aliases,
			category: token.category,
			description: token.description,
			example: token.example,
			applicability: token.applicability,
			supportsFormatSpec: token.supportsFormatSpec
		}));
	}

	/**
	 * Get metadata organized by category (for API/UI consumption)
	 */
	getMetadataByCategory(): Record<TokenCategory, TokenMetadata[]> {
		const result: Record<TokenCategory, TokenMetadata[]> = {
			core: [],
			quality: [],
			video: [],
			audio: [],
			release: [],
			mediaId: [],
			episode: []
		};

		for (const token of this.getAll()) {
			result[token.category].push({
				name: token.name,
				aliases: token.aliases,
				category: token.category,
				description: token.description,
				example: token.example,
				applicability: token.applicability,
				supportsFormatSpec: token.supportsFormatSpec
			});
		}

		return result;
	}
}

/**
 * Global token registry instance
 */
export const tokenRegistry = new TokenRegistry();
