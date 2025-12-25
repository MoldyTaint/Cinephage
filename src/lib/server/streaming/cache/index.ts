/**
 * Cache Module Exports
 *
 * Multi-level caching for stream extraction with:
 * - Stream URL cache (successful extractions)
 * - Validation cache (stream validation results)
 * - Negative cache (failed extractions - prevents hammering)
 * - Persistent cache (survives server restarts)
 */

export {
	MultiLevelStreamCache,
	getStreamCache,
	createStreamCache,
	type CacheStats,
	type FailureType,
	getFailureTtl
} from './StreamCache';

export {
	PersistentStreamCache,
	getPersistentStreamCache,
	initPersistentStreamCache
} from './PersistentStreamCache';
