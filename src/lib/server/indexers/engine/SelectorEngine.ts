/**
 * Selector engine for Cardigann definitions.
 * Handles CSS selectors for HTML and JSONPath-like selectors for JSON.
 */

import * as cheerio from 'cheerio';
import type { CheerioAPI, Cheerio } from 'cheerio';
import type { AnyNode, Element } from 'domhandler';
import type { SelectorBlock, FieldDefinition } from '../schema/yamlDefinition';
import type { TemplateEngine } from './TemplateEngine';
import type { FilterEngine } from './FilterEngine';

export type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];

/**
 * Result from selector extraction.
 */
export interface SelectorResult {
	value: string | null;
	optional: boolean;
}

export class SelectorEngine {
	private templateEngine?: TemplateEngine;
	private filterEngine?: FilterEngine;

	constructor(templateEngine?: TemplateEngine, filterEngine?: FilterEngine) {
		this.templateEngine = templateEngine;
		this.filterEngine = filterEngine;
	}

	/**
	 * Set engines for template expansion and filter application.
	 */
	setEngines(templateEngine: TemplateEngine, filterEngine: FilterEngine): void {
		this.templateEngine = templateEngine;
		this.filterEngine = filterEngine;
	}

	// ============================================================================
	// HTML Selection (using cheerio)
	// ============================================================================

	/**
	 * Select a single value from HTML using a SelectorBlock.
	 */
	selectHtml(
		$: CheerioAPI,
		element: Cheerio<AnyNode>,
		selector: SelectorBlock | FieldDefinition,
		required = true
	): SelectorResult {
		// Handle simple string selectors
		if (typeof selector === 'string') {
			const value = this.selectHtmlSimple($, element, selector);
			return { value, optional: false };
		}

		const selectorBlock = selector as SelectorBlock;

		// Handle text field (static text with template)
		if (selectorBlock.text !== undefined) {
			let text = String(selectorBlock.text); // Convert to string (might be number)
			if (this.templateEngine) {
				text = this.templateEngine.expand(text);
			}
			const filtered = this.applyFilters(text, selectorBlock.filters);
			return { value: filtered, optional: selectorBlock.optional ?? false };
		}

		// Get the element to select from
		let selection: ReturnType<typeof $>;
		let value: string | null;

		if (selectorBlock.selector) {
			// Expand template in selector
			let selectorStr = selectorBlock.selector;
			if (this.templateEngine) {
				selectorStr = this.templateEngine.expand(selectorStr);
			}

			// Handle :root pseudo-selector
			if (selectorStr.startsWith(':root')) {
				selectorStr = selectorStr.substring(5);
				selection = $.root();
			} else {
				selection = element;
			}

			// Check if element matches selector or find within
			if (selectorStr) {
				const matched = selection.is(selectorStr) ? selection : selection.find(selectorStr);
				if (matched.length === 0) {
					if (required && !selectorBlock.optional) {
						throw new Error(`Selector "${selectorBlock.selector}" didn't match any elements`);
					}
					return {
						value: selectorBlock.default !== undefined ? String(selectorBlock.default) : null,
						optional: selectorBlock.optional ?? false
					};
				}
				selection = matched.first();
			}
		} else {
			selection = element;
		}

		// Handle remove (remove child elements before extraction)
		if (selectorBlock.remove) {
			selection.find(selectorBlock.remove).remove();
		}

		// Handle case (switch/case value mapping)
		if (selectorBlock.case) {
			for (const [caseSelector, caseValue] of Object.entries(selectorBlock.case)) {
				// Check if element matches case selector
				if (selection.is(caseSelector) || selection.find(caseSelector).length > 0) {
					let expandedValue = caseValue;
					if (this.templateEngine) {
						expandedValue = this.templateEngine.expand(caseValue);
					}
					const filtered = this.applyFilters(expandedValue, selectorBlock.filters);
					return { value: filtered, optional: selectorBlock.optional ?? false };
				}
			}

			// No case matched
			if (required && !selectorBlock.optional) {
				throw new Error(`None of the case selectors matched`);
			}
			return {
				value: selectorBlock.default !== undefined ? String(selectorBlock.default) : null,
				optional: selectorBlock.optional ?? false
			};
		}

		// Extract value
		if (selectorBlock.attribute) {
			value = selection.attr(selectorBlock.attribute) ?? null;
			if (value === null && required && !selectorBlock.optional) {
				throw new Error(`Attribute "${selectorBlock.attribute}" not found`);
			}
		} else {
			value = selection.text().trim();
		}

		// Apply default if no value
		if ((value === null || value === '') && selectorBlock.default !== undefined) {
			value = String(selectorBlock.default);
		}

		// Apply filters
		if (value !== null) {
			value = this.applyFilters(value, selectorBlock.filters);
		}

		return { value, optional: selectorBlock.optional ?? false };
	}

