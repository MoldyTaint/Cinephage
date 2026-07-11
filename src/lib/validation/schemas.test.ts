import { describe, expect, it } from 'vitest';

import { grabRequestSchema, logDownloadQuerySchema } from './schemas.js';

describe('logDownloadQuerySchema', () => {
	it('accepts export requests up to the supported 5000 row cap', () => {
		const result = logDownloadQuerySchema.safeParse({
			limit: '5000',
			format: 'jsonl',
			levels: 'debug,info,warn,error'
		});

		expect(result.success).toBe(true);
		if (!result.success) {
			return;
		}

		expect(result.data.limit).toBe(5000);
		expect(result.data.levels).toEqual(['debug', 'info', 'warn', 'error']);
		expect(result.data.format).toBe('jsonl');
	});

	it('rejects export requests above the supported 5000 row cap', () => {
		const result = logDownloadQuerySchema.safeParse({
			limit: '5001',
			format: 'jsonl'
		});

		expect(result.success).toBe(false);
	});
});

describe('grabRequestSchema', () => {
	const validMovieGrab = {
		title: 'Lone Survivor (2013) 1080p bluray x264',
		mediaType: 'movie' as const,
		downloadUrl: 'https://example.test/torrent/abc',
		movieId: 'movie-1',
		protocol: 'torrent' as const
	};

	it('accepts a valid movie grab', () => {
		const result = grabRequestSchema.safeParse(validMovieGrab);
		expect(result.success).toBe(true);
	});

	it('accepts a valid TV grab targeting a series', () => {
		const result = grabRequestSchema.safeParse({
			title: 'Futurama S06E17 1080p WEB-DL',
			mediaType: 'tv',
			magnetUrl: 'magnet:?xt=urn:btih:deadbeef',
			seriesId: 'series-1',
			seasonNumber: 6
		});
		expect(result.success).toBe(true);
	});

	it('ignores a legacy client "quality" object with null fields (e.g. SDR hdr: null)', () => {
		// Regression: SDR releases parse hdr as null. The unused quality field must never
		// break a grab again — it is stripped rather than validated.
		const result = grabRequestSchema.safeParse({
			...validMovieGrab,
			quality: { resolution: '1080p', source: 'bluray', codec: 'h264', hdr: null }
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).not.toHaveProperty('quality');
		}
	});

	it('requires a download source (downloadUrl or magnetUrl)', () => {
		const { downloadUrl: _downloadUrl, ...noSource } = validMovieGrab;
		const result = grabRequestSchema.safeParse(noSource);
		expect(result.success).toBe(false);
	});

	it('requires a media target (movieId or seriesId)', () => {
		const { movieId: _movieId, ...noTarget } = validMovieGrab;
		const result = grabRequestSchema.safeParse(noTarget);
		expect(result.success).toBe(false);
	});
});
