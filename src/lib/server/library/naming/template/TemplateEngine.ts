/**
 * Template Engine for naming format strings
 *
 * Handles parsing, validation, and rendering of naming templates
 * with support for tokens and conditional blocks.
 */

import type { TokenRegistry } from '../tokens/registry';
import type { MediaNamingInfo, NamingConfig } from '../NamingService';
import type { TemplateParseResult, ParsedToken, TemplateError, TemplateWarning } from './types';

/**
 * Simple tokens: {Token} or {Token:spec}
 * Content is captured generally so names may contain spaces (e.g. {Movie Title});
 * whether the content is a real token attempt is decided by looksLikeToken().
 */
const SIMPLE_TOKEN_PATTERN = /\{([^{}]+)\}/g;

/**
 * Inner token inside a conditional block: name must not contain ':',
 * the optional format spec may contain anything except braces.
 */
const CONDITIONAL_INNER_TOKEN_PATTERN = /\{([^{}:]+(?::[^{}]+)?)\}/g;

/**
 * Conditional blocks: {prefix{Token}suffix}, e.g. {[{HDR}]}, {edition-{Edition}}
 * (parse side - records a single representative inner token per block)
 */
const CONDITIONAL_PARSE_PATTERN = /\{([^{}]*)\{([^{}:]+(?::[^{}]+)?)\}([^{}]*)\}/g;

/**
 * Conditional blocks (render side) - supports multiple inner tokens:
 * {[{AudioCodec} {AudioChannels}]}
 */
const CONDITIONAL_RENDER_PATTERN = /\{([^{}]*(?:\{[^{}:]+(?::[^{}]+)?\}[^{}]*)+)\}/g;

/**
 * Split a captured token into name and format spec on the FIRST colon only.
 */
function splitToken(token: string): { name: string; formatSpec?: string } {
	const colonIndex = token.indexOf(':');
	if (colonIndex === -1) return { name: token };
	return { name: token.slice(0, colonIndex), formatSpec: token.slice(colonIndex + 1) };
}

/**
 * Whether brace content looks like a token attempt (as opposed to literal
 * punctuation like '{...}' or '{123}'): the name must contain an ASCII letter.
 */
function looksLikeToken(name: string): boolean {
	return /[A-Za-z]/.test(name);
}

/**
 * Template Engine for processing naming format strings
 */
export class TemplateEngine {
	constructor(private registry: TokenRegistry) {}

	/**
	 * Parse and validate a format string
	 */
	parse(format: string): TemplateParseResult {
		const tokens: ParsedToken[] = [];
		const errors: TemplateError[] = [];
		const warnings: TemplateWarning[] = [];

		// Find conditional blocks: {prefix{Token}suffix}
		const conditionalMatches = format.matchAll(CONDITIONAL_PARSE_PATTERN);

		for (const match of conditionalMatches) {
			const [fullMatch, , token] = match;
			const { name, formatSpec } = splitToken(token);
			const position = match.index ?? 0;

			// Punctuation-only brace content is not a token attempt
			if (!looksLikeToken(name)) continue;

			tokens.push({
				name,
				formatSpec,
				position,
				length: fullMatch.length,
				isConditional: true
			});

			// Validate token exists
			const validation = this.registry.validate(name);
			if (!validation.valid) {
				errors.push({
					position,
					length: fullMatch.length,
					message: validation.suggestion
						? `Unknown token '${name}'. Did you mean '${validation.suggestion}'?`
						: `Unknown token '${name}'`,
					token: name,
					suggestion: validation.suggestion
				});
			}
		}

		// Find simple tokens: {Token} or {Token:spec}
		const tokenMatches = format.matchAll(SIMPLE_TOKEN_PATTERN);

		for (const match of tokenMatches) {
			const [fullMatch, token] = match;
			const { name, formatSpec } = splitToken(token);
			const position = match.index ?? 0;

			// Punctuation-only brace content is not a token attempt
			if (!looksLikeToken(name)) continue;

			// Skip if this position was already handled as part of a conditional block
			const isPartOfConditional = tokens.some(
				(t) => t.isConditional && position >= t.position && position < t.position + t.length
			);

			if (!isPartOfConditional) {
				tokens.push({
					name,
					formatSpec,
					position,
					length: fullMatch.length,
					isConditional: false
				});

				// Validate token exists
				const validation = this.registry.validate(name);
				if (!validation.valid) {
					errors.push({
						position,
						length: fullMatch.length,
						message: validation.suggestion
							? `Unknown token '${name}'. Did you mean '${validation.suggestion}'?`
							: `Unknown token '${name}'`,
						token: name,
						suggestion: validation.suggestion
					});
				}
			}
		}

		return {
			valid: errors.length === 0,
			errors,
			warnings,
			tokens
		};
	}

	/**
	 * Render a format string with data
	 */
	render(format: string, info: MediaNamingInfo, config: NamingConfig): string {
		let result = format;

		// Process conditional blocks first: {prefix{Token}suffix}
		result = this.processConditionalBlocks(result, info, config);

		// Replace standard tokens
		result = this.replaceTokens(result, info, config);

		return result;
	}

	/**
	 * Process conditional blocks like {[{Quality}]} or {edition-{Edition}}
	 * Only includes the block content if at least one inner token has a value.
	 * Supports multiple tokens inside: {[{AudioCodec} {AudioChannels}]}
	 */
	private processConditionalBlocks(
		format: string,
		info: MediaNamingInfo,
		config: NamingConfig
	): string {
		return format.replace(CONDITIONAL_RENDER_PATTERN, (match, innerContent: string) => {
			// Check if this contains any {Token} patterns
			const tokens = [...innerContent.matchAll(CONDITIONAL_INNER_TOKEN_PATTERN)];

			if (tokens.length === 0) {
				// No tokens found, return as-is (shouldn't happen with our pattern)
				return match;
			}

			// If none of the inner tokens look like token attempts, keep the block literal
			const meaningful = tokens.some((m) => looksLikeToken(splitToken(m[1]).name));
			if (!meaningful) return match;

			// Replace all tokens in the inner content
			let result = innerContent;
			let hasAnyValue = false;

			for (const tokenMatch of tokens) {
				const [fullToken, token] = tokenMatch;
				const { name, formatSpec } = splitToken(token);

				// Leave non-token content (e.g. {...}) as literal text
				if (!looksLikeToken(name)) continue;

				const value = this.registry.render(name, info, config, formatSpec);

				if (value && value.trim()) {
					hasAnyValue = true;
					result = result.replace(fullToken, value);
				} else {
					result = result.replace(fullToken, '');
				}
			}

			// Only return the content if at least one token had a value
			if (hasAnyValue) {
				// Clean up any empty spaces from missing tokens
				// Also remove spaces adjacent to brackets
				return result.replace(/\s+/g, ' ').replace(/\[\s+/g, '[').replace(/\s+\]/g, ']').trim();
			}
			return '';
		});
	}

	/**
	 * Replace simple tokens like {Title}, {Year}
	 */
	private replaceTokens(format: string, info: MediaNamingInfo, config: NamingConfig): string {
		return format.replace(SIMPLE_TOKEN_PATTERN, (match, token: string) => {
			const { name, formatSpec } = splitToken(token);

			// Leave non-token content (e.g. {123}, {...}) as literal text
			if (!looksLikeToken(name)) return match;

			return this.registry.render(name, info, config, formatSpec);
		});
	}

	/**
	 * Get all tokens used in a format string
	 */
	getUsedTokens(format: string): string[] {
		const result = this.parse(format);
		return [...new Set(result.tokens.map((t) => t.name))];
	}
}
