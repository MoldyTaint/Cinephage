/**
 * Indexer System - Main exports
 *
 * This module provides a complete indexer management system with support for:
 * - YAML-based indexer definitions (compatible with Prowlarr/Jackett format)
 * - Native TypeScript indexers
 * - Typed search criteria and tiered search strategies
 * - Comprehensive status tracking and rate limiting
 * - Unified type system for all indexer types
 * - Protocol handlers for torrent, usenet, and streaming
 * - Pluggable authentication providers
 */

// =============================================================================
// UNIFIED TYPE SYSTEM (CANONICAL SOURCE)
// =============================================================================

// Export new unified types - this is the canonical source for all types
export * from './types';

// Export protocol handlers
export * from './protocols';

// Export authentication providers
export * from './auth';

// Export unified registry (explicit exports to avoid conflicts)
export {
	UnifiedDefinitionRegistry,
	getUnifiedRegistry,
	resetUnifiedRegistry,
	type RegisteredDefinition,
	type DefinitionSource,
	type DefinitionFilter,
	type IndexerFactory
} from './registry';

// =============================================================================
// RUNTIME EXPORTS
// =============================================================================

// Status tracking (explicit exports to avoid HealthStatus/IndexerStatus conflicts)
export {
	type FailureRecord,
	type StatusTrackerConfig,
	DEFAULT_STATUS_CONFIG,
	createDefaultStatus,
	BackoffCalculator,
	defaultBackoffCalculator,
	PersistentStatusTracker,
	getPersistentStatusTracker,
	resetPersistentStatusTracker
} from './status';

// Rate limiting
export * from './ratelimit';

// Category mapping (explicit exports to avoid getCategoryName conflict)
export {
	type CategoryInfo,
	NEWZNAB_CATEGORIES,
	getCategoryById,
	getParentCategoryId,
	getSubcategories,
	isSubcategoryOf,
	getRootCategory,
	toCategory,
	mapYtsCategory,
	mapEztvCategory,
	detectQualityCategories,
	filterMovieCategories,
	filterTvCategories,
	hasMovieCategory,
	hasTvCategory,
	normalizeCategories
} from './categories';

// Runtime components
export * from './runtime';

// Engines (template, filter, selector)
export {
	TemplateEngine,
	createTemplateEngine,
	FilterEngine,
	createFilterEngine,
	SelectorEngine,
	createSelectorEngine
} from './engine';

// Schema types
export {
	type YamlDefinition,
	type CardigannDefinition,
	type LoginBlock,
	type SearchBlock,
	type DownloadBlock,
	type DownloadVariable,
	type SelectorBlock,
	type FilterBlock,
	type CapabilitiesBlock,
	type SettingsField
} from './schema/yamlDefinition';

// Search orchestration
export * from './search';

// Definition loader and factory (explicit exports to avoid type conflicts)
export {
	type IndexerDefinitionSummary,
	type CreateIndexerConfig,
	type UIDefinitionSetting,
	type UIIndexerDefinition,
	getDefaultSettings,
	getRequiredSettings,
	requiresAuth,
	toDefinitionSummary,
	toUIDefinition,
	DefinitionLoader,
	getDefinitionLoader,
	initializeDefinitions,
	type DefinitionLoadError,
	getIndexerFactory,
	YamlDefinitionLoader,
	getYamlDefinitionLoader,
	resetYamlDefinitionLoader,
	type DefinitionLoadResult,
	YamlIndexerFactory,
	getYamlIndexerFactory,
	resetYamlIndexerFactory
} from './loader';
// Re-export IndexerFactory with explicit name to avoid conflict with types
export { IndexerFactory as LoaderIndexerFactory } from './loader';

// Main manager (YAML-only architecture)
export { IndexerManager, getIndexerManager, resetIndexerManager } from './IndexerManager';
