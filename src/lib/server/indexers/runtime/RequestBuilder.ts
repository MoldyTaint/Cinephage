/**
 * Request builder for YAML indexer definitions.
 * Builds HTTP requests from definition search paths and criteria.
 */

import type {
	YamlDefinition as CardigannDefinition,
	SearchBlock,
	SearchPathBlock
} from '../schema/yamlDefinition';
import { resolveCategoryId } from '../schema/yamlDefinition';
import type { SearchCriteria } from '../types';
import { getCategoriesForSearchType, isMovieSearch } from '../types';
import { TemplateEngine } from '../engine/TemplateEngine';
import { FilterEngine } from '../engine/FilterEngine';
import { logger } from '$lib/logging';
import { encodeUrlParam } from '../http/EncodingUtils';

/**
 * HTTP request representation.
 */
export interface HttpRequest {
	url: string;
	method: 'GET' | 'POST';
	headers: Record<string, string>;
	body?: string | URLSearchParams;
	searchPath: SearchPathBlock | null;
}

/**
 * Category mapper for converting between Newznab and tracker-specific categories.
 */
export class CategoryMapper {
	private definition: CardigannDefinition;
	private trackerToNewznab: Map<string, number[]> = new Map();
	private newznabToTracker: Map<number, string[]> = new Map();
	private defaultCategories: string[] = [];

	constructor(definition: CardigannDefinition) {
		this.definition = definition;
		this.buildMappings();
	}

	private buildMappings(): void {
		const caps = this.definition.caps;

		// Process simple categories (id -> name)
		if (caps.categories) {
			for (const [trackerId, catName] of Object.entries(caps.categories)) {
				// Look up Newznab category by name
				const newznabId = this.getNewznabIdByName(catName);
				if (newznabId) {
					this.addMapping(trackerId, newznabId);
				}
			}
		}

		// Process categorymappings (more detailed)
		if (caps.categorymappings) {
			for (const mapping of caps.categorymappings) {
				if (mapping.cat) {
					const newznabId = resolveCategoryId(mapping.cat);
					this.addMapping(mapping.id, newznabId);
				}

				if (mapping.default) {
					this.defaultCategories.push(mapping.id);
				}
			}
		}
	}

	private addMapping(trackerId: string, newznabId: number): void {
		// Tracker to Newznab
		const existing = this.trackerToNewznab.get(trackerId) ?? [];
		if (!existing.includes(newznabId)) {
			existing.push(newznabId);
			this.trackerToNewznab.set(trackerId, existing);
		}

		// Newznab to Tracker
		const reverse = this.newznabToTracker.get(newznabId) ?? [];
		if (!reverse.includes(trackerId)) {
			reverse.push(trackerId);
			this.newznabToTracker.set(newznabId, reverse);
		}
	}

	/**
	 * Resolve a Newznab category name to its numeric ID.
	 * Public so RequestBuilder can use it for path matching.
	 */
	getNewznabIdByName(name: string): number | null {
		// Standard Newznab category mappings
		const mapping: Record<string, number> = {
			Console: 1000,
			Movies: 2000,
			'Movies/Foreign': 2010,
			'Movies/Other': 2020,
			'Movies/SD': 2030,
			'Movies/HD': 2040,
			'Movies/UHD': 2045,
			'Movies/BluRay': 2050,
			'Movies/3D': 2060,
			'Movies/DVD': 2070,
			'Movies/WEB-DL': 2080,
			Audio: 3000,
			'Audio/MP3': 3010,
			'Audio/Video': 3020,
			'Audio/Audiobook': 3030,
			'Audio/Lossless': 3040,
			'Audio/Other': 3050,
			'Audio/Foreign': 3060,
			PC: 4000,
			'PC/0day': 4010,
			'PC/ISO': 4020,
			'PC/Mac': 4030,
			'PC/Games': 4050,
			TV: 5000,
			'TV/WEB-DL': 5010,
			'TV/Foreign': 5020,
			'TV/SD': 5030,
			'TV/HD': 5040,
			'TV/UHD': 5045,
			'TV/Other': 5050,
			'TV/Sport': 5060,
			'TV/Anime': 5070,
			'TV/Documentary': 5080,
			XXX: 6000,
			Books: 7000,
			'Books/EBook': 7020,
			'Books/Comics': 7030,
			Other: 8000
		};

		return mapping[name] ?? null;
	}

