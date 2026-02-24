/**
 * Live TV Streaming Module
 *
 * Provides stream URL resolution and proxying for Live TV channels.
 * Supports all provider types (Stalker, XStream, M3U).
 */

// Stream service - unified for all provider types
export {
	LiveTvStreamService,
	getLiveTvStreamService,
	type FetchStreamResult,
	type StreamUrlResolution
} from './LiveTvStreamService';
