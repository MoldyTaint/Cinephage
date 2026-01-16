/**
 * Indexer Definition System
 *
 * Provides loading and factory functionality for indexer definitions.
 *
 * ARCHITECTURE NOTE: Use IndexerManager.getUnifiedDefinitions() instead of
 * DefinitionLoader directly. The DefinitionLoader is deprecated and will be
 * removed in a future version. All definition loading should go through
 * IndexerManager to ensure consistent initialization and caching.
 */

// Types
export type {
	IndexerDefinition,
	IndexerDefinitionSummary,
	SettingField,
	SettingFieldType,
	CategoryMapping,
	DefinitionSource,
	CreateIndexerConfig,
	UIDefinitionSetting,
	UIIndexerDefinition
} from './types';

export {
	getDefaultSettings,
	getRequiredSettings,
	requiresAuth,
	toDefinitionSummary,
	toUIDefinition,
	yamlToUnifiedDefinition
} from './types';

// Definition Loader (DEPRECATED - use IndexerManager.getUnifiedDefinitions() instead)
export {
	DefinitionLoader,
	getDefinitionLoader,
	initializeDefinitions,
	type DefinitionLoadError
} from './DefinitionLoader';

// Factory (unified)
export { IndexerFactory, getIndexerFactory } from './IndexerFactory';

// YAML Definition Loader (primary loader - used by IndexerManager)
export {
	YamlDefinitionLoader,
	getYamlDefinitionLoader,
	resetYamlDefinitionLoader,
	type DefinitionLoadResult
} from './YamlDefinitionLoader';

// YAML Indexer Factory
export {
	YamlIndexerFactory,
	getYamlIndexerFactory,
	resetYamlIndexerFactory
} from './YamlIndexerFactory';
