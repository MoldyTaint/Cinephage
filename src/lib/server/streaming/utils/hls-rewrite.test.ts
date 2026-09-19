import { describe, expect, it } from 'vitest';

import { resolveHlsUrl, rewriteHlsPlaylistUrls } from './hls-rewrite.js';

describe('resolveHlsUrl', () => {
	it('preserves base query tokens for root-relative urls', () => {
		const base = new URL('https://cdn.example.com/path/playlist.m3u8?token=abc123');

		expect(resolveHlsUrl('/segment.ts', base, '/path/')).toBe(
			'https://cdn.example.com/segment.ts?token=abc123'
		);
	});

	it('does not overwrite explicit query params on root-relative urls', () => {
		const base = new URL('https://cdn.example.com/path/playlist.m3u8?token=abc123');

		expect(resolveHlsUrl('/segment.ts?alt=1', base, '/path/')).toBe(
			'https://cdn.example.com/segment.ts?alt=1'
		);
	});

	it('resolves parent-relative URLs against the playlist URL', () => {
		const base = new URL('https://cdn.example.com/live/variants/playlist.m3u8?token=abc123');

		expect(resolveHlsUrl('../segment.ts', base, '/live/variants/')).toBe(
			'https://cdn.example.com/live/segment.ts?token=abc123'
		);
	});
});

describe('rewriteHlsPlaylistUrls', () => {
	it('preserves base query tokens when rewriting root-relative segment urls', () => {
		const playlist = '#EXTM3U\n#EXTINF:3,\n/segment.ts\n';

		const rewritten = rewriteHlsPlaylistUrls(
			playlist,
			'https://cdn.example.com/path/playlist.m3u8?token=abc123',
			(absoluteUrl) => absoluteUrl
		);

		expect(rewritten).toContain('https://cdn.example.com/segment.ts?token=abc123');
	});

	it('rewrites LL-HLS URI attributes', () => {
		const playlist = [
			'#EXTM3U',
			'#EXT-X-PART:DURATION=0.333,URI="parts/part0.m4s"',
			'#EXT-X-PRELOAD-HINT:TYPE=PART,URI="parts/part1.m4s"'
		].join('\n');

		const rewritten = rewriteHlsPlaylistUrls(
			playlist,
			'https://cdn.example.com/live/index.m3u8',
			(absoluteUrl, isSegment) => `${isSegment ? 'segment:' : 'playlist:'}${absoluteUrl}`
		);

		expect(rewritten).toContain('segment:https://cdn.example.com/live/parts/part0.m4s');
		expect(rewritten).toContain('segment:https://cdn.example.com/live/parts/part1.m4s');
	});
});
