/**
 * Definition Loader
 *
 * Loads indexer definitions from YAML files.
 * Provides a single interface for accessing all available indexer definitions.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { createChildLogger } from '$lib/logging';
import type {
	IndexerDefinition,
	IndexerDefinitionSummary,
	SettingField,
	CategoryMapping
} from './types';
import { toDefinitionSummary } from './types';
import type { YamlDefinition } from '../schema/yamlDefinition';
import { safeValidateYamlDefinition, resolveCategoryId } from '../schema/yamlDefinition';

const log = createChildLogger({ module: 'DefinitionLoader' });

/** Default YAML definitions directory */
const DEFAULT_YAML_PATH = 'data/indexers/definitions';

/** Load error information */
export interface DefinitionLoadError {
	source: string;
	error: string;
}

/**
 * Loader for all indexer definitions.
 */
export class DefinitionLoader {
	private definitions: Map<string, IndexerDefinition> = new Map();
	private errors: DefinitionLoadError[] = [];
	private yamlPath: string;
	private loaded = false;

	constructor(yamlPath: string = DEFAULT_YAML_PATH) {
		this.yamlPath = yamlPath;
	}

	/**
	 * Load all definitions from YAML files.
	 */
	async loadAll(): Promise<void> {
		this.definitions.clear();
		this.errors = [];

		// Load all YAML definitions
		await this.loadYamlDefinitions();

		this.loaded = true;

		log.info('Loaded all definitions', {
			total: this.definitions.size,
			errors: this.errors.length
		});
	}

	/**
	 * Load YAML definitions from filesystem.
	 */
	private async loadYamlDefinitions(): Promise<void> {
		if (!fs.existsSync(this.yamlPath)) {
			log.warn('YAML definitions directory not found', { path: this.yamlPath });
			return;
		}

		await this.loadYamlDirectory(this.yamlPath);
	}

	/**
	 * Recursively load YAML files from a directory.
	 */
	private async loadYamlDirectory(directory: string): Promise<void> {
		const entries = fs.readdirSync(directory, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = path.join(directory, entry.name);

			if (entry.isDirectory()) {
				await this.loadYamlDirectory(fullPath);
			} else if (entry.isFile() && (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml'))) {
				await this.loadYamlFile(fullPath);
			}
		}
	}

	/**
	 * Load a single YAML definition file.
	 */
	private async loadYamlFile(filePath: string): Promise<void> {
		try {
			const content = fs.readFileSync(filePath, 'utf-8');
			const parsed = yaml.load(content);

			const validationResult = safeValidateYamlDefinition(parsed);
			if (!validationResult.success) {
				const errorMsg = validationResult.error.issues
					.map((e) => `${String(e.path.join('.'))}: ${e.message}`)
					.join('; ');
				this.errors.push({ source: filePath, error: errorMsg });
				return;
			}

			const yamlDef = validationResult.data;

			// Skip duplicates (first definition loaded wins)
			if (this.definitions.has(yamlDef.id)) {
				log.debug('Skipping duplicate YAML definition', { id: yamlDef.id });
				return;
			}

			const unified = this.convertYamlDefinition(yamlDef, filePath);
			this.definitions.set(unified.id, unified);
			log.debug('Loaded YAML definition', { id: unified.id, path: filePath });
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			this.errors.push({ source: filePath, error: msg });
		}
	}

	/**
	 * Convert a YAML definition to unified format.
	 */
	private convertYamlDefinition(def: YamlDefinition, filePath: string): IndexerDefinition {
		// Convert settings
		const settings: SettingField[] = (def.settings ?? [])
			.filter((s: { type: string }) => !s.type.startsWith('info')) // Skip info-only fields
			.map(
				(s: {
					name: string;
					type: string;
					label?: string;
					default?: string | boolean | number;
					options?: Record<string, string>;
				}) => ({
					name: s.name,
					type: this.mapSettingType(s.type),
					label: s.label,
					default: s.default,
					options: s.options,
					required: s.type === 'password' || s.type === 'text'
				})
			);

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
			} else if (method !== 'oneurl') {
				settings.push(
					{ name: 'username', type: 'text', label: 'Username', required: true },
					{ name: 'password', type: 'password', label: 'Password', required: true }
				);
			}
		}

