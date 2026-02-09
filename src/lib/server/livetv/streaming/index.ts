/**
 * Live TV Streaming Module
 *
 * Provides stream URL resolution and proxying for Live TV channels.
 * Now supports all provider types (Stalker, XStream, M3U).
 */

// Stream service - unified for all provider types
export {
	LiveTvStreamService,
	getLiveTvStreamService,
	type FetchStreamResult
} from './LiveTvStreamService';
