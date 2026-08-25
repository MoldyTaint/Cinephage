import { describe, expect, it } from 'vitest';

import { getLibraryStatefulPath, getSafeLibraryReturnTo } from './routing';

describe('library return-state routing', () => {
	it('preserves all movie library query parameters when opening a detail page', () => {
		const result = getLibraryStatefulPath(
			'/library/movie/movie-id',
			'/library/movies',
			'?library=anime&monitored=monitored&fileStatus=missingFile&resolution=2160p&sort=added-desc&q=alien'
		);

		const url = new URL(result, 'http://cinephage.local');
		expect(url.pathname).toBe('/library/movie/movie-id');
		expect(url.searchParams.get('returnTo')).toBe(
			'/library/movies?library=anime&monitored=monitored&fileStatus=missingFile&resolution=2160p&sort=added-desc&q=alien'
		);
	});

	it('preserves all TV library query parameters when opening a detail page', () => {
		const result = getLibraryStatefulPath(
			'/library/tv/series-id',
			'/library/tv',
			'?library=anime&status=continuing&progress=missing&qualityProfile=balanced&videoCodec=hevc&q=trek'
		);

		const url = new URL(result, 'http://cinephage.local');
		expect(url.pathname).toBe('/library/tv/series-id');
		expect(url.searchParams.get('returnTo')).toBe(
			'/library/tv?library=anime&status=continuing&progress=missing&qualityProfile=balanced&videoCodec=hevc&q=trek'
		);
	});

	it('restores the exact movie list URL from a detail page', () => {
		const returnTo = encodeURIComponent(
			'/library/movies?monitored=unmonitored&hdrFormat=dolby-vision&sort=year-desc&q=matrix'
		);

		expect(
			getLibraryStatefulPath('/library/movies', '/library/movie/movie-id', `?returnTo=${returnTo}`)
		).toBe('/library/movies?monitored=unmonitored&hdrFormat=dolby-vision&sort=year-desc&q=matrix');
	});

	it('restores the exact TV list URL from a detail page', () => {
		const returnTo = encodeURIComponent(
			'/library/tv?status=ended&resolution=1080p&sort=size-desc&q=voyager'
		);

		expect(
			getLibraryStatefulPath('/library/tv', '/library/tv/series-id', `?returnTo=${returnTo}`)
		).toBe('/library/tv?status=ended&resolution=1080p&sort=size-desc&q=voyager');
	});

	it('does not use a movie return path for a TV detail page', () => {
		const returnTo = encodeURIComponent('/library/movies?fileStatus=missingFile');

		expect(
			getLibraryStatefulPath('/library/tv', '/library/tv/series-id', `?returnTo=${returnTo}`)
		).toBe('/library/tv');
	});

	it('rejects external and protocol-relative return paths', () => {
		expect(
			getSafeLibraryReturnTo('https://example.com/library/movies', '/library/movies')
		).toBeNull();
		expect(getSafeLibraryReturnTo('//example.com/library/movies', '/library/movies')).toBeNull();
	});

	it('does not rewrite unrelated navigation', () => {
		expect(
			getLibraryStatefulPath('/settings/general', '/library/movies', '?resolution=2160p')
		).toBe('/settings/general');
	});
});
