/**
 * HLS Subtitle Injection
 *
 * Injects subtitle tracks into HLS master playlists using EXT-X-MEDIA tags.
 * This allows players like Jellyfin to discover and display subtitle options.
 */

import type { StreamSubtitle } from '../types';

/**
 * Inject subtitle tracks into an HLS master playlist
 *
 * Adds EXT-X-MEDIA tags for each subtitle track and updates EXT-X-STREAM-INF
 * tags to reference the subtitle group.
 *
 * @param playlist - Original HLS master playlist content
 * @param subtitles - Array of subtitle tracks to inject
 * @param baseUrl - Base URL for subtitle playlist endpoints
 * @param referer - Referer header needed to access subtitle files
 * @returns Modified playlist with subtitle tracks injected
 */
export function injectSubtitles(
	playlist: string,
	subtitles: StreamSubtitle[],
	baseUrl: string,
	referer: string,
	apiKey?: string
): string {
	if (!subtitles.length) return playlist;

	const lines = playlist.split('\n');
	const result: string[] = [];

	// Generate EXT-X-MEDIA tags for each subtitle track
	const mediaTags = subtitles.map((sub, i) => {
		const playlistUrl = buildSubtitlePlaylistUrl(baseUrl, sub.url, referer, apiKey);
		const isDefault = sub.isDefault || i === 0;
		const name = escapeQuotes(sub.label);
		const lang = sub.language || 'und';

		return `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="${name}",DEFAULT=${isDefault ? 'YES' : 'NO'},AUTOSELECT=YES,FORCED=NO,LANGUAGE="${lang}",URI="${playlistUrl}"`;
	});

	// Process playlist line by line
	let insertedMedia = false;
	for (const line of lines) {
		result.push(line);

		// Insert subtitle media tags after #EXTM3U header
		if (line.trim() === '#EXTM3U' && !insertedMedia) {
			result.push(...mediaTags);
			insertedMedia = true;
		}
	}

	// Add SUBTITLES attribute to all EXT-X-STREAM-INF tags
	return result
		.map((line) => {
			if (line.startsWith('#EXT-X-STREAM-INF:') && !line.includes('SUBTITLES=')) {
				// Append SUBTITLES group reference
				return line.trimEnd() + ',SUBTITLES="subs"';
			}
			return line;
		})
		.join('\n');
}

/**
 * Check if an HLS playlist is a master playlist (contains variant streams)
 *
 * @param content - HLS playlist content
 * @returns True if this is a master playlist
 */
export function isMasterPlaylist(content: string): boolean {
	return content.includes('#EXT-X-STREAM-INF');
}

/**
 * Build URL for subtitle playlist endpoint
 */
function buildSubtitlePlaylistUrl(
	baseUrl: string,
	subtitleUrl: string,
	referer: string,
	apiKey?: string
): string {
	const params = new URLSearchParams();
	params.set('url', subtitleUrl);
	if (referer) {
		params.set('referer', referer);
	}
	let url = `${baseUrl}/api/streaming/subtitle/playlist?${params.toString()}`;
	if (apiKey) {
		url += `&api_key=${encodeURIComponent(apiKey)}`;
	}
	return url;
}

/**
 * Escape double quotes in string for HLS attribute values
 */
function escapeQuotes(str: string): string {
	return str.replace(/"/g, '\\"');
}
