/**
 * Stream Types
 *
 * Core type definitions for streams and extraction results.
 */

// ============================================================================
// Stream Source Types
// ============================================================================

/**
 * Stream type identifier
 */
export type StreamType = 'hls' | 'm3u8' | 'mp4';

/**
 * Stream availability status
 */
export type StreamStatus = 'working' | 'down' | 'unknown' | 'validating';

/**
 * A stream source returned from a provider
 */
export interface StreamSource {
	/** Quality label (e.g., '1080p', '720p', '4K', 'Auto') */
	quality: string;

	/** Display title for the stream */
	title: string;

	/** Stream URL (HLS/M3U8/MP4) */
	url: string;

	/** Stream type */
	type: StreamType;

	/** Referer header needed to play the stream */
	referer: string;

	/** Whether the stream requires segment proxying */
	requiresSegmentProxy: boolean;

	/** Stream availability status */
	status?: StreamStatus;

	/** Server/source name within the provider */
	server?: string;

	/** Language of the content (ISO 639-1 code) */
	language?: string;

	/** Additional headers needed for playback */
	headers?: Record<string, string>;

	/** Provider ID that returned this stream */
	provider?: string;
}

// ============================================================================
// Stream Result Types (from providers)
// ============================================================================

/**
 * A single stream/source from a provider (internal format)
 */
export interface StreamResult {
	/** Stream URL (HLS/M3U8/MP4) */
	url: string;

	/** Quality label (e.g., '1080p', '720p', '4K') */
	quality: string;

	/** Display title for the stream */
	title: string;

	/** Stream type */
	streamType: StreamType;

	/** Referer header needed to play the stream */
	referer: string;

	/** Server/source name within the provider */
	server?: string;

	/** Language of the content */
	language?: string;

	/** Additional headers needed for playback */
	headers?: Record<string, string>;

	/** Provider ID that returned this stream */
	provider?: string;
}

// ============================================================================
// Validation Types
// ============================================================================

/**
 * Result of validating a stream's playability
 */
export interface StreamValidation {
	/** Whether the stream URL is valid and accessible */
	valid: boolean;

	/** Whether the stream is actually playable (playlist parses, segments accessible) */
	playable: boolean;

	/** Detected quality from playlist (if available) */
	quality?: string;

	/** Number of variants in master playlist */
	variantCount?: number;

	/** Error message if validation failed */
	error?: string;

	/** HTTP status code if relevant */
	statusCode?: number;

	/** Time taken to validate in milliseconds */
	responseTime: number;

	/** Timestamp when validation was performed */
	validatedAt: Date;
}

/**
 * Result of validating an HLS playlist (extended validation)
 * For basic validation with errors/warnings arrays, see hls.ts PlaylistValidation
 */
export interface PlaylistValidationResult {
	/** Whether the playlist is valid HLS format */
	valid: boolean;

	/** Playlist type: master (contains variants) or media (contains segments) */
	type: 'master' | 'media' | 'unknown';

	/** Number of variants (for master playlists) */
	variantCount?: number;

	/** Number of segments (for media playlists) */
	segmentCount?: number;

	/** Whether playlist has VOD markers */
	isVod?: boolean;

	/** Error message if validation failed */
	error?: string;

	/** Validation errors (detailed) */
	errors?: string[];

	/** Validation warnings */
	warnings?: string[];

	/** Raw playlist content (truncated for debugging) */
	preview?: string;
}

/**
 * Result of validating a segment's accessibility
 */
export interface SegmentValidation {
	/** Whether the segment is accessible */
	accessible: boolean;

	/** HTTP status code */
	statusCode?: number;

	/** Content type of the segment */
	contentType?: string;

	/** Content length in bytes */
	contentLength?: number;

	/** Time taken to fetch in milliseconds */
	responseTime: number;

	/** Error message if validation failed */
	error?: string;
}

/**
 * Options for stream validation
 */
export interface ValidationOptions {
	/** Whether to validate segments (default: false, just check playlist) */
	validateSegments?: boolean;

	/** Number of segments to sample (default: 1) */
	segmentSampleSize?: number;

	/** Timeout in milliseconds (default: 5000) */
	timeout?: number;

	/** Whether to follow redirects (default: true) */
	followRedirects?: boolean;

	/** Custom referer to use */
	referer?: string;
}

// ============================================================================
// Validated Stream Types
// ============================================================================

/**
 * A stream source that has been validated
 */
export interface ValidatedStreamSource extends StreamSource {
	/** Validation result */
	validation: StreamValidation;
}

/**
 * A stream result that has been validated
 */
export interface ValidatedStreamResult extends StreamResult {
	/** Validation result */
	validation: StreamValidation;
}
