/**
 * Unified Indexer Definition Types
 *
 * Single source of truth for indexer definitions - works for both:
 * - YAML-based definitions (Cardigann format)
 * - Native TypeScript indexers
 *
 * This replaces the fragmented approach of having separate types for
 * Cardigann and native indexers.
 */

import type { IndexerCapabilities, IndexerProtocol, IndexerAccessType } from '../types';

// ============================================================================
// Settings Field Types
// ============================================================================

/** Types of settings fields that can be displayed in the UI */
export type SettingFieldType =
	| 'text'
	| 'password'
	| 'checkbox'
	| 'select'
	| 'info'
	| 'info_cookie'
	| 'info_cloudflare'
	| 'info_useragent';

/** A single settings field for an indexer */
export interface SettingField {
	/** Internal name/key for the setting */
	name: string;
	/** Display type for the field */
	type: SettingFieldType;
	/** Human-readable label */
	label: string;
	/** Help text to show below the field */
	helpText?: string;
	/** Default value */
	default?: string | boolean | number;
	/** Options for select fields */
	options?: Record<string, string>;
	/** Whether this field is required */
	required?: boolean;
	/** Placeholder text */
	placeholder?: string;
}

// ============================================================================
// Category Types
// ============================================================================

/** Category mapping from tracker ID to Newznab category */
export interface CategoryMapping {
	/** Tracker-specific category ID */
	trackerId: string;
	/** Newznab category ID */
	newznabId: number;
	/** Human-readable description */
	description: string;
	/** Whether this is a default category for searches */
	default?: boolean;
}

// ============================================================================
// Unified Definition
// ============================================================================

/** Source of the indexer definition */
export type DefinitionSource = 'yaml' | 'native';

/**
 * Unified indexer definition.
 * Works for both YAML and native TypeScript indexers.
 */
export interface IndexerDefinition {
	// === Identity ===

	/** Unique identifier (e.g., 'scenetime', 'torrentday') */
	id: string;

	/** Display name */
	name: string;

	/** Description of the indexer */
	description: string;

	/** Language code (e.g., 'en-US') */
	language: string;

	// === Classification ===

	/** Access type: public, semi-private, or private */
	type: IndexerAccessType;

	/** Protocol: torrent or usenet */
	protocol: IndexerProtocol;

	/** Source of this definition */
	source: DefinitionSource;

	// === URLs ===

	/** Primary URLs for the indexer */
	urls: string[];

	/** Legacy/fallback URLs */
	legacyUrls?: string[];

	// === Settings ===

	/** Settings fields for configuration */
	settings: SettingField[];

	/** Default settings values */
	defaultSettings?: Record<string, unknown>;

	// === Categories ===

	/** Category mappings */
	categories: CategoryMapping[];

	/** Newznab categories this indexer supports */
	supportedCategories: number[];

	// === Capabilities ===

	/** Search capabilities */
	capabilities: IndexerCapabilities;

	// === Rate Limiting ===

	/** Request delay in seconds between requests */
	requestDelay?: number;

	// === Metadata ===

	/** When this definition was loaded */
	loadedAt?: Date;

	/** File path if loaded from YAML */
	filePath?: string;
}

/**
 * Simplified definition for UI display.
 * Contains only what's needed for the "Add Indexer" modal.
 */
export interface IndexerDefinitionSummary {
	id: string;
	name: string;
	description: string;
	type: IndexerAccessType;
	protocol: IndexerProtocol;
	language: string;
	settings: SettingField[];
	urls: string[];
}

// ============================================================================
// Factory Types
// ============================================================================