	/**
	 * Simple CSS selector extraction.
	 */
	private selectHtmlSimple(
		$: CheerioAPI,
		element: Cheerio<AnyNode>,
		selector: string
	): string | null {
		const selected = element.is(selector) ? element : element.find(selector);
		if (selected.length === 0) return null;
		return selected.first().text().trim();
	}

	/**
	 * Select all matching elements from HTML.
	 */
	selectHtmlAll($: CheerioAPI, element: Cheerio<AnyNode>, selector: string): Cheerio<Element>[] {
		let selectorStr = selector;
		let root = element;

		// Handle :root pseudo-selector
		if (selectorStr.startsWith(':root')) {
			selectorStr = selectorStr.substring(5).trim();
			root = $.root();
		}

		const elements = root.find(selectorStr);
		const result: Cheerio<Element>[] = [];

		elements.each((_, el) => {
			result.push($(el as Element));
		});

		return result;
	}

	/**
	 * Parse HTML string and return cheerio API.
	 */
	parseHtml(html: string): CheerioAPI {
		return cheerio.load(html);
	}

	// ============================================================================
	// JSON Selection (JSONPath-like)
	// ============================================================================

	/**
	 * Select a single value from JSON using a SelectorBlock.
	 */
	selectJson(
		obj: JsonValue,
		selector: SelectorBlock | FieldDefinition,
		required = true
	): SelectorResult {
		// Handle simple string selectors
		if (typeof selector === 'string') {
			const value = this.selectJsonPath(obj, selector);
			return { value: value !== null ? String(value) : null, optional: false };
		}

		const selectorBlock = selector as SelectorBlock;

		// Handle text field (static text with template)
		if (selectorBlock.text !== undefined) {
			let text = String(selectorBlock.text);
			if (this.templateEngine) {
				text = this.templateEngine.expand(text);
			}
			const filtered = this.applyFilters(text, selectorBlock.filters);
			return { value: filtered, optional: selectorBlock.optional ?? false };
		}

		let value: string | null = null;

		if (selectorBlock.selector) {
			// Expand template in selector
			let selectorStr = selectorBlock.selector;
			if (this.templateEngine) {
				selectorStr = this.templateEngine.expand(selectorStr);
			}

			// Remove leading dot if present (JSON selectors don't need it)
			selectorStr = selectorStr.replace(/^\./, '');

			const selected = this.selectJsonPath(obj, selectorStr);

			if (selected === null || selected === undefined) {
				if (required && !selectorBlock.optional) {
					throw new Error(`Selector "${selectorBlock.selector}" didn't match JSON content`);
				}
				return {
					value: selectorBlock.default !== undefined ? String(selectorBlock.default) : null,
					optional: selectorBlock.optional ?? false
				};
			}

			// Handle arrays
			if (Array.isArray(selected)) {
				value = selected.join(',');
			} else {
				value = String(selected);
			}
		}

		// Handle case (switch/case value mapping)
		if (selectorBlock.case && value !== null) {
			for (const [caseKey, caseValue] of Object.entries(selectorBlock.case)) {
				if (value === caseKey || caseKey === '*') {
					let expandedValue = caseValue;
					if (this.templateEngine) {
						expandedValue = this.templateEngine.expand(caseValue);
					}
					const filtered = this.applyFilters(expandedValue, selectorBlock.filters);
					return { value: filtered, optional: selectorBlock.optional ?? false };
				}
			}

			// No case matched, check for default '*' case
			if (!selectorBlock.case['*']) {
				if (required && !selectorBlock.optional) {
					throw new Error(`None of the case values matched "${value}"`);
				}
				return {
					value: selectorBlock.default !== undefined ? String(selectorBlock.default) : null,
					optional: selectorBlock.optional ?? false
				};
			}
		}

		// Apply default if no value
		if ((value === null || value === '') && selectorBlock.default !== undefined) {
			value = String(selectorBlock.default);
		}

		// Apply filters
		if (value !== null) {
			value = this.applyFilters(value, selectorBlock.filters);
		}

		return { value, optional: selectorBlock.optional ?? false };
	}