	/**
	 * Check if a tracker category ID falls under a parent Newznab category.
	 * Newznab uses ranges: 2xxx = Movies, 5xxx = TV, etc.
	 */
	categoryMatchesParent(trackerCatId: string, parentNewznabId: number): boolean {
		const trackerId = parseInt(trackerCatId, 10);
		if (isNaN(trackerId)) return false;

		// Get the parent range (thousands digit)
		const parentRange = Math.floor(parentNewznabId / 1000) * 1000;
		const trackerRange = Math.floor(trackerId / 1000) * 1000;

		return parentRange === trackerRange;
	}

	/**
	 * Map Newznab category IDs to tracker-specific category IDs.
	 */
	mapToTracker(newznabIds: number[]): string[] {
		const trackerIds: string[] = [];

		for (const newznabId of newznabIds) {
			const mapped = this.newznabToTracker.get(newznabId);
			if (mapped) {
				for (const trackerId of mapped) {
					if (!trackerIds.includes(trackerId)) {
						trackerIds.push(trackerId);
					}
				}
			}
		}

		return trackerIds.length > 0 ? trackerIds : this.defaultCategories;
	}

	/**
	 * Get default tracker categories.
	 */
	getDefaults(): string[] {
		return this.defaultCategories;
	}

	/**
	 * Map a tracker-specific category ID to all matching Newznab category IDs.
	 * Returns an array because a single tracker category can map to multiple Newznab categories
	 * (e.g., Nyaa.si's "1_2" anime category maps to both TV/Anime and Movies/Other).
	 */
	mapFromTracker(trackerId: string): number[] {
		return this.trackerToNewznab.get(trackerId) ?? [];
	}
}

export class RequestBuilder {
	private definition: CardigannDefinition;
	private templateEngine: TemplateEngine;
	private filterEngine: FilterEngine;
	private categoryMapper: CategoryMapper;
	private baseUrl: string;
	/** Supported params per search mode (e.g. 'movie' -> ['q', 'imdbid']) */
	private supportedParams: Map<string, string[]> = new Map();

	constructor(
		definition: CardigannDefinition,
		templateEngine: TemplateEngine,
		filterEngine: FilterEngine
	) {
		this.definition = definition;
		this.templateEngine = templateEngine;
		this.filterEngine = filterEngine;
		this.categoryMapper = new CategoryMapper(definition);
		this.baseUrl = definition.links[0];
	}

	/**
	 * Set supported params for a search mode.
	 * Used by Newznab indexers to filter out unsupported params.
	 * @param mode The search mode (e.g. 'search', 'movie', 'tvsearch')
	 * @param params List of supported parameter names (lowercase)
	 */
	setSupportedParams(mode: string, params: string[]): void {
		this.supportedParams.set(mode, params);
	}

	/**
	 * Set the base URL (can be overridden from settings).
	 */
	setBaseUrl(url: string): void {
		this.baseUrl = url;
		this.templateEngine.setSiteLink(url);
	}

	/**
	 * Build search requests for the given criteria.
	 */
	buildSearchRequests(criteria: SearchCriteria): HttpRequest[] {
		const search = this.definition.search;
		const requests: HttpRequest[] = [];
		const seenUrls = new Set<string>();
		const effectiveCriteria = this.withDefaultCategories(criteria);

		// Set query variables
		this.templateEngine.setQuery(effectiveCriteria);

		// Map categories
		const newznabCategories = effectiveCriteria.categories ?? [];
		const trackerCategories = this.categoryMapper.mapToTracker(newznabCategories);
		this.templateEngine.setCategories(trackerCategories);

		// Build keywords (combining various query parts)
		const keywords = this.buildKeywords(effectiveCriteria);
		this.templateEngine.setVariable('.Query.Keywords', keywords);
		this.templateEngine.setVariable('.Keywords', this.applyKeywordsFilters(keywords, search));
		this.templateEngine.setVariable('.Categories', trackerCategories);

		// Get search paths
		const paths = this.getSearchPaths(search);
		const filteredPaths = this.filterPathsForSearchType(
			paths,
			effectiveCriteria,
			trackerCategories
		);

		for (const path of filteredPaths) {
			const request = this.buildRequestForPath(path, search, trackerCategories);
			if (request && !seenUrls.has(request.url)) {
				seenUrls.add(request.url);
				requests.push(request);
			}
		}

		return requests;
	}

