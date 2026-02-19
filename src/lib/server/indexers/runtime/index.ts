/**
 * Runtime module exports.
 *
 * Provides indexer runtime components:
 * - UnifiedIndexer: Full-featured YAML-based indexer implementation
 * - RequestBuilder: HTTP request construction
 * - ResponseParser: HTML/JSON/XML parsing
 * - DownloadHandler: Download URL resolution
 * - SearchCapabilityChecker: Search criteria validation
 */

// YAML-based indexer runtime
export {
	RequestBuilder,
	createRequestBuilder,
	CategoryMapper,
	type HttpRequest
} from './RequestBuilder';
export {
	ResponseParser,
	createResponseParser,
	type ParseResult,
	type ParseContext
} from './ResponseParser';
export {
	DownloadHandler,
	createDownloadHandler,
	type DownloadContext,
	type DownloadRequest,
	type DownloadResult
} from './DownloadHandler';

// Search capability checking
export { SearchCapabilityChecker } from './SearchCapabilityChecker';
