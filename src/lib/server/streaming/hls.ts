/**
 * HLS Playlist Parser & Validator
 *
 * Parses HLS master playlists, selects quality variants,
 * and validates/sanitizes playlist content.
 */

import { logger } from '$lib/logging';
import { fetchWithTimeout } from './utils/http';
import { fetchWithCloudflareBypass } from './utils/cloudflare-streaming';

const streamLog = { logDomain: 'streams' as const };

// ============================================================================
// Playlist Validation
// ============================================================================

/**
 * Result of playlist validation
 */
export interface PlaylistValidation {
	valid: boolean;
	type: 'master' | 'media' | 'unknown';
	errors: string[];
	warnings: string[];
}

/**
 * Validate that content is a valid HLS playlist
 */
export function validatePlaylist(content: string): PlaylistValidation {
	const result: PlaylistValidation = {
		valid: false,
		type: 'unknown',
		errors: [],
		warnings: []
	};

	if (!content || content.trim().length === 0) {
		result.errors.push('Empty content');
		return result;
	}

	const lines = content.trim().split('\n');

	// Must start with #EXTM3U
	const firstLine = lines[0]?.trim();
	if (!firstLine?.startsWith('#EXTM3U')) {
		result.errors.push('Missing #EXTM3U header');
		return result;
	}

	// Detect playlist type
	const hasMasterTags = content.includes('#EXT-X-STREAM-INF');
	const hasMediaTags = content.includes('#EXTINF:');

	if (hasMasterTags && hasMediaTags) {
		result.warnings.push('Playlist contains both master and media tags');
	}

	if (hasMasterTags) {
		result.type = 'master';
		// Validate master playlist
		const streamInfCount = (content.match(/#EXT-X-STREAM-INF/g) || []).length;
		if (streamInfCount === 0) {
			result.errors.push('Master playlist has no variants');
		}
	} else if (hasMediaTags) {
		result.type = 'media';
		// Validate media playlist
		const segmentCount = (content.match(/#EXTINF:/g) || []).length;
		if (segmentCount === 0) {
			result.errors.push('Media playlist has no segments');
		}

		// Check for ENDLIST in VOD playlists
		if (!content.includes('#EXT-X-ENDLIST')) {
			result.warnings.push('Media playlist missing #EXT-X-ENDLIST (may be treated as live)');
		}
	} else {
		result.errors.push('Playlist has no recognizable HLS tags');
	}

	result.valid = result.errors.length === 0;
	return result;
}

/**
 * Sanitize a potentially corrupted playlist
 * Removes garbage content before/after HLS data
 */
export function sanitizePlaylist(content: string): string {
	if (!content) return content;

	// Find where #EXTM3U starts (remove any garbage before it)
	const extm3uIndex = content.indexOf('#EXTM3U');
	if (extm3uIndex > 0) {
		content = content.substring(extm3uIndex);
		logger.debug(
			{
				removedBytes: extm3uIndex,
				...streamLog
			},
			'HLS removed garbage before #EXTM3U'
		);
	} else if (extm3uIndex === -1) {
		// No #EXTM3U found, return as-is
		return content;
	}

	// Process lines and keep only valid HLS content
	const lines = content.split('\n');
	const sanitized: string[] = [];
	let foundEndlist = false;

	for (const line of lines) {
		const trimmed = line.trim();

		// Stop after #EXT-X-ENDLIST (ignore trailing garbage)
		if (trimmed === '#EXT-X-ENDLIST') {
			sanitized.push(line);
			foundEndlist = true;
			break;
		}

		// Keep HLS tags
		if (trimmed.startsWith('#')) {
			sanitized.push(line);
			continue;
		}

		// Keep URLs (absolute or relative)
		if (
			trimmed.startsWith('http://') ||
			trimmed.startsWith('https://') ||
			trimmed.startsWith('/') ||
			/^[a-zA-Z0-9_\-./]+(\?.*)?$/.test(trimmed)
		) {
			sanitized.push(line);
			continue;
		}

		// Keep empty lines (formatting)
		if (trimmed === '') {
			sanitized.push(line);
			continue;
		}

		// Skip unrecognized content
		logger.debug({ line: trimmed.substring(0, 50), ...streamLog }, 'HLS sanitizer skipped line');
	}

	// If we stopped at ENDLIST but there was content after, log it
	if (foundEndlist && lines.length > sanitized.length) {
		logger.debug(
			{
				removedLines: lines.length - sanitized.length,
				...streamLog
			},
			'HLS removed content after #EXT-X-ENDLIST'
		);
	}

	return sanitized.join('\n');
}

/**
 * Check if content looks like an HLS playlist (quick check)
 */
export function isHLSPlaylist(content: string): boolean {
	if (!content) return false;
	const start = content.trimStart().substring(0, 100);
	return start.startsWith('#EXTM3U');
}

export interface HLSVariant {
	url: string;
	bandwidth: number;
	resolution?: { width: number; height: number };
	codecs?: string;
}

/**
 * Parse an HLS master playlist and extract all quality variants
 */
export function parseHLSMaster(playlist: string, baseUrl: string): HLSVariant[] {
	const variants: HLSVariant[] = [];
	const lines = playlist.split('\n');

	let currentVariant: Partial<HLSVariant> | null = null;

	// Parse base URL for resolving relative paths
	const base = new URL(baseUrl);
	const basePath = base.pathname.substring(0, base.pathname.lastIndexOf('/') + 1);

	for (const line of lines) {
		const trimmed = line.trim();

		// Parse #EXT-X-STREAM-INF line
		if (trimmed.startsWith('#EXT-X-STREAM-INF:')) {
			const attrs = trimmed.substring('#EXT-X-STREAM-INF:'.length);
			currentVariant = {};

			// Extract BANDWIDTH
			const bandwidthMatch = attrs.match(/BANDWIDTH=(\d+)/);
			if (bandwidthMatch) {
				currentVariant.bandwidth = parseInt(bandwidthMatch[1], 10);
			}

			// Extract RESOLUTION
			const resolutionMatch = attrs.match(/RESOLUTION=(\d+)x(\d+)/);
			if (resolutionMatch) {
				currentVariant.resolution = {
					width: parseInt(resolutionMatch[1], 10),
					height: parseInt(resolutionMatch[2], 10)
				};
			}

			// Extract CODECS
			const codecsMatch = attrs.match(/CODECS="([^"]+)"/);
			if (codecsMatch) {
				currentVariant.codecs = codecsMatch[1];
			}
		}
		// URL line after #EXT-X-STREAM-INF
		else if (currentVariant && !trimmed.startsWith('#') && trimmed.length > 0) {
			// Resolve URL
			let url: string;
			if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
				url = trimmed;
			} else if (trimmed.startsWith('/')) {
				url = `${base.origin}${trimmed}`;
			} else {
				url = `${base.origin}${basePath}${trimmed}`;
			}

			currentVariant.url = url;

			if (currentVariant.bandwidth && currentVariant.url) {
				variants.push(currentVariant as HLSVariant);
			}
			currentVariant = null;
		}
	}

	return variants;
}

/**
 * Select a conservative fallback variant from a list.
 *
 * Prefer the lowest bitrate stream when we must collapse a master playlist
 * to a single variant. This reduces playback stalls on constrained networks.
 */
export function selectBestVariant(variants: HLSVariant[]): HLSVariant | null {
	if (variants.length === 0) return null;
	if (variants.length === 1) return variants[0];

	// Sort by bandwidth first so we keep the most forgiving stream when adaptive
	// selection is unavailable.
	const sorted = [...variants].sort((a, b) => {
		if (a.bandwidth !== b.bandwidth) {
			return a.bandwidth - b.bandwidth;
		}

		const aHeight = a.resolution?.height ?? Number.MAX_SAFE_INTEGER;
		const bHeight = b.resolution?.height ?? Number.MAX_SAFE_INTEGER;
		if (aHeight !== bHeight) {
			return aHeight - bHeight;
		}

		return a.url.localeCompare(b.url);
	});

	return sorted[0];
}

/**
 * Result of getBestQualityStreamUrl containing both raw and proxied URLs.
 */
export interface BestQualityResult {
	/** The raw URL to use for playback */
	rawUrl: string;
	/** Whether this is the original master URL */
	isMasterUrl: boolean;
}

/**
 * Fetch HLS master playlist and return the original master URL when adaptive
 * playback is available.
 *
 * This fetches the playlist directly to confirm the URL is a valid adaptive
 * HLS source and preserves the original master URL for playback.
 *
 * @param masterUrl - The master playlist URL
 * @param referer - Referer header for requests
 * @returns The raw URL to use for playback
 */
export async function getBestQualityStreamUrl(
	masterUrl: string,
	referer: string,
	useCloudflareBypass: boolean = true
): Promise<BestQualityResult> {
	try {
		// Fetch the master playlist directly.
		// Note: Don't send Origin header - some CDNs reject it
		// Use Cloudflare bypass for streaming URLs that may be protected
		const fetchFn = useCloudflareBypass ? fetchWithCloudflareBypass : fetchWithTimeout;
		const response = await fetchFn(masterUrl, {
			referer,
			timeout: 15000, // Increased timeout for Cloudflare bypass
			headers: {
				Accept: '*/*'
			}
		});

		if (!response.ok) {
			logger.warn({ status: response.status, ...streamLog }, 'HLS failed to fetch master playlist');
			// Fall back to master URL
			return { rawUrl: masterUrl, isMasterUrl: true };
		}

		const playlist = await response.text();

		// Check if this is a master playlist (has #EXT-X-STREAM-INF)
		if (!playlist.includes('#EXT-X-STREAM-INF')) {
			// This is already a media playlist, not a master
			logger.debug({ ...streamLog }, 'HLS not a master playlist, returning original');
			return { rawUrl: masterUrl, isMasterUrl: true };
		}

		// Parse variants from the raw playlist
		const variants = parseHLSMaster(playlist, masterUrl);
		logger.debug({ count: variants.length, ...streamLog }, 'HLS found quality variants');

		if (variants.length === 0) {
			logger.debug({ ...streamLog }, 'HLS no variants found, returning original');
			return { rawUrl: masterUrl, isMasterUrl: true };
		}

		const qualities = variants.map((v) => ({
			resolution: v.resolution ? `${v.resolution.width}x${v.resolution.height}` : 'unknown',
			bandwidth: Math.round(v.bandwidth / 1000)
		}));
		logger.debug({ qualities, ...streamLog }, 'HLS available qualities');

		// Preserve the original master playlist so clients can adapt bitrate as
		// conditions change during playback.
		logger.debug({ ...streamLog }, 'HLS preserving master playlist for adaptive playback');
		return { rawUrl: masterUrl, isMasterUrl: true };
	} catch (error) {
		logger.warn(
			{
				error: error instanceof Error ? error.message : String(error),
				...streamLog
			},
			'HLS error selecting best quality'
		);
		// Fall back to master URL
		return { rawUrl: masterUrl, isMasterUrl: true };
	}
}