	/**
	 * Select using JSONPath-like syntax.
	 * Supports: dot notation (a.b.c), array index (a[0]), and basic filters.
	 */
	selectJsonPath(obj: JsonValue, path: string): JsonValue | null {
		if (!path || obj === null || obj === undefined) {
			return obj;
		}

		let current: JsonValue = obj;
		const parts = this.parseJsonPath(path);

		for (const part of parts) {
			if (current === null || current === undefined) {
				return null;
			}

			if (part.type === 'property') {
				if (typeof current !== 'object' || Array.isArray(current)) {
					return null;
				}
				current = (current as JsonObject)[part.value] ?? null;
			} else if (part.type === 'index') {
				if (!Array.isArray(current)) {
					return null;
				}
				const index = parseInt(part.value, 10);
				current = current[index] ?? null;
			} else if (part.type === 'filter') {
				// Handle filters like :has(key), :not(key), :contains(value)
				current = this.applyJsonFilter(current, part.filter!, part.value);
			}
		}

		return current;
	}

	/**
	 * Parse JSONPath string into parts.
	 */
	private parseJsonPath(path: string): Array<{
		type: 'property' | 'index' | 'filter' | 'root';
		value: string;
		filter?: string;
	}> {
		const parts: Array<{
			type: 'property' | 'index' | 'filter' | 'root';
			value: string;
			filter?: string;
		}> = [];
		let remaining = path;

		while (remaining.length > 0) {
			// Check for root selector ($)
			if (remaining.startsWith('$')) {
				// $ means root - skip it as we're already at root
				remaining = remaining.substring(1);
				continue;
			}

			// Check for filter
			const filterMatch = remaining.match(/^:([a-z]+)\(([^)]+)\)/i);
			if (filterMatch) {
				parts.push({ type: 'filter', value: filterMatch[2], filter: filterMatch[1] });
				remaining = remaining.substring(filterMatch[0].length);
				continue;
			}

			// Check for array index
			const indexMatch = remaining.match(/^\[(\d+)\]/);
			if (indexMatch) {
				parts.push({ type: 'index', value: indexMatch[1] });
				remaining = remaining.substring(indexMatch[0].length);
				continue;
			}

			// Check for property (dot notation)
			const propMatch = remaining.match(/^\.?([^.[:\]]+)/);
			if (propMatch) {
				parts.push({ type: 'property', value: propMatch[1] });
				remaining = remaining.substring(propMatch[0].length);
				continue;
			}

			// Skip dots
			if (remaining.startsWith('.')) {
				remaining = remaining.substring(1);
				continue;
			}

			// Unknown character, skip
			remaining = remaining.substring(1);
		}