	/**
	 * Apply category defaults from search type when caller does not provide categories.
	 *
	 * Without this fallback, RequestBuilder falls back to indexer category defaults
	 * (from categorymappings.default), which can select the wrong content type.
	 */
	private withDefaultCategories(criteria: SearchCriteria): SearchCriteria {
		if (criteria.categories && criteria.categories.length > 0) {
			return criteria;
		}

		if (criteria.searchType === 'basic') {
			return criteria;
		}

		return {
			...criteria,
			categories: getCategoriesForSearchType(criteria.searchType)
		};
	}

	/**
	 * Filter candidate paths for a search.
	 *
	 * For typed searches (movie/tv/music/book), prefer category-scoped paths when available.
	 * This avoids firing both specific and generic fallback paths in the same request cycle.
	 */
	private filterPathsForSearchType(
		paths: SearchPathBlock[],
		criteria: SearchCriteria,
		trackerCategories: string[]
	): SearchPathBlock[] {
		const matchingPaths = paths.filter((path) =>
			this.pathMatchesCategories(path, trackerCategories)
		);

		if (criteria.searchType === 'basic') {
			const genericPaths = matchingPaths.filter(
				(path) => !Array.isArray(path.categories) || path.categories.length === 0
			);
			// For plain text search, prefer generic paths and avoid category-specific variants.
			return genericPaths.length > 0 ? genericPaths : matchingPaths;
		}

		const categoryScopedPaths = matchingPaths.filter(
			(path) =>
				Array.isArray(path.categories) && path.categories.length > 0 && path.categories[0] !== '!'
		);

		// If specific category-scoped paths exist, skip generic fallbacks.
		if (categoryScopedPaths.length > 0) {
			return categoryScopedPaths;
		}

		return matchingPaths;
	}

	/**
	 * Build keywords string from search criteria.
	 *
	 * Note: Episode tokens are now handled by TemplateEngine.setQuery() which
	 * sets .Keywords to include the episode token based on criteria.preferredEpisodeFormat.
	 * This method is kept for backwards compatibility and for the movie year case.
	 *
	 * The actual .Keywords value used in templates comes from TemplateEngine,
	 * not from this method's return value (see buildSearchRequests where we
	 * call templateEngine.setQuery() first).
	 */
	private buildKeywords(criteria: SearchCriteria): string {
		const parts: string[] = [];

		if (criteria.query) {
			parts.push(criteria.query);
		}

		// Movie year handling - add year if not already in query
		if (isMovieSearch(criteria)) {
			if (criteria.year) {
				if (!criteria.query?.includes(String(criteria.year))) {
					parts.push(String(criteria.year));
				}
			}
		}

		// Note: TV episode tokens are NOT added here anymore.
		// TemplateEngine is the sole source of truth for episode token composition.
		// It uses criteria.preferredEpisodeFormat to determine which format to add.

		return parts.join(' ');
	}

	/**
	 * Apply keywords filters from search definition.
	 */
	private applyKeywordsFilters(keywords: string, search: SearchBlock): string {
		if (!search.keywordsfilters) {
			return keywords;
		}
		return this.filterEngine.applyFilters(keywords, search.keywordsfilters);
	}

	/**
	 * Get search paths from definition.
	 */
	private getSearchPaths(search: SearchBlock): SearchPathBlock[] {
		if (search.paths && search.paths.length > 0) {
			return search.paths;
		}

		// Create path from legacy single path
		if (search.path) {
			return [
				{
					path: search.path,
					method: 'get',
					inputs: search.inputs
				}
			];
		}

		return [];
	}

	/**
	 * Check if path categories match the requested categories.
	 * Handles both numeric category IDs and category names (like "Movies", "TV").
	 */
	private pathMatchesCategories(path: SearchPathBlock, trackerCategories: string[]): boolean {
		if (!path.categories || path.categories.length === 0) {
			return true; // No category restriction
		}

		if (trackerCategories.length === 0) {
			return true; // No categories requested, match all
		}

		// Check for exclusion (category list starting with "!")
		if (path.categories[0] === '!') {
			const excluded = path.categories.slice(1);
			return !this.categoriesMatch(trackerCategories, excluded);
		}

		// Check for inclusion
		return this.categoriesMatch(trackerCategories, path.categories);
	}

