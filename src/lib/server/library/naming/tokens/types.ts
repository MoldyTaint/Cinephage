/**
 * Token types for the naming system
 */

import type { MediaNamingInfo, NamingConfig } from '../NamingService';

/**
 * Categories for organizing tokens in the UI
 */
export type TokenCategory =
	| 'core'
	| 'quality'
	| 'video'
	| 'audio'
	| 'release'
	| 'mediaId'
	| 'episode'
	| 'collection';

/**
 * Media types a token can apply to
 */
export type TokenApplicability = 'movie' | 'series' | 'episode';

/**
 * Definition for a single naming token
 */
export interface TokenDefinition {
	/**
	 * Token name (case-insensitive) e.g., "CleanTitle"
	 */
	name: string;

	/**
	 * Alternative names that map to the same token
	 */
	aliases?: string[];

	/**
	 * Category for UI organization
	 */
	category: TokenCategory;

	/**
	 * Human-readable description
	 */
	description: string;

	/**
	 * Example usage in a format string
	 */
	example?: string;

	/**
	 * What media types this token applies to
	 */
	applicability: TokenApplicability[];

	/**
	 * Whether the token supports format specifiers like :00
	 */
	supportsFormatSpec?: boolean;

	/**
	 * Render function that produces the token value
	 */
	render: (info: MediaNamingInfo, config: NamingConfig, formatSpec?: string) => string;
}

/**
 * Token metadata for UI display (without render function)
 */
export interface TokenMetadata {
	name: string;
	aliases?: string[];
	category: TokenCategory;
	description: string;
	example?: string;
	applicability: TokenApplicability[];
	supportsFormatSpec?: boolean;
}

/**
 * Result of token validation
 */
export interface TokenValidationResult {
	valid: boolean;
	suggestion?: string;
}
