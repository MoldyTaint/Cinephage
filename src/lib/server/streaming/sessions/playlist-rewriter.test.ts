import { describe, expect, it } from 'vitest';
import type { PlaybackSession, SessionResourceKind } from '../types';
import { rewriteSessionPlaylist } from './playlist-rewriter';

function createMockSession(): PlaybackSession {
	return {
		token: 'test-token',
		mediaType: 'movie',
		tmdbId: 550,
		entryUrl: 'https://cdn.example.com/master.m3u8',
		sourceType: 'hls',
		requestHeaders: {},
		subtitles: [],
		createdAt: Date.now(),
		expiresAt: Date.now() + 30 * 60 * 1000,
		lastAccessedAt: Date.now(),
		attempts: [],
		resourceIdsByKey: {},
		resources: {}
	};
}

const registered: Array<{ url: string; kind: SessionResourceKind; extension: string }> = [];

function registerResource(url: string, kind: SessionResourceKind, extension: string): string {
	const id = `res-${registered.length}`;
	registered.push({ url, kind, extension });
	return id;
}

function rewrite(playlist: string, playlistUrl = 'https://cdn.example.com/master.m3u8'): string {
	registered.length = 0;
	return rewriteSessionPlaylist({
		playlist,
		playlistUrl,
		baseUrl: 'http://192.168.1.1:3000',
		session: createMockSession(),
		registerResource,
		injectSubtitles: false
	});
}