	/**
	 * Check if any of the tracker categories match the path categories.
	 * Handles both numeric IDs and category names.
	 */
	private categoriesMatch(trackerCategories: string[], pathCategories: string[]): boolean {
		for (const pathCat of pathCategories) {
			// Check if pathCat is a name (non-numeric) or an ID (numeric)
			if (/^\d+$/.test(pathCat)) {
				// Numeric ID - direct match
				if (trackerCategories.includes(pathCat)) {
					return true;
				}
			} else {
				// Category name - resolve to parent ID and check range
				const parentId = this.categoryMapper.getNewznabIdByName(pathCat);
				if (parentId !== null) {
					// Check if any tracker category falls under this parent
					for (const trackerCat of trackerCategories) {
						if (this.categoryMapper.categoryMatchesParent(trackerCat, parentId)) {
							return true;
						}
					}
				}
			}
		}
		return false;
	}

	/**
	 * Build HTTP request for a single search path.
	 */
	private buildRequestForPath(
		path: SearchPathBlock,
		search: SearchBlock,
		trackerCategories: string[]
	): HttpRequest | null {
		// Update categories variable for this path
		if (path.categories && path.categories.length > 0 && path.categories[0] !== '!') {
			// Use intersection of requested and path categories
			const intersection = trackerCategories.filter((c) => path.categories!.includes(c));
			if (intersection.length > 0) {
				this.templateEngine.setCategories(intersection);
			}
		}

		// Expand path template
		const pathStr = this.templateEngine.expand(path.path || '', encodeURIComponent);

		// Build base URL
		let url = this.resolveUrl(pathStr);

		// Collect inputs
		const inputs: Record<string, string> = {};

		// Global inputs (if inheritinputs is not false)
		if (path.inheritinputs !== false && search.inputs) {
			for (const [key, value] of Object.entries(search.inputs)) {
				const expanded = this.expandInput(key, value);
				if (expanded !== null) {
					inputs[key] = expanded;
				}
			}
		}

		// Path-specific inputs
		if (path.inputs) {
			for (const [key, value] of Object.entries(path.inputs)) {
				const expanded = this.expandInput(key, value);
				if (expanded !== null) {
					inputs[key] = expanded;
				}
			}
		}

		// Filter inputs by supported params (for Newznab)
		// Uses the 't' param value to determine search mode (e.g., 'movie', 'tvsearch')
		const searchMode = inputs['t'] || 'search';
		const filteredInputs = this.filterBySupportedParams(inputs, searchMode);

		// Skip paths that have no meaningful search criteria after filtering
		// (only standard params like t, apikey, limit, cat remain - no actual search params)
		// EXCEPTION: If the path template contains .Keywords, the search is embedded in the URL path
		const meaningfulSearchParams = [
			'q',
			'query',
			'query_term',
			'name', // UNIT3D trackers use 'name' for keyword search
			'search',
			'nm', // RuTracker uses 'nm' for keyword search
			'mire', // nCore uses 'mire' for keyword search
			'imdb', // Some trackers use 'imdb' instead of 'imdbid'
			'imdbid',
			'imdb_id',
			'tmdb', // Some trackers use 'tmdb' instead of 'tmdbid'
			'tmdbid',
			'tmdb_id',
			'tvdb', // Some trackers use 'tvdb' instead of 'tvdbid'
			'tvdbid',
			'tvdb_id',
			'tvmazeid',
			'rid',
			'season',
			'ep',
			'artist',
			'album',
			'author',
			'title'
		];
		const hasInputSearchCriteria = Object.keys(filteredInputs).some((key) =>
			meaningfulSearchParams.includes(key.toLowerCase())
		);
		// Check if the path template contains keywords placeholder (e.g., {{ .Keywords }})
		// This allows indexers that embed search in the URL path
		const pathHasKeywords = path.path?.includes('.Keywords') ?? false;
		if (!hasInputSearchCriteria && !pathHasKeywords) {
			return null;
		}

		// Determine method
		const method = (path.method?.toUpperCase() === 'POST' ? 'POST' : 'GET') as 'GET' | 'POST';

		// Build headers
		const headers: Record<string, string> = {};
		if (search.headers) {
			for (const [key, value] of Object.entries(search.headers)) {
				const headerValue = Array.isArray(value) ? value[0] : value;
				headers[key] = this.templateEngine.expand(headerValue);
			}
		}

		// Build request
		const encoding = this.definition.encoding;
		if (method === 'GET') {
			// Add inputs as query parameters with proper encoding
			const queryParts: string[] = [];
			for (const [key, value] of Object.entries(filteredInputs)) {
				if (key === '$raw') {
					// Raw query string, parse and add
					const rawParts = value.split('&');
					for (const part of rawParts) {
						const [k, v] = part.split('=');
						if (k) {
							const encodedK = encodeUrlParam(k, encoding);
							const encodedV = v ? encodeUrlParam(v, encoding) : '';
							queryParts.push(`${encodedK}=${encodedV}`);
						}
					}
				} else {
					const encodedKey = encodeUrlParam(key, encoding);
					const encodedValue = encodeUrlParam(value, encoding);
					queryParts.push(`${encodedKey}=${encodedValue}`);
				}
			}

			const queryString = queryParts.join('&');
			if (queryString) {
				url += (url.includes('?') ? '&' : '?') + queryString;
			}

			return { url, method, headers, searchPath: path };
		} else {
			// POST - inputs go in body
			const contentType = headers['Content-Type'] || headers['content-type'] || '';

			if (contentType.includes('application/json')) {
				// JSON body - serialize inputs as JSON object
				const jsonBody: Record<string, unknown> = {};
				for (const [key, value] of Object.entries(filteredInputs)) {
					// Try to parse JSON values (arrays, numbers, booleans)
					try {
						jsonBody[key] = JSON.parse(value);
					} catch {
						jsonBody[key] = value;
					}
				}
				return { url, method, headers, body: JSON.stringify(jsonBody), searchPath: path };
			} else {
				// Form-encoded body (default) with proper encoding
				const bodyParts: string[] = [];
				for (const [key, value] of Object.entries(filteredInputs)) {
					if (key === '$raw') {
						const rawParts = value.split('&');
						for (const part of rawParts) {
							const [k, v] = part.split('=');
							if (k) {
								const encodedK = encodeUrlParam(k, encoding);
								const encodedV = v ? encodeUrlParam(v, encoding) : '';
								bodyParts.push(`${encodedK}=${encodedV}`);
							}
						}
					} else {
						const encodedKey = encodeUrlParam(key, encoding);
						const encodedValue = encodeUrlParam(value, encoding);
						bodyParts.push(`${encodedKey}=${encodedValue}`);
					}
				}
				const body = bodyParts.join('&');
				return { url, method, headers, body, searchPath: path };
			}
		}
	}

