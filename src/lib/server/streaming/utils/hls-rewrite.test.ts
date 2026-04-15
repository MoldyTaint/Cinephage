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
});