describe('rewriteSessionPlaylist', () => {
	it('rewrites basic master playlist with variant streams', () => {
		const playlist = [
			'#EXTM3U',
			'#EXT-X-VERSION:6',
			'#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=640x360',
			'https://cdn.example.com/360p.m3u8',
			'#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080',
			'https://cdn.example.com/1080p.m3u8'
		].join('\n');

		const result = rewrite(playlist);

		expect(result).toContain('/playlist/res-0.m3u8');
		expect(result).toContain('/playlist/res-1.m3u8');
		expect(result).not.toContain('cdn.example.com');
		expect(registered[0]).toEqual({
			url: 'https://cdn.example.com/360p.m3u8',
			kind: 'playlist',
			extension: 'm3u8'
		});
		expect(registered[1]).toEqual({
			url: 'https://cdn.example.com/1080p.m3u8',
			kind: 'playlist',
			extension: 'm3u8'
		});
	});

	it('rewrites media playlist with EXTINF and .ts segments', () => {
		const playlist = [
			'#EXTM3U',
			'#EXT-X-VERSION:3',
			'#EXT-X-TARGETDURATION:10',
			'#EXTINF:10.0,',
			'https://cdn.example.com/seg0.ts',
			'#EXTINF:10.0,',
			'https://cdn.example.com/seg1.ts'
		].join('\n');

		const result = rewrite(playlist, 'https://cdn.example.com/stream.m3u8');

		expect(result).toContain('/segment/res-0.ts');
		expect(result).toContain('/segment/res-1.ts');
		expect(registered[0].kind).toBe('segment');
		expect(registered[1].kind).toBe('segment');
	});

	it('rewrites #EXT-X-KEY: URI as asset (binary encryption key)', () => {
		const playlist = [
			'#EXTM3U',
			'#EXT-X-VERSION:3',
			'#EXT-X-TARGETDURATION:10',
			'#EXT-X-KEY:METHOD=AES-128,URI="https://cdn.example.com/key.bin"',
			'#EXTINF:10.0,',
			'https://cdn.example.com/seg0.ts'
		].join('\n');

		const result = rewrite(playlist, 'https://cdn.example.com/stream.m3u8');

		expect(result).toContain('/asset/res-0');
		expect(registered[0].kind).toBe('asset');
		expect(registered[0].url).toBe('https://cdn.example.com/key.bin');
	});

	it('rewrites #EXT-X-I-FRAME-STREAM-INF: URI as playlist', () => {
		const playlist = [
			'#EXTM3U',
			'#EXT-X-VERSION:6',
			'#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=800000,URI="https://cdn.example.com/iframes.m3u8"'
		].join('\n');

		const result = rewrite(playlist);

		expect(result).toContain('/playlist/res-0.m3u8');
		expect(registered[0].kind).toBe('playlist');
	});

	describe('#EXT-X-MAP: (fMP4 init segment)', () => {
		it('classifies #EXT-X-MAP as segment with proper extension', () => {
			const playlist = [
				'#EXTM3U',
				'#EXT-X-VERSION:7',
				'#EXT-X-TARGETDURATION:6',
				'#EXT-X-MAP:URI="https://cdn.example.com/init.mp4"',
				'#EXTINF:6.0,',
				'https://cdn.example.com/seg0.m4s'
			].join('\n');

			const result = rewrite(playlist, 'https://cdn.example.com/stream.m3u8');

			expect(result).toContain('/segment/res-0.mp4');
			expect(registered[0].kind).toBe('segment');
			expect(registered[0].extension).toBe('mp4');
			expect(registered[0].url).toBe('https://cdn.example.com/init.mp4');
		});

		it('handles #EXT-X-MAP with .m4s extension', () => {
			const playlist = [
				'#EXTM3U',
				'#EXT-X-VERSION:7',
				'#EXT-X-MAP:URI="https://cdn.example.com/init.m4s"',
				'#EXTINF:6.0,',
				'https://cdn.example.com/seg0.m4s'
			].join('\n');

			const result = rewrite(playlist, 'https://cdn.example.com/stream.m3u8');

			expect(result).toContain('/segment/res-0.m4s');
			expect(registered[0].kind).toBe('segment');
			expect(registered[0].extension).toBe('m4s');
		});

		it('handles #EXT-X-MAP with extensionless URL (CDN-style)', () => {
			const playlist = [
				'#EXTM3U',
				'#EXT-X-VERSION:7',
				'#EXT-X-MAP:URI="https://cdn.example.com/?v=abc123&safe="',
				'#EXTINF:6.0,',
				'https://cdn.example.com/?v=def456&safe='
			].join('\n');

			const result = rewrite(playlist, 'https://cdn.example.com/stream.m3u8');

			expect(registered[0].kind).toBe('segment');
			expect(result).toMatch(/\/segment\/res-0\.\w+/);
		});
	});

	describe('#EXT-X-MEDIA: (audio/subtitle renditions)', () => {
		it('classifies #EXT-X-MEDIA: URI as playlist', () => {
			const playlist = [
				'#EXTM3U',
				'#EXT-X-VERSION:7',
				'#EXT-X-INDEPENDENT-SEGMENTS',
				'',
				'#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio_aac",NAME="ENG",DEFAULT=YES,URI="https://cdn.example.com/audio.m3u8"',
				'#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1920x1080,AUDIO="audio_aac"',
				'https://cdn.example.com/video.m3u8'
			].join('\n');

			const result = rewrite(playlist);

			expect(result).toContain('/playlist/res-0.m3u8');
			expect(registered[0].kind).toBe('playlist');
			expect(registered[0].extension).toBe('m3u8');
			expect(registered[0].url).toBe('https://cdn.example.com/audio.m3u8');
		});

		it('handles #EXT-X-MEDIA with extensionless CDN URL', () => {
			const playlist = [
				'#EXTM3U',
				'#EXT-X-VERSION:7',
				'#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",DEFAULT=YES,URI="https://cdn.example.com/audio_track?format=m3u8"',
				'#EXT-X-STREAM-INF:BANDWIDTH=5000000,AUDIO="audio"',
				'https://cdn.example.com/video.m3u8'
			].join('\n');

			const result = rewrite(playlist);

			expect(registered[0].kind).toBe('playlist');
			expect(result).toContain('/playlist/res-0.m3u8');
		});

		it('handles #EXT-X-MEDIA without URI attribute (group-level)', () => {
			const playlist = [
				'#EXTM3U',
				'#EXT-X-VERSION:7',
				'#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",DEFAULT=YES,AUTOSELECT=YES',
				'#EXT-X-STREAM-INF:BANDWIDTH=3000000,AUDIO="audio"',
				'https://cdn.example.com/video.m3u8'
			].join('\n');

			const result = rewrite(playlist);

			expect(result).not.toContain('/asset/');
			expect(result).toContain('/playlist/res-0.m3u8');
			expect(registered.length).toBe(1);
			expect(registered[0].kind).toBe('playlist');
		});
	});

	describe('#EXT-X-BITRATE between EXTINF and segment URL', () => {
		it('preserves EXTINF context through #EXT-X-BITRATE tag', () => {
			const playlist = [
				'#EXTM3U',
				'#EXT-X-VERSION:7',
				'#EXT-X-TARGETDURATION:10',
				'#EXT-X-MAP:URI="https://cdn.example.com/init.mp4"',
				'#EXTINF:10.41667,',
				'#EXT-X-BITRATE:2016',
				'https://cdn.example.com/seg0.m4s',
				'#EXTINF:10.41667,',
				'#EXT-X-BITRATE:2455',
				'https://cdn.example.com/seg1.m4s'
			].join('\n');

			const result = rewrite(playlist, 'https://cdn.example.com/stream.m3u8');

			expect(registered[0].kind).toBe('segment');
			expect(registered[1].kind).toBe('segment');
			expect(registered[2].kind).toBe('segment');
			expect(result).toContain('/segment/res-1.m4s');
			expect(result).toContain('/segment/res-2.m4s');
		});

		it('preserves EXTINF context through #EXT-X-BITRATE with extensionless CDN URLs', () => {
			const playlist = [
				'#EXTM3U',
				'#EXT-X-VERSION:7',
				'#EXT-X-TARGETDURATION:6',
				'#EXT-X-MAP:URI="https://cdn.example.com/?v=init&safe="',
				'#EXTINF:6.48533,',
				'#EXT-X-BITRATE:109',
				'https://cdn.example.com/?v=seg0&safe='
			].join('\n');

			const result = rewrite(playlist, 'https://cdn.example.com/stream.m3u8');

			expect(registered[0].kind).toBe('segment');
			expect(registered[1].kind).toBe('segment');
			expect(result).toMatch(/\/segment\/res-1\.\w+/);
		});

		it('preserves EXTINF context through multiple comment/extension lines', () => {
			const playlist = [
				'#EXTM3U',
				'#EXT-X-VERSION:7',
				'#EXT-X-TARGETDURATION:10',
				'#EXTINF:10.0,',
				'#EXT-X-BITRATE:2000',
				'#EXT-X-PROGRAM-DATE-TIME:2024-01-01T00:00:00.000Z',
				'https://cdn.example.com/seg0.ts'
			].join('\n');

			const result = rewrite(playlist, 'https://cdn.example.com/stream.m3u8');

			expect(registered[0].kind).toBe('segment');
			expect(result).toContain('/segment/res-0.ts');
		});

		it('preserves STREAM-INF context through comment lines', () => {
			const playlist = [
				'#EXTM3U',
				'#EXT-X-VERSION:7',
				'#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1920x1080',
				'# 1080p',
				'https://cdn.example.com/1080p.m3u8'
			].join('\n');

			const result = rewrite(playlist);

			expect(registered[0].kind).toBe('playlist');
			expect(result).toContain('/playlist/res-0.m3u8');
		});
	});

	describe('full fMP4 HLS with audio renditions (real-world scenario)', () => {
		it('correctly rewrites a full master + audio rendition master playlist', () => {
			const playlist = [
				'#EXTM3U',
				'#EXT-X-VERSION:7',
				'#EXT-X-INDEPENDENT-SEGMENTS',
				'',
				'# Audio track1',
				'#EXT-X-MEDIA:TYPE=AUDIO,LANGUAGE="en",GROUP-ID="audio_aac",NAME="ENG",DEFAULT=YES,AUTOSELECT=YES,CHANNELS="2",URI="https://cdn.example.com/audio_eng.m3u8"',
				'',
				'# 1080p',
				'#EXT-X-STREAM-INF:BANDWIDTH=3199143,AVERAGE-BANDWIDTH=3199143,RESOLUTION=1920x1080,CODECS="avc1.4d4028,mp4a.40.2",FRAME-RATE=24.000,VIDEO-RANGE=SDR,AUDIO="audio_aac",CLOSED-CAPTIONS=NONE',
				'https://cdn.example.com/1080p.m3u8',
				'# 720p',
				'#EXT-X-STREAM-INF:BANDWIDTH=1653861,AVERAGE-BANDWIDTH=1653861,RESOLUTION=1280x720,CODECS="avc1.4d401f,mp4a.40.2",FRAME-RATE=24.000,VIDEO-RANGE=SDR,AUDIO="audio_aac",CLOSED-CAPTIONS=NONE',
				'https://cdn.example.com/720p.m3u8'
			].join('\n');

			const result = rewrite(playlist);

			expect(registered[0].kind).toBe('playlist');
			expect(registered[0].url).toBe('https://cdn.example.com/audio_eng.m3u8');
			expect(result).toContain('/playlist/res-0.m3u8');

			expect(registered[1].kind).toBe('playlist');
			expect(registered[1].url).toBe('https://cdn.example.com/1080p.m3u8');
			expect(result).toContain('/playlist/res-1.m3u8');

			expect(registered[2].kind).toBe('playlist');
			expect(registered[2].url).toBe('https://cdn.example.com/720p.m3u8');
			expect(result).toContain('/playlist/res-2.m3u8');

			expect(result).not.toContain('/asset/');
		});

		it('correctly rewrites a media playlist with MAP, EXTINF, BITRATE, and fMP4 segments', () => {
			const playlist = [
				'#EXTM3U',
				'#EXT-X-TARGETDURATION:10',
				'#EXT-X-VERSION:7',
				'#EXT-X-MEDIA-SEQUENCE:0',
				'#EXT-X-PLAYLIST-TYPE:VOD',
				'#EXT-X-INDEPENDENT-SEGMENTS',
				'#EXT-X-MAP:URI="https://cdn.example.com/init.mp4"',
				'#EXTINF:10.41667,',
				'#EXT-X-BITRATE:2016',
				'https://cdn.example.com/seg0.m4s',
				'#EXTINF:10.41667,',
				'#EXT-X-BITRATE:2455',
				'https://cdn.example.com/seg1.m4s',
				'#EXT-X-ENDLIST'
			].join('\n');

			const result = rewrite(playlist, 'https://cdn.example.com/stream.m3u8');

			expect(registered[0].kind).toBe('segment');
			expect(registered[0].url).toBe('https://cdn.example.com/init.mp4');
			expect(result).toContain('/segment/res-0.mp4');

			expect(registered[1].kind).toBe('segment');
			expect(registered[1].url).toBe('https://cdn.example.com/seg0.m4s');
			expect(result).toContain('/segment/res-1.m4s');

			expect(registered[2].kind).toBe('segment');
			expect(registered[2].url).toBe('https://cdn.example.com/seg1.m4s');
			expect(result).toContain('/segment/res-2.m4s');

			expect(result).not.toContain('/asset/');
		});
	});

	describe('MPEG-TS streams (existing working providers)', () => {
		it('correctly rewrites simple MPEG-TS media playlist without MAP or MEDIA', () => {
			const playlist = [
				'#EXTM3U',
				'#EXT-X-VERSION:3',
				'#EXT-X-TARGETDURATION:10',
				'#EXT-X-MEDIA-SEQUENCE:0',
				'#EXTINF:10.0,',
				'https://cdn.example.com/segment0.ts',
				'#EXTINF:10.0,',
				'https://cdn.example.com/segment1.ts',
				'#EXTINF:10.0,',
				'https://cdn.example.com/segment2.ts',
				'#EXT-X-ENDLIST'
			].join('\n');

			const result = rewrite(playlist, 'https://cdn.example.com/stream.m3u8');

			expect(registered.length).toBe(3);
			for (const reg of registered) {
				expect(reg.kind).toBe('segment');
				expect(reg.extension).toBe('ts');
			}
			expect(result).toContain('/segment/res-0.ts');
			expect(result).toContain('/segment/res-1.ts');
			expect(result).toContain('/segment/res-2.ts');
			expect(result).not.toContain('/asset/');
		});

		it('correctly rewrites master playlist with only STREAM-INF (no audio renditions)', () => {
			const playlist = [
				'#EXTM3U',
				'#EXT-X-VERSION:3',
				'#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360',
				'https://cdn.example.com/360p.m3u8',
				'#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720',
				'https://cdn.example.com/720p.m3u8'
			].join('\n');

			const result = rewrite(playlist);

			expect(registered.length).toBe(2);
			expect(registered[0].kind).toBe('playlist');
			expect(registered[1].kind).toBe('playlist');
			expect(result).not.toContain('/asset/');
		});
	});
});
