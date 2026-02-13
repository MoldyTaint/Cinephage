/**
 * Stream Validator
 *
 * Validates that streams are actually playable by:
 * 1. Fetching and validating HLS playlists
 * 2. Optionally checking segment accessibility
 * 3. Providing comprehensive validation results
 */

import { logger } from '$lib/logging';
import { DEFAULT_USER_AGENT } from '../constants';
import { fetchWithTimeout, type FetchOptions } from '../utils/http';
import { validatePlaylist, sanitizePlaylist, parseHLSMaster, isHLSPlaylist } from '../hls';
import type {
	StreamSource,
	StreamValidation,
	SegmentValidation,
	ValidationOptions,
	PlaylistValidationResult
} from '../types';

const streamLog = { logCategory: 'streams' as const };

// ============================================================================
// Configuration
// ============================================================================

/** Default validation timeout in ms */
const DEFAULT_VALIDATION_TIMEOUT_MS = 5000;

/** Default segment sample size */
const DEFAULT_SEGMENT_SAMPLE_SIZE = 1;

/** Maximum playlist size to fetch (prevent memory issues) */
const MAX_PLAYLIST_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

/** Minimum segment size to consider valid (bytes) */
const MIN_SEGMENT_SIZE_BYTES = 100;

// ============================================================================
// Stream Validator Class
// ============================================================================

/**
 * Service for validating stream playability
 */
export class StreamValidator {
	private readonly defaultOptions: Required<ValidationOptions>;

	constructor(options?: Partial<ValidationOptions>) {
		this.defaultOptions = {
			validateSegments: options?.validateSegments ?? false,
			segmentSampleSize: options?.segmentSampleSize ?? DEFAULT_SEGMENT_SAMPLE_SIZE,
			timeout: options?.timeout ?? DEFAULT_VALIDATION_TIMEOUT_MS,
			followRedirects: options?.followRedirects ?? true,
			referer: options?.referer ?? ''
		};
	}

	// --------------------------------------------------------------------------
	// Playlist Validation
	// --------------------------------------------------------------------------

