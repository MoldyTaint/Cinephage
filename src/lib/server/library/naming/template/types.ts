/**
 * Template engine types
 */

/**
 * Error found during template parsing
 */
export interface TemplateError {
	position: number;
	length: number;
	message: string;
	token?: string;
	/**
	 * Suggested token name for typos (Levenshtein-based, alias-aware)
	 */
	suggestion?: string;
}

/**
 * Warning found during template parsing
 */
export interface TemplateWarning {
	position: number;
	message: string;
	suggestion?: string;
}

/**
 * Parsed token from a template
 */
export interface ParsedToken {
	name: string;
	formatSpec?: string;
	position: number;
	length: number;
	isConditional: boolean;
}

/**
 * Result of parsing a template
 */
export interface TemplateParseResult {
	valid: boolean;
	errors: TemplateError[];
	warnings: TemplateWarning[];
	tokens: ParsedToken[];
}
