/**
 * Shared streaming types used by the active Cinephage API path.
 */

export type StreamType = 'hls' | 'm3u8' | 'mp4';

export type StreamStatus = 'working' | 'down' | 'unknown' | 'validating';

export interface StreamSubtitle {
	url: string;
	label: string;
	language: string;
	isDefault?: boolean;
}

export interface StreamSource {
	quality: string;
	title: string;
	url: string;
	type: StreamType;
	referer: string;
	requiresSegmentProxy: boolean;
	status?: StreamStatus;
	server?: string;
	language?: string;
	headers?: Record<string, string>;
	provider?: string;
	subtitles?: StreamSubtitle[];
}

export interface StreamResult {
	url: string;
	quality: string;
	title: string;
	streamType: StreamType;
	referer: string;
	server?: string;
	language?: string;
	headers?: Record<string, string>;
	provider?: string;
	subtitles?: StreamSubtitle[];
}

export interface StreamValidation {
	valid: boolean;
	playable: boolean;
	quality?: string;
	variantCount?: number;
	error?: string;
	statusCode?: number;
	responseTime: number;
	validatedAt: Date;
}

export interface PlaylistValidationResult {
	valid: boolean;
	type: 'master' | 'media' | 'unknown';
	variantCount?: number;
	segmentCount?: number;
	isVod?: boolean;
	error?: string;
	errors?: string[];
	warnings?: string[];
	preview?: string;
}

export interface SegmentValidation {
	accessible: boolean;
	statusCode?: number;
	contentType?: string;
	contentLength?: number;
	responseTime: number;
	error?: string;
}

export interface ValidationOptions {
	validateSegments?: boolean;
	segmentSampleSize?: number;
	timeout?: number;
	followRedirects?: boolean;
	referer?: string;
}

export interface ValidatedStreamSource extends StreamSource {
	validation: StreamValidation;
}

export interface ValidatedStreamResult extends StreamResult {
	validation: StreamValidation;
}

export interface ExtractionResult {
	success: boolean;
	sources: StreamSource[];
	error?: string;
	provider?: string;
	durationMs?: number;
	providersAttempted?: number;
}

export interface ValidatedExtractionResult extends ExtractionResult {
	sources: ValidatedStreamSource[];
	validated: boolean;
	validatedAt?: Date;
	validationDurationMs?: number;
}

export type PlaybackMediaType = 'movie' | 'tv';

export type SessionResourceKind = 'playlist' | 'segment' | 'asset';

export interface PlaybackSessionSubtitle {
	id: string;
	url: string;
	label: string;
	language: string;
	isDefault?: boolean;
}

export interface PlaybackSessionResource {
	id: string;
	url: string;
	kind: SessionResourceKind;
	extension: string;
	createdAt: number;
}

export interface PlaybackSessionAttempt {
	provider?: string;
	url: string;
	success: boolean;
	error?: string;
	statusCode?: number;
}

export interface PlaybackSession {
	token: string;
	mediaType: PlaybackMediaType;
	tmdbId: number;
	season?: number;
	episode?: number;
	provider?: string;
	entryUrl: string;
	sourceType: StreamType;
	requestHeaders: Record<string, string>;
	subtitles: PlaybackSessionSubtitle[];
	createdAt: number;
	expiresAt: number;
	lastAccessedAt: number;
	attempts: PlaybackSessionAttempt[];
	resourceIdsByKey: Record<string, string>;
	resources: Record<string, PlaybackSessionResource>;
}

export interface PlaybackSessionStats {
	activeSessions: number;
	resources: number;
	expiredSessions: number;
	createdSessions: number;
	reusedSessions: number;
}