		// Convert category mappings
		const categories: CategoryMapping[] = (def.caps.categorymappings ?? []).map(
			(cm: { id: string; cat?: string; desc?: string; default?: boolean }) => ({
				trackerId: cm.id,
				newznabId: resolveCategoryId(cm.cat),
				description: cm.desc ?? cm.id,
				default: cm.default
			})
		);

		// Get supported Newznab categories
		const supportedCategories = [...new Set(categories.map((c) => c.newznabId))];

		// Build capabilities
		const modes = def.caps.modes ?? {};
		const capabilities = this.buildCapabilities(modes);

		return {
			id: def.id,
			name: def.name,
			description: def.description ?? `${def.name} indexer`,
			language: def.language ?? 'en-US',
			type: this.mapAccessType(def.type),
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
	 * Map YAML setting type to unified type.
	 */
	private mapSettingType(type: string): SettingField['type'] {
		const map: Record<string, SettingField['type']> = {
			text: 'text',
			password: 'password',
			checkbox: 'checkbox',
			select: 'select',
			info: 'info',
			info_cookie: 'info_cookie',
			info_cloudflare: 'info_cloudflare',
			info_flaresolverr: 'info_flaresolverr',
			info_useragent: 'info_useragent',
			info_category_8000: 'info_category_8000',
			cardigannCaptcha: 'cardigannCaptcha'
		};
		return map[type] ?? 'text';
	}

	/**
	 * Map Cardigann type to IndexerAccessType.
	 */
	private mapAccessType(type: string): 'public' | 'private' | 'semi-private' {
		if (type === 'private') return 'private';
		if (type === 'semi-private') return 'semi-private';
		return 'public';
	}

	/**
	 * Build capabilities from Cardigann modes.
	 */
	private buildCapabilities(modes: Record<string, string[]>): IndexerDefinition['capabilities'] {
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
			limitDefault: 50
		};
	}

	// =========================================================================
	// Public API
	// =========================================================================

	/**
	 * Get all loaded definitions.
	 */
	getAll(): IndexerDefinition[] {
		return Array.from(this.definitions.values());
	}

	/**
	 * Get all definitions as summaries for UI.
	 */
	getAllSummaries(): IndexerDefinitionSummary[] {
		return this.getAll().map(toDefinitionSummary);
	}

	/**
	 * Get a definition by ID.
	 */
	get(id: string): IndexerDefinition | undefined {
		return this.definitions.get(id);
	}

	/**
	 * Check if a definition exists.
	 */
	has(id: string): boolean {
		return this.definitions.has(id);
	}

	/**
	 * Get definitions by source.
	 */
	getBySource(source: 'yaml' | 'native'): IndexerDefinition[] {
		return this.getAll().filter((d) => d.source === source);
	}

	/**
	 * Get definitions by type.
	 */
	getByType(type: 'public' | 'private' | 'semi-private'): IndexerDefinition[] {
		return this.getAll().filter((d) => d.type === type);
	}

	/**
	 * Get count of native definitions.
	 */
	getNativeCount(): number {
		return this.getBySource('native').length;
	}

	/**
	 * Get count of YAML definitions.
	 */
	getYamlCount(): number {
		return this.getBySource('yaml').length;
	}

	/**
	 * Get total count.
	 */
	get count(): number {
		return this.definitions.size;
	}

	/**
	 * Get load errors.
	 */
	getErrors(): DefinitionLoadError[] {
		return [...this.errors];
	}

	/**
	 * Reload all definitions.
	 */
	async reload(): Promise<void> {
		await this.loadAll();
	}

	/**
	 * Check if definitions have been loaded.
	 */
	isLoaded(): boolean {
		return this.loaded;
	}
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: DefinitionLoader | null = null;

/**
 * Get the singleton definition loader instance.
 */
export function getDefinitionLoader(): DefinitionLoader {
	if (!instance) {
		instance = new DefinitionLoader();
	}
	return instance;
}

/**
 * Initialize the definition loader.
 * Call this during app startup.
 */
export async function initializeDefinitions(): Promise<DefinitionLoader> {
	const loader = getDefinitionLoader();
	if (!loader.isLoaded()) {
		await loader.loadAll();
	}
	return loader;
}
