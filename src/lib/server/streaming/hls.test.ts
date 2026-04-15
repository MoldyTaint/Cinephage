/**
 * HLS Parser Unit Tests
 *
 * Tests the HLS master playlist parsing, quality selection,
 * and validation/sanitization logic.
 * These tests use sample playlists - no network calls required.
 */

import { describe, it, expect } from 'vitest';
import {
	parseHLSMaster,
	selectBestVariant,
	validatePlaylist,
	sanitizePlaylist,
	isHLSPlaylist,
	type HLSVariant
} from './hls';

// Sample master playlist (realistic format)
const SAMPLE_MASTER_PLAYLIST = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2"
1080p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720,CODECS="avc1.4d401f,mp4a.40.2"
720p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=854x480,CODECS="avc1.42c01e,mp4a.40.2"
480p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
360p/playlist.m3u8
`;

const SAMPLE_MASTER_ABSOLUTE_URLS = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080
https://cdn.example.com/streams/1080p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720
https://cdn.example.com/streams/720p.m3u8
`;

const SAMPLE_MASTER_ROOT_RELATIVE = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1920x1080
/streams/high/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1280x720
/streams/medium/index.m3u8
`;

const SAMPLE_MEDIA_PLAYLIST = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:10.0,
segment0.ts
#EXTINF:10.0,
segment1.ts
#EXT-X-ENDLIST
`;

