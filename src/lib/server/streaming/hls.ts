/**
 * HLS Playlist Parser & Validator
 *
 * Parses HLS master playlists, selects best quality variants,
 * and validates/sanitizes playlist content.
 */

import { logger } from '$lib/logging';
import { fetchWithTimeout } from './utils/http';

const streamLog = { logCategory: 'streams' as const };

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
		logger.debug('HLS removed garbage before #EXTM3U', {
			removedBytes: extm3uIndex,
			...streamLog
		});
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
		logger.debug('HLS sanitizer skipped line', { line: trimmed.substring(0, 50), ...streamLog });
	}

	// If we stopped at ENDLIST but there was content after, log it
	if (foundEndlist && lines.length > sanitized.length) {
		logger.debug('HLS removed content after #EXT-X-ENDLIST', {
			removedLines: lines.length - sanitized.length,
			...streamLog
		});
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
 * Select the best quality variant from a list
 * Prioritizes by resolution height, then bandwidth
 */
export function selectBestVariant(variants: HLSVariant[]): HLSVariant | null {
	if (variants.length === 0) return null;
	if (variants.length === 1) return variants[0];

	// Sort by resolution height (descending), then bandwidth (descending)
	const sorted = [...variants].sort((a, b) => {
		// First compare by resolution height
		const aHeight = a.resolution?.height ?? 0;
		const bHeight = b.resolution?.height ?? 0;
		if (aHeight !== bHeight) {
			return bHeight - aHeight; // Higher resolution first
		}

		// Then by bandwidth
		return b.bandwidth - a.bandwidth; // Higher bandwidth first
	});

	return sorted[0];
}

/**
 * Result of getBestQualityStreamUrl containing both raw and proxied URLs.
 */
export interface BestQualityResult {
	/** The raw URL of the best quality variant (or master URL if no variants) */
	rawUrl: string;
	/** Whether this is the master URL (couldn't find variants) or a specific variant */
	isMasterUrl: boolean;
}

/**
 * Fetch HLS master playlist, parse it, and return the best quality variant URL.
 *
 * This fetches the playlist DIRECTLY (not through our proxy) to avoid
 * server-to-server loopback issues. Returns the raw URL for use with
 * fetchAndRewritePlaylist.
 *
 * @param masterUrl - The master playlist URL
 * @param referer - Referer header for requests
 * @returns The raw URL of the best quality variant
 */
export async function getBestQualityStreamUrl(
	masterUrl: string,
	referer: string
): Promise<BestQualityResult> {
	try {
		// Fetch the master playlist DIRECTLY (not through proxy - avoids loopback issues)
		// Note: Don't send Origin header - some CDNs reject it
		const response = await fetchWithTimeout(masterUrl, {
			referer,
			timeout: 8000,
			headers: {
				Accept: '*/*'
			}
		});

		if (!response.ok) {
			logger.warn('HLS failed to fetch master playlist', { status: response.status, ...streamLog });
			// Fall back to master URL
			return { rawUrl: masterUrl, isMasterUrl: true };
		}

		const playlist = await response.text();

		// Check if this is a master playlist (has #EXT-X-STREAM-INF)
		if (!playlist.includes('#EXT-X-STREAM-INF')) {
			// This is already a media playlist, not a master
			logger.debug('HLS not a master playlist, returning original', { ...streamLog });
			return { rawUrl: masterUrl, isMasterUrl: true };
		}

		// Parse variants from the raw playlist
		const variants = parseHLSMaster(playlist, masterUrl);
		logger.debug('HLS found quality variants', { count: variants.length, ...streamLog });

		if (variants.length === 0) {
			logger.debug('HLS no variants found, returning original', { ...streamLog });
			return { rawUrl: masterUrl, isMasterUrl: true };
		}

		// Log available qualities
		const qualities = variants.map((v) => ({
			resolution: v.resolution ? `${v.resolution.width}x${v.resolution.height}` : 'unknown',
			bandwidth: Math.round(v.bandwidth / 1000)
		}));
		logger.debug('HLS available qualities', { qualities, ...streamLog });

		// Select best variant
		const best = selectBestVariant(variants);
		if (!best) {
			return { rawUrl: masterUrl, isMasterUrl: true };
		}

		const bestRes = best.resolution ? `${best.resolution.width}x${best.resolution.height}` : 'auto';
		logger.debug('HLS selected best quality', {
			resolution: bestRes,
			bandwidth: Math.round(best.bandwidth / 1000),
			...streamLog
		});

		// Return the raw best variant URL
		return { rawUrl: best.url, isMasterUrl: false };
	} catch (error) {
		logger.warn('HLS error selecting best quality', {
			error: error instanceof Error ? error.message : String(error),
			...streamLog
		});
		// Fall back to master URL
		return { rawUrl: masterUrl, isMasterUrl: true };
	}
}
