import { describe, expect, it } from 'vitest';
import type { PlaybackSession, SessionResourceKind } from '../types';
import { rewriteDashManifest } from './dash-rewriter';

const BASE_URL = 'https://media.example.com';

function createSession(overrides: Partial<PlaybackSession> = {}): PlaybackSession {
	return {
		token: 'tok-123',
		mediaType: 'movie',
		tmdbId: 541134,
		provider: 'Vidlink',
		entryUrl: 'https://cdn.example.com/dash/abc123_0_0_1080_h265_884/index.mpd',
		sourceType: 'dash',
		requestHeaders: {},
		subtitles: [],
		createdAt: 0,
		expiresAt: Date.now() + 30 * 60 * 1000,
		lastAccessedAt: 0,
		attempts: [],
		resourceIdsByKey: {},
		resources: {},
		...overrides
	};
}

function rewrite(
	mpd: string,
	mpdUrl = 'https://cdn.example.com/dash/abc123_0_0_1080_h265_884/index.mpd'
): string {
	const registered: string[] = [];
	return rewriteDashManifest({
		mpd,
		mpdUrl,
		baseUrl: BASE_URL,
		session: createSession({ entryUrl: mpdUrl }),
		apiKey: 'api-key',
		registerResource: (url: string, kind: SessionResourceKind, extension: string) => {
			registered.push(`${kind}:${extension}:${url}`);
			return `res-${registered.length}`;
		}
	});
}

describe('rewriteDashManifest', () => {
	it('rewrites a SegmentTemplate media with $Number$ through the dash catch-all, preserving the template', () => {
		const mpd = `<MPD>
  <Period>
    <AdaptationSet>
      <SegmentTemplate media="seg-$Number$.m4s" initialization="init.mp4" />
      <Representation id="r1" mimeType="video/mp4" />
    </AdaptationSet>
  </Period>
</MPD>`;

		const out = rewrite(mpd);
		expect(out).toContain(`/api/streaming/session/tok-123/dash/seg-$Number$.m4s?api_key=api-key`);
		expect(out).toContain(`/api/streaming/session/tok-123/dash/init.mp4?api_key=api-key`);
		expect(out).toContain('media="');
		expect(out).toContain('initialization="');
	});

	it('rewrites SegmentURL media entries in a SegmentList', () => {
		const mpd = `<MPD>
  <Period>
    <AdaptationSet>
      <SegmentList>
        <SegmentURL media="init.mp4" />
        <SegmentURL media="seg-0.m4s" />
        <SegmentURL media="seg-1.m4s" />
      </SegmentList>
    </AdaptationSet>
  </Period>
</MPD>`;

		const out = rewrite(mpd);
		expect(out).toContain('/api/streaming/session/tok-123/dash/init.mp4?api_key=api-key');
		expect(out).toContain('/api/streaming/session/tok-123/dash/seg-0.m4s?api_key=api-key');
		expect(out).toContain('/api/streaming/session/tok-123/dash/seg-1.m4s?api_key=api-key');
	});

	it('rewrites a relative <BaseURL> element', () => {
		const mpd = `<MPD>
  <BaseURL>videos/</BaseURL>
  <Period>
    <AdaptationSet>
      <SegmentTemplate media="seg-$Number$.m4s" />
    </AdaptationSet>
  </Period>
</MPD>`;

		const out = rewrite(mpd);
		expect(out).toContain(
			'<BaseURL>https://media.example.com/api/streaming/session/tok-123/dash/videos/?api_key=api-key</BaseURL>'
		);
	});

	it('rewrites an absolute same-origin BaseURL under the MPD directory', () => {
		const mpd = `<MPD>
  <BaseURL>https://cdn.example.com/dash/abc123_0_0_1080_h265_884/</BaseURL>
  <Period><AdaptationSet><SegmentTemplate media="seg-$Number$.m4s" /></AdaptationSet></Period>
</MPD>`;

		const out = rewrite(mpd);
		expect(out).toContain(
			'<BaseURL>https://media.example.com/api/streaming/session/tok-123/dash/?api_key=api-key</BaseURL>'
		);
	});

	it('registers cross-origin URLs as session resources', () => {
		const mpd = `<MPD>
  <Period>
    <AdaptationSet>
      <SegmentTemplate media="https://other.cdn.example.com/seg-$Number$.m4s" />
    </AdaptationSet>
  </Period>
</MPD>`;

		const out = rewrite(mpd);
		expect(out).toContain(
			'/api/streaming/session/tok-123/segment/res-1.m4s?api_key=api-key&dash_Number=$Number$'
		);
		expect(out).not.toContain('other.cdn.example.com');
	});

	it('preserves query parameters on same-origin segment URLs', () => {
		const mpd = `<MPD><Period><SegmentList><SegmentURL media="seg-0.m4s?token=signed" /></SegmentList></Period></MPD>`;

		const out = rewrite(mpd);

		expect(out).toContain('/dash/seg-0.m4s?token=signed&api_key=api-key');
	});

	it('leaves non-URL values untouched', () => {
		const mpd = `<MPD>
  <Period>
    <AdaptationSet>
      <SegmentTemplate media="seg-$Number$.m4s" />
    </AdaptationSet>
  </Period>
  <BaseURL>data:application/octet-stream;base64,AAAA</BaseURL>
</MPD>`;

		const out = rewrite(mpd);
		expect(out).toContain('data:application/octet-stream;base64,AAAA');
	});
});