describe('HLS Parser', () => {
	describe('parseHLSMaster', () => {
		it('should parse variants from a standard master playlist', () => {
			const baseUrl = 'https://example.com/video/master.m3u8';
			const variants = parseHLSMaster(SAMPLE_MASTER_PLAYLIST, baseUrl);

			expect(variants).toHaveLength(4);

			// Check 1080p variant
			const v1080 = variants.find((v) => v.resolution?.height === 1080);
			expect(v1080).toBeDefined();
			expect(v1080?.bandwidth).toBe(5000000);
			expect(v1080?.resolution?.width).toBe(1920);
			expect(v1080?.codecs).toBe('avc1.640028,mp4a.40.2');
			expect(v1080?.url).toBe('https://example.com/video/1080p/playlist.m3u8');

			// Check 720p variant
			const v720 = variants.find((v) => v.resolution?.height === 720);
			expect(v720).toBeDefined();
			expect(v720?.bandwidth).toBe(3000000);

			// Check 480p variant
			const v480 = variants.find((v) => v.resolution?.height === 480);
			expect(v480).toBeDefined();
			expect(v480?.bandwidth).toBe(1500000);

			// Check 360p variant (no codecs)
			const v360 = variants.find((v) => v.resolution?.height === 360);
			expect(v360).toBeDefined();
			expect(v360?.bandwidth).toBe(800000);
			expect(v360?.codecs).toBeUndefined();
		});

		it('should handle absolute URLs in playlist', () => {
			const baseUrl = 'https://example.com/master.m3u8';
			const variants = parseHLSMaster(SAMPLE_MASTER_ABSOLUTE_URLS, baseUrl);

			expect(variants).toHaveLength(2);
			expect(variants[0].url).toBe('https://cdn.example.com/streams/1080p.m3u8');
			expect(variants[1].url).toBe('https://cdn.example.com/streams/720p.m3u8');
		});

		it('should handle root-relative URLs', () => {
			const baseUrl = 'https://example.com/video/master.m3u8';
			const variants = parseHLSMaster(SAMPLE_MASTER_ROOT_RELATIVE, baseUrl);

			expect(variants).toHaveLength(2);
			expect(variants[0].url).toBe('https://example.com/streams/high/index.m3u8');
			expect(variants[1].url).toBe('https://example.com/streams/medium/index.m3u8');
		});

		it('should return empty array for media playlist (not master)', () => {
			const baseUrl = 'https://example.com/playlist.m3u8';
			const variants = parseHLSMaster(SAMPLE_MEDIA_PLAYLIST, baseUrl);

			// Media playlists have no #EXT-X-STREAM-INF tags
			expect(variants).toHaveLength(0);
		});

		it('should return empty array for empty content', () => {
			const variants = parseHLSMaster('', 'https://example.com/master.m3u8');
			expect(variants).toHaveLength(0);
		});

		it('should handle playlist with only bandwidth (no resolution)', () => {
			const playlist = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=2000000
auto.m3u8
`;
			const variants = parseHLSMaster(playlist, 'https://example.com/master.m3u8');

			expect(variants).toHaveLength(1);
			expect(variants[0].bandwidth).toBe(2000000);
			expect(variants[0].resolution).toBeUndefined();
		});
	});

	describe('selectBestVariant', () => {
		it('should return null for empty array', () => {
			const result = selectBestVariant([]);
			expect(result).toBeNull();
		});

		it('should return the only variant for single-item array', () => {
			const variants: HLSVariant[] = [
				{
					url: 'https://example.com/720p.m3u8',
					bandwidth: 3000000,
					resolution: { width: 1280, height: 720 }
				}
			];
			const result = selectBestVariant(variants);
			expect(result).toEqual(variants[0]);
		});

		it('should select lowest bandwidth variant', () => {
			const variants: HLSVariant[] = [
				{
					url: 'https://example.com/480p.m3u8',
					bandwidth: 1500000,
					resolution: { width: 854, height: 480 }
				},
				{
					url: 'https://example.com/1080p.m3u8',
					bandwidth: 5000000,
					resolution: { width: 1920, height: 1080 }
				},
				{
					url: 'https://example.com/720p.m3u8',
					bandwidth: 3000000,
					resolution: { width: 1280, height: 720 }
				}
			];

			const result = selectBestVariant(variants);
			expect(result?.resolution?.height).toBe(480);
		});

		it('should prefer lower bandwidth when resolutions are equal', () => {
			const variants: HLSVariant[] = [
				{
					url: 'https://example.com/1080p-low.m3u8',
					bandwidth: 3000000,
					resolution: { width: 1920, height: 1080 }
				},
				{
					url: 'https://example.com/1080p-high.m3u8',
					bandwidth: 8000000,
					resolution: { width: 1920, height: 1080 }
				},
				{
					url: 'https://example.com/1080p-mid.m3u8',
					bandwidth: 5000000,
					resolution: { width: 1920, height: 1080 }
				}
			];

			const result = selectBestVariant(variants);
			expect(result?.bandwidth).toBe(3000000);
		});

		it('should handle variants without resolution (use lowest bandwidth)', () => {
			const variants: HLSVariant[] = [
				{ url: 'https://example.com/low.m3u8', bandwidth: 1000000 },
				{ url: 'https://example.com/high.m3u8', bandwidth: 5000000 },
				{ url: 'https://example.com/mid.m3u8', bandwidth: 3000000 }
			];

			const result = selectBestVariant(variants);
			expect(result?.bandwidth).toBe(1000000);
		});

		it('should prefer lower bandwidth over resolution when different', () => {
			const variants: HLSVariant[] = [
				// High bandwidth but low resolution
				{
					url: 'https://example.com/720p.m3u8',
					bandwidth: 8000000,
					resolution: { width: 1280, height: 720 }
				},
				// Lower bandwidth but higher resolution
				{
					url: 'https://example.com/1080p.m3u8',
					bandwidth: 4000000,
					resolution: { width: 1920, height: 1080 }
				}
			];

			const result = selectBestVariant(variants);
			expect(result?.resolution?.height).toBe(1080);
			expect(result?.bandwidth).toBe(4000000);
		});
	});

	describe('validatePlaylist', () => {
		it('should validate a valid master playlist', () => {
			const result = validatePlaylist(SAMPLE_MASTER_PLAYLIST);
			expect(result.valid).toBe(true);
			expect(result.type).toBe('master');
			expect(result.errors).toHaveLength(0);
		});

		it('should validate a valid media playlist', () => {
			const result = validatePlaylist(SAMPLE_MEDIA_PLAYLIST);
			expect(result.valid).toBe(true);
			expect(result.type).toBe('media');
			expect(result.errors).toHaveLength(0);
		});

		it('should reject empty content', () => {
			const result = validatePlaylist('');
			expect(result.valid).toBe(false);
			expect(result.errors).toContain('Empty content');
		});

		it('should reject content without #EXTM3U header', () => {
			const result = validatePlaylist('This is not HLS content');
			expect(result.valid).toBe(false);
			expect(result.errors).toContain('Missing #EXTM3U header');
		});

		it('should reject playlist with no recognizable tags', () => {
			const result = validatePlaylist('#EXTM3U\n#EXT-X-VERSION:3\n');
			expect(result.valid).toBe(false);
			expect(result.errors).toContain('Playlist has no recognizable HLS tags');
		});

		it('should warn about missing ENDLIST in media playlist', () => {
			const playlistWithoutEndlist = `#EXTM3U
#EXTINF:10.0,
segment0.ts
`;
			const result = validatePlaylist(playlistWithoutEndlist);
			expect(result.valid).toBe(true);
			expect(result.warnings.some((w) => w.includes('ENDLIST'))).toBe(true);
		});
	});

	describe('sanitizePlaylist', () => {
		it('should remove garbage before #EXTM3U', () => {
			const corrupted = 'garbage content here\n#EXTM3U\n#EXTINF:10.0,\nsegment.ts\n#EXT-X-ENDLIST';
			const sanitized = sanitizePlaylist(corrupted);
			expect(sanitized.startsWith('#EXTM3U')).toBe(true);
		});

		it('should remove content after #EXT-X-ENDLIST', () => {
			const corrupted = '#EXTM3U\n#EXTINF:10.0,\nsegment.ts\n#EXT-X-ENDLIST\ngarbage\nmore garbage';
			const sanitized = sanitizePlaylist(corrupted);
			expect(sanitized.includes('garbage')).toBe(false);
			expect(sanitized.endsWith('#EXT-X-ENDLIST')).toBe(true);
		});

		it('should preserve valid HLS content', () => {
			const valid = SAMPLE_MEDIA_PLAYLIST;
			const sanitized = sanitizePlaylist(valid);
			// Should be essentially the same (minus any trailing newlines)
			expect(sanitized.includes('#EXTM3U')).toBe(true);
			expect(sanitized.includes('#EXTINF:')).toBe(true);
			expect(sanitized.includes('segment0.ts')).toBe(true);
		});

		it('should return content as-is if no #EXTM3U found', () => {
			const notHLS = 'This is not HLS content';
			const result = sanitizePlaylist(notHLS);
			expect(result).toBe(notHLS);
		});
	});

	describe('isHLSPlaylist', () => {
		it('should return true for valid HLS content', () => {
			expect(isHLSPlaylist(SAMPLE_MASTER_PLAYLIST)).toBe(true);
			expect(isHLSPlaylist(SAMPLE_MEDIA_PLAYLIST)).toBe(true);
		});

		it('should return true even with leading whitespace', () => {
			expect(isHLSPlaylist('  \n#EXTM3U\n')).toBe(true);
		});

		it('should return false for non-HLS content', () => {
			expect(isHLSPlaylist('This is not HLS')).toBe(false);
			expect(isHLSPlaylist('<html>')).toBe(false);
		});

		it('should return false for empty/null content', () => {
			expect(isHLSPlaylist('')).toBe(false);
			expect(isHLSPlaylist(null as unknown as string)).toBe(false);
		});
	});
});