	/**
	 * Filter inputs to only include supported params for the given search mode.
	 * Always allows certain standard params like 't', 'apikey', 'limit', etc.
	 */
	private filterBySupportedParams(
		inputs: Record<string, string>,
		mode: string
	): Record<string, string> {
		const supported = this.supportedParams.get(mode);
		logger.debug('[RequestBuilder] filterBySupportedParams', {
			mode,
			supportedParams: supported ?? []
		});
		if (!supported || supported.length === 0) {
			// No filtering configured for this mode
			return inputs;
		}

		const filtered: Record<string, string> = {};
		// Standard params that are always allowed (not search-mode specific)
		const alwaysAllow = ['t', 'apikey', 'limit', 'cat', 'extended', 'offset', 'attrs', '$raw', 'q'];

		for (const [key, value] of Object.entries(inputs)) {
			const lowerKey = key.toLowerCase();

			// Always allow standard params
			if (alwaysAllow.includes(lowerKey)) {
				filtered[key] = value;
				continue;
			}

			// Only include if in supported params list
			if (supported.includes(lowerKey)) {
				filtered[key] = value;
			}
		}

		return filtered;
	}

	/**
	 * Expand an input value with templates.
	 */
	private expandInput(key: string, template: string): string | null {
		const expanded = this.templateEngine.expand(template);

		// Check allowEmptyInputs
		if (!expanded && !this.definition.search.allowEmptyInputs) {
			// Don't include empty inputs unless allowed
			return null;
		}

		return expanded;
	}

	/**
	 * Resolve a path to an absolute URL.
	 */
	private resolveUrl(path: string): string {
		if (path.startsWith('http://') || path.startsWith('https://')) {
			return path;
		}

		try {
			return new URL(path, this.baseUrl).toString();
		} catch {
			return this.baseUrl + (path.startsWith('/') ? path : '/' + path);
		}
	}

	/**
	 * Get the category mapper.
	 */
	getCategoryMapper(): CategoryMapper {
		return this.categoryMapper;
	}

	/**
	 * Get the current base URL.
	 */
	getBaseUrl(): string {
		return this.baseUrl;
	}
}

/**
 * Create a new RequestBuilder instance.
 */
export function createRequestBuilder(
	definition: CardigannDefinition,
	templateEngine: TemplateEngine,
	filterEngine: FilterEngine
): RequestBuilder {
	return new RequestBuilder(definition, templateEngine, filterEngine);
}