/** Config for creating an indexer instance */
export interface CreateIndexerConfig {
	/** Database-assigned ID */
	id: string;
	/** User-provided name */
	name: string;
	/** Definition ID to use */
	definitionId: string;
	/** Base URL to use */
	baseUrl: string;
	/** Alternate URLs */
	alternateUrls?: string[];
	/** User settings */
	settings: Record<string, unknown>;
	/** Whether indexer is enabled */
	enabled: boolean;
	/** Priority (lower = higher priority) */
	priority: number;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get default settings for a definition.
 */
export function getDefaultSettings(definition: IndexerDefinition): Record<string, unknown> {
	const defaults: Record<string, unknown> = {};

	for (const field of definition.settings) {
		if (field.default !== undefined) {
			defaults[field.name] = field.default;
		}
	}

	return { ...defaults, ...definition.defaultSettings };
}

/**
 * Get required settings fields.
 */
export function getRequiredSettings(definition: IndexerDefinition): SettingField[] {
	return definition.settings.filter(
		(field) => field.required || field.type === 'password' || field.type === 'text'
	);
}

/**
 * Check if a definition requires authentication.
 */
export function requiresAuth(definition: IndexerDefinition): boolean {
	return definition.type === 'private' || definition.type === 'semi-private';
}

/**
 * Convert definition to summary for UI.
 */
export function toDefinitionSummary(definition: IndexerDefinition): IndexerDefinitionSummary {
	return {
		id: definition.id,
		name: definition.name,
		description: definition.description,
		type: definition.type,
		protocol: definition.protocol,
		language: definition.language,
		settings: definition.settings,
		urls: definition.urls
	};
}

// ============================================================================
// UI Type Conversion
// ============================================================================

/** Setting type matching UI expectations from $lib/types/indexer.ts */
export type UISettingType =
	| 'text'
	| 'password'
	| 'checkbox'
	| 'select'
	| 'number'
	| 'info'
	| 'info_cookie'
	| 'info_cloudflare'
	| 'info_useragent'
	| 'info_category_8000'
	| 'cardigannCaptcha';

/**
 * UI-compatible definition setting type.
 * Matches the DefinitionSetting type in $lib/types/indexer.ts
 */
export interface UIDefinitionSetting {
	name: string;
	label: string;
	type: UISettingType;
	required?: boolean;
	default?: string;
	helpText?: string;
	options?: Record<string, string>;
	placeholder?: string;
}

/**
 * UI-compatible indexer definition type.
 * Matches the IndexerDefinition type in $lib/types/indexer.ts
 */
export interface UIIndexerDefinition {
	id: string;
	name: string;
	description?: string;
	type: IndexerAccessType;
	protocol: IndexerProtocol;
	siteUrl: string;
	alternateUrls: string[];
	capabilities: {
		search?: { available: boolean; supportedParams: string[] };
		movieSearch?: { available: boolean; supportedParams: string[] };
		tvSearch?: { available: boolean; supportedParams: string[] };
		categories?: Record<string, string>;
		limits?: { default: number; max: number };
		flags?: { supportsInfoHash?: boolean; supportsPagination?: boolean };
	};
	settings: UIDefinitionSetting[];
}

/**
 * Convert a raw YAML definition to unified IndexerDefinition format.
 * This centralizes the conversion logic that was duplicated in DefinitionLoader.
 */
export function yamlToUnifiedDefinition(
	def: import('../schema/yamlDefinition').YamlDefinition,
	filePath?: string
): IndexerDefinition {
	// Map YAML setting type to unified type
	const mapSettingType = (type: string): SettingFieldType => {
		const map: Record<string, SettingFieldType> = {
			text: 'text',
			password: 'password',
			checkbox: 'checkbox',
			select: 'select',
			info: 'info',
			info_cookie: 'info_cookie',
			info_cloudflare: 'info_cloudflare',
			info_useragent: 'info_useragent'
		};
		return map[type] ?? 'text';
	};

	// Map Cardigann type to IndexerAccessType
	const mapAccessType = (type: string): 'public' | 'private' | 'semi-private' => {
		if (type === 'private') return 'private';
		if (type === 'semi-private') return 'semi-private';
		return 'public';
	};

	// Build capabilities from Cardigann modes and searchFormats
	const buildCapabilities = (
		modes: Record<string, string[]>,
		searchFormats?: { episode?: string[]; movie?: string[] }
	): IndexerDefinition['capabilities'] => {
		const toParams = (params?: string[]) =>
			(params ?? ['q']) as Array<
				| 'q'
				| 'imdbId'
				| 'tmdbId'
				| 'tvdbId'
				| 'season'
				| 'ep'
				| 'year'
				| 'genre'
				| 'artist'
				| 'album'
				| 'author'
				| 'title'
				| 'tvMazeId'
				| 'traktId'
			>;

		return {
			search: {
				available: !!modes['search'],
				supportedParams: toParams(modes['search'])
			},
			tvSearch: {
				available: !!modes['tv-search'],
				supportedParams: toParams(modes['tv-search'])
			},
			movieSearch: {
				available: !!modes['movie-search'],
				supportedParams: toParams(modes['movie-search'])
			},
			musicSearch: {
				available: !!modes['music-search'],
				supportedParams: toParams(modes['music-search'])
			},
			bookSearch: {
				available: !!modes['book-search'],
				supportedParams: toParams(modes['book-search'])
			},
			categories: new Map(),
			supportsPagination: true,
			supportsInfoHash: false,
			limitMax: 100,
			limitDefault: 50,
			// Include searchFormats if specified in YAML
			searchFormats: searchFormats
				? {
						episode: searchFormats.episode as
							| ('standard' | 'european' | 'compact' | 'daily' | 'absolute')[]
							| undefined,
						movie: searchFormats.movie as ('standard' | 'yearOnly' | 'noYear')[] | undefined
					}
				: undefined
		};
	};

	// Convert settings
	const settings: SettingField[] = (def.settings ?? [])
		.filter((s) => !s.type.startsWith('info')) // Skip info-only fields
		.map((s) => ({
			name: s.name,
			type: mapSettingType(s.type),
			label: s.label,
			default: s.default,
			options: s.options,
			required: s.type === 'password' || s.type === 'text'
		}));

	// If no settings but login exists, add defaults
	if (settings.length === 0 && def.login) {
		const method = def.login.method?.toLowerCase() ?? 'post';
		if (method === 'cookie') {
			settings.push({
				name: 'cookie',
				type: 'text',
				label: 'Cookie',
				required: true
			});
		} else if (method !== 'oneurl' && method !== 'apikey' && method !== 'none') {
			settings.push(
				{ name: 'username', type: 'text', label: 'Username', required: true },
				{ name: 'password', type: 'password', label: 'Password', required: true }
			);
		}
	}

	// Convert category mappings
	const categories: CategoryMapping[] = (def.caps.categorymappings ?? []).map((cm) => ({
		trackerId: cm.id,
		newznabId: parseInt(cm.cat ?? '8000', 10),
		description: cm.desc ?? cm.id,
		default: cm.default
	}));

	// Get supported Newznab categories
	const supportedCategories = [...new Set(categories.map((c) => c.newznabId))];

	// Build capabilities with searchFormats from YAML if specified
	const modes = def.caps.modes ?? {};
	const searchFormats = def.caps.searchFormats;
	const capabilities = buildCapabilities(modes, searchFormats);

	return {
		id: def.id,
		name: def.name,
		description: def.description ?? `${def.name} indexer`,
		language: def.language ?? 'en-US',
		type: mapAccessType(def.type),
		protocol: def.protocol ?? 'torrent',
		source: 'yaml',
		urls: def.links ?? [],
		legacyUrls: def.legacylinks,
		settings,
		categories,
		supportedCategories,
		capabilities,
		requestDelay: def.requestdelay,
		loadedAt: new Date(),
		filePath
	};
}

/**
 * Convert unified definition to UI-compatible format.
 */
export function toUIDefinition(def: IndexerDefinition): UIIndexerDefinition {
	// Map setting type to UI-compatible type
	const mapSettingType = (type: SettingFieldType): UISettingType => {
		const typeMap: Record<SettingFieldType, UISettingType> = {
			text: 'text',
			password: 'password',
			checkbox: 'checkbox',
			select: 'select',
			info: 'info',
			info_cookie: 'info_cookie',
			info_cloudflare: 'info_cloudflare',
			info_useragent: 'info_useragent'
		};
		return typeMap[type] ?? 'text';
	};

	// Convert settings to UI format
	const settings: UIDefinitionSetting[] = def.settings.map((s) => ({
		name: s.name,
		label: s.label,
		type: mapSettingType(s.type),
		required: s.required,
		default: s.default !== undefined ? String(s.default) : undefined,
		placeholder: s.placeholder,
		helpText: s.helpText,
		options: s.options
	}));

	// Convert capabilities
	const capabilities: UIIndexerDefinition['capabilities'] = {
		limits: {
			default: def.capabilities.limitDefault ?? 50,
			max: def.capabilities.limitMax ?? 100
		},
		flags: {
			supportsInfoHash: def.capabilities.supportsInfoHash,
			supportsPagination: def.capabilities.supportsPagination
		}
	};

	// Add search modes
	if (def.capabilities.search?.available) {
		capabilities.search = {
			available: true,
			supportedParams: def.capabilities.search.supportedParams as string[]
		};
	}
	if (def.capabilities.movieSearch?.available) {
		capabilities.movieSearch = {
			available: true,
			supportedParams: def.capabilities.movieSearch.supportedParams as string[]
		};
	}
	if (def.capabilities.tvSearch?.available) {
		capabilities.tvSearch = {
			available: true,
			supportedParams: def.capabilities.tvSearch.supportedParams as string[]
		};
	}

	// Convert categories to Record
	if (def.capabilities.categories.size > 0) {
		capabilities.categories = Object.fromEntries(def.capabilities.categories);
	}

	return {
		id: def.id,
		name: def.name,
		description: def.description,
		type: def.type,
		protocol: def.protocol,
		siteUrl: def.urls[0] ?? '',
		alternateUrls: def.urls.slice(1).concat(def.legacyUrls ?? []),
		capabilities,
		settings
	};
}