	/**
	 * Validate an HLS playlist URL
	 *
	 * Fetches the playlist and validates its structure.
	 * Does NOT validate segments by default.
	 */
	async validatePlaylistUrl(
		url: string,
		referer?: string,
		options?: Partial<ValidationOptions>
	): Promise<PlaylistValidationResult> {
		const opts = { ...this.defaultOptions, ...options };
		const effectiveReferer = referer ?? opts.referer;

		const result: PlaylistValidationResult = {
			valid: false,
			type: 'unknown'
		};

		try {
			// Fetch the playlist
			const fetchOpts: FetchOptions = {
				timeout: opts.timeout,
				referer: effectiveReferer
			};

			const response = await fetchWithTimeout(url, fetchOpts);

			if (!response.ok) {
				result.error = `HTTP ${response.status}: ${response.statusText}`;
				result.errors = [result.error];
				return result;
			}

			// Check content length
			const contentLength = parseInt(response.headers.get('content-length') ?? '0', 10);
			if (contentLength > MAX_PLAYLIST_SIZE_BYTES) {
				result.error = `Playlist too large: ${contentLength} bytes`;
				result.errors = [result.error];
				return result;
			}

			// Read and validate content
			const content = await response.text();

			if (!content || content.trim().length === 0) {
				result.error = 'Empty playlist content';
				result.errors = [result.error];
				return result;
			}

			// Quick check for HLS markers
			if (!isHLSPlaylist(content)) {
				result.error = 'Not a valid HLS playlist (missing #EXTM3U)';
				result.errors = [result.error];
				result.preview = content.substring(0, 200);
				return result;
			}

			// Sanitize potentially corrupted playlist
			const sanitized = sanitizePlaylist(content);

			// Full validation
			const validation = validatePlaylist(sanitized);
			result.valid = validation.valid;
			result.type = validation.type;
			result.errors = validation.errors;
			result.warnings = validation.warnings;

			if (!validation.valid) {
				result.error = validation.errors.join('; ');
			}

			// Count variants/segments based on type
			if (result.type === 'master') {
				const variants = parseHLSMaster(sanitized, url);
				result.variantCount = variants.length;
			} else if (result.type === 'media') {
				const segmentCount = (sanitized.match(/#EXTINF:/g) || []).length;
				result.segmentCount = segmentCount;
				result.isVod = sanitized.includes('#EXT-X-ENDLIST');
			}

			// Store preview for debugging
			result.preview = sanitized.substring(0, 500);

			return result;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			result.error = errorMessage;
			result.errors = [errorMessage];

			logger.debug('Playlist validation failed', {
				url,
				error: errorMessage,
				...streamLog
			});

			return result;
		}
	}

	// --------------------------------------------------------------------------
	// Segment Validation
	// --------------------------------------------------------------------------

	/**
	 * Validate that a segment is accessible
	 *
	 * Performs a HEAD request (or partial GET) to check accessibility.
	 */
	async validateSegment(
		url: string,
		referer?: string,
		options?: Partial<ValidationOptions>
	): Promise<SegmentValidation> {
		const opts = { ...this.defaultOptions, ...options };
		const effectiveReferer = referer ?? opts.referer;
		const startTime = Date.now();

		try {
			// Try HEAD first (faster)
			const response = await fetchWithTimeout(url, {
				method: 'HEAD',
				timeout: opts.timeout,
				referer: effectiveReferer
			});

			const responseTime = Date.now() - startTime;

			if (!response.ok) {
				return {
					accessible: false,
					statusCode: response.status,
					responseTime,
					error: `HTTP ${response.status}: ${response.statusText}`
				};
			}

			const contentLength = parseInt(response.headers.get('content-length') ?? '0', 10);
			const contentType = response.headers.get('content-type') ?? undefined;

			// Validate content seems like video data
			const validContentTypes = [
				'video/mp2t',
				'video/MP2T',
				'application/octet-stream',
				'video/mp4',
				'application/mp4'
			];

			const _isValidType =
				!contentType ||
				validContentTypes.some((t) => contentType.includes(t)) ||
				url.endsWith('.ts') ||
				url.endsWith('.m4s');

			if (contentLength > 0 && contentLength < MIN_SEGMENT_SIZE_BYTES) {
				return {
					accessible: false,
					statusCode: response.status,
					contentType,
					contentLength,
					responseTime,
					error: `Segment too small: ${contentLength} bytes`
				};
			}

			return {
				accessible: true,
				statusCode: response.status,
				contentType,
				contentLength: contentLength > 0 ? contentLength : undefined,
				responseTime
			};
		} catch (error) {
			return {
				accessible: false,
				responseTime: Date.now() - startTime,
				error: error instanceof Error ? error.message : String(error)
			};
		}
	}

	/**
	 * Extract segment URLs from a media playlist
	 */
	private extractSegmentUrls(playlist: string, baseUrl: string): string[] {
		const lines = playlist.split('\n');
		const segments: string[] = [];
		const base = new URL(baseUrl);
		const basePath = base.pathname.substring(0, base.pathname.lastIndexOf('/') + 1);

		let afterExtinf = false;

		for (const line of lines) {
			const trimmed = line.trim();

			if (trimmed.startsWith('#EXTINF:')) {
				afterExtinf = true;
				continue;
			}

			if (afterExtinf && trimmed && !trimmed.startsWith('#')) {
				// Resolve URL
				let url: string;
				if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
					url = trimmed;
				} else if (trimmed.startsWith('/')) {
					url = `${base.origin}${trimmed}`;
				} else {
					url = `${base.origin}${basePath}${trimmed}`;
				}
				segments.push(url);
				afterExtinf = false;
			}
		}

		return segments;
	}

	// --------------------------------------------------------------------------
	// Full Stream Validation
	// --------------------------------------------------------------------------

	/**
	 * Validate a complete stream source
	 *
	 * This is the main validation method that:
	 * 1. Validates the playlist URL
	 * 2. Optionally validates segments
	 * 3. Returns comprehensive validation result
	 */
	async validateStream(
		source: StreamSource,
		options?: Partial<ValidationOptions>
	): Promise<StreamValidation> {
		const opts = { ...this.defaultOptions, ...options };
		const startTime = Date.now();

		const result: StreamValidation = {
			valid: false,
			playable: false,
			responseTime: 0,
			validatedAt: new Date()
		};

		try {
			// 1. Validate playlist
			const playlistValidation = await this.validatePlaylistUrl(source.url, source.referer, opts);

			if (!playlistValidation.valid) {
				result.error = playlistValidation.error;
				result.responseTime = Date.now() - startTime;
				return result;
			}

			result.valid = true;

			// Record variant/segment info
			if (playlistValidation.variantCount !== undefined) {
				result.variantCount = playlistValidation.variantCount;
			}

			// 2. For master playlists, pick a variant and validate it
			if (playlistValidation.type === 'master' && playlistValidation.variantCount) {
				// Fetch the playlist again to get variant URLs
				const response = await fetchWithTimeout(source.url, {
					timeout: opts.timeout,
					referer: source.referer
				});
				const content = await response.text();
				const variants = parseHLSMaster(content, source.url);

				if (variants.length > 0) {
					// Validate first variant (usually best quality)
					const variantValidation = await this.validatePlaylistUrl(
						variants[0].url,
						source.referer,
						{ ...opts, timeout: opts.timeout / 2 }
					);

					if (!variantValidation.valid) {
						result.playable = false;
						result.error = `Variant playlist invalid: ${variantValidation.error}`;
						result.responseTime = Date.now() - startTime;
						return result;
					}
				}
			}

			// 3. Optionally validate segments
			if (opts.validateSegments) {
				// Need to fetch media playlist to get segments
				let mediaPlaylistUrl = source.url;
				let mediaPlaylistContent: string | null = null;

				if (playlistValidation.type === 'master') {
					// Fetch a variant playlist
					const response = await fetchWithTimeout(source.url, {
						timeout: opts.timeout,
						referer: source.referer
					});
					const content = await response.text();
					const variants = parseHLSMaster(content, source.url);

					if (variants.length > 0) {
						mediaPlaylistUrl = variants[0].url;
						const variantResponse = await fetchWithTimeout(mediaPlaylistUrl, {
							timeout: opts.timeout / 2,
							referer: source.referer
						});
						mediaPlaylistContent = await variantResponse.text();
					}
				} else {
					const response = await fetchWithTimeout(source.url, {
						timeout: opts.timeout,
						referer: source.referer
					});
					mediaPlaylistContent = await response.text();
				}

				if (mediaPlaylistContent) {
					const segments = this.extractSegmentUrls(mediaPlaylistContent, mediaPlaylistUrl);
					const samplesToCheck = Math.min(segments.length, opts.segmentSampleSize);

					for (let i = 0; i < samplesToCheck; i++) {
						const segmentValidation = await this.validateSegment(segments[i], source.referer, {
							...opts,
							timeout: opts.timeout / 3
						});

						if (!segmentValidation.accessible) {
							result.playable = false;
							result.error = `Segment ${i + 1} inaccessible: ${segmentValidation.error}`;
							result.responseTime = Date.now() - startTime;
							return result;
						}
					}
				}
			}

			// All checks passed
			result.playable = true;
			result.responseTime = Date.now() - startTime;

			logger.debug('Stream validation successful', {
				url: source.url,
				responseTime: result.responseTime,
				variantCount: result.variantCount,
				...streamLog
			});

			return result;
		} catch (error) {
			result.error = error instanceof Error ? error.message : String(error);
			result.responseTime = Date.now() - startTime;

			logger.debug('Stream validation failed', {
				url: source.url,
				error: result.error,
				...streamLog
			});

			return result;
		}
	}

	// --------------------------------------------------------------------------
	// Batch Validation
	// --------------------------------------------------------------------------

	/**
	 * Validate multiple streams until one is found valid
	 *
	 * Returns the first valid stream, or null if none are valid.
	 * This is useful for fallback scenarios.
	 */
	async validateUntilValid(
		sources: StreamSource[],
		options?: Partial<ValidationOptions>
	): Promise<StreamSource | null> {
		for (const source of sources) {
			const validation = await this.validateStream(source, options);
			if (validation.playable) {
				return source;
			}
		}
		return null;
	}

	/**
	 * Validate all streams and return results
	 *
	 * Validates all sources in parallel (with concurrency limit).
	 */
	async validateAll(
		sources: StreamSource[],
		options?: Partial<ValidationOptions> & { concurrency?: number }
	): Promise<Map<StreamSource, StreamValidation>> {
		const results = new Map<StreamSource, StreamValidation>();
		const concurrency = options?.concurrency ?? 3;

		// Process in batches
		for (let i = 0; i < sources.length; i += concurrency) {
			const batch = sources.slice(i, i + concurrency);
			const validations = await Promise.all(
				batch.map((source) => this.validateStream(source, options))
			);

			batch.forEach((source, index) => {
				results.set(source, validations[index]);
			});
		}

		return results;
	}
}

// ============================================================================
// Singleton Instance
// ============================================================================

let validatorInstance: StreamValidator | null = null;

/**
 * Get the singleton StreamValidator instance
 */
export function getStreamValidator(): StreamValidator {
	if (!validatorInstance) {
		validatorInstance = new StreamValidator();
	}
	return validatorInstance;
}

/**
 * Create a new StreamValidator with custom options
 */
export function createStreamValidator(options?: Partial<ValidationOptions>): StreamValidator {
	return new StreamValidator(options);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Quick check if a stream URL is likely playable
 *
 * This is a fast check that doesn't fully validate.
 * Use validateStream() for comprehensive validation.
 */
export async function quickValidateStream(
	url: string,
	referer?: string,
	timeout = 3000
): Promise<boolean> {
	const headers: Record<string, string> = {
		'User-Agent': DEFAULT_USER_AGENT,
		Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
	};
	if (referer) {
		headers.Referer = referer;
	}

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeout);

	try {
		const response = await fetch(url, {
			method: 'GET',
			headers,
			signal: controller.signal
		});

		if (!response.ok) return false;

		const content = await response.text();
		return isHLSPlaylist(content);
	} catch {
		return false;
	} finally {
		clearTimeout(timeoutId);
	}
}