		return parts;
	}

	/**
	 * Apply JSON filter to value.
	 */
	private applyJsonFilter(obj: JsonValue, filter: string, key: string): JsonValue | null {
		const filterLower = filter.toLowerCase();

		if (filterLower === 'has') {
			// Return object only if it has the key
			if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
				return key in obj ? obj : null;
			}
			return null;
		}

		if (filterLower === 'not') {
			// Return object only if it doesn't have the key
			if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
				return !(key in obj) ? obj : null;
			}
			return obj;
		}

		if (filterLower === 'contains') {
			// Return object if string representation contains key
			const str = JSON.stringify(obj);
			return str.includes(key) ? obj : null;
		}

		return obj;
	}

	/**
	 * Select all matching elements from JSON array.
	 */
	selectJsonAll(obj: JsonValue, selector: string): JsonValue[] {
		// Remove leading dot
		let path = selector.replace(/^\./, '');

		// Handle root selector ($) - means select the entire array
		if (path === '$' || path === '') {
			if (Array.isArray(obj)) {
				return obj;
			}
			return obj !== null ? [obj] : [];
		}

		// Handle $[index] or $.property syntax
		if (path.startsWith('$')) {
			path = path.substring(1); // Remove the $
			if (path.startsWith('.')) {
				path = path.substring(1); // Remove the leading dot after $
			}
		}

		// Split on colon to separate path from filter
		const colonIndex = path.indexOf(':');
		const basePath = colonIndex > -1 ? path.substring(0, colonIndex) : path;
		const filterPart = colonIndex > -1 ? path.substring(colonIndex) : '';

		// Navigate to the array
		let current: JsonValue = obj;
		if (basePath) {
			const parts = basePath.split('.');
			for (const part of parts) {
				if (current === null || typeof current !== 'object') {
					return [];
				}
				if (Array.isArray(current)) {
					const index = parseInt(part, 10);
					if (!isNaN(index)) {
						current = current[index] ?? null;
					} else {
						return [];
					}
				} else {
					current = (current as JsonObject)[part] ?? null;
				}
			}
		}

		if (!Array.isArray(current)) {
			return current !== null ? [current] : [];
		}

		// Apply filter if present
		if (filterPart) {
			return current.filter((item) => {
				const filtered = this.selectJsonPath(item, filterPart);
				return filtered !== null;
			});
		}

		return current;
	}

	/**
	 * Parse JSON string.
	 */
	parseJson(json: string): JsonValue {
		return JSON.parse(json) as JsonValue;
	}

	// ============================================================================
	// XML Selection
	// ============================================================================

	/**
	 * Select from XML (uses same cheerio-based approach as HTML).
	 */
	selectXml(
		$: CheerioAPI,
		element: Cheerio<AnyNode>,
		selector: SelectorBlock | FieldDefinition,
		required = true
	): SelectorResult {
		// XML selection works the same as HTML with cheerio
		return this.selectHtml($, element, selector, required);
	}

	/**
	 * Parse XML string.
	 */
	parseXml(xml: string): CheerioAPI {
		return cheerio.load(xml, { xmlMode: true });
	}

	// ============================================================================
	// Helpers
	// ============================================================================

	/**
	 * Apply filters to a value.
	 */
	private applyFilters(
		value: string,
		filters?: Array<{ name: string; args?: string | number | (string | number)[] }>
	): string {
		if (!filters || !this.filterEngine) {
			return value;
		}
		return this.filterEngine.applyFilters(value, filters);
	}

	/**
	 * Determine response type from content.
	 */
	detectResponseType(content: string): 'json' | 'html' | 'xml' {
		const trimmed = content.trim();

		// Check for JSON
		if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
			try {
				JSON.parse(trimmed);
				return 'json';
			} catch {
				// Not valid JSON
			}
		}

		// Check for XML
		if (trimmed.startsWith('<?xml') || trimmed.startsWith('<rss') || trimmed.startsWith('<feed')) {
			return 'xml';
		}

		// Default to HTML
		return 'html';
	}
}

/**
 * Create a new SelectorEngine instance.
 */
export function createSelectorEngine(
	templateEngine?: TemplateEngine,
	filterEngine?: FilterEngine
): SelectorEngine {
	return new SelectorEngine(templateEngine, filterEngine);
}
