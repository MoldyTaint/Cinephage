import { describe, expect, it } from 'vitest';

import {
	getLibraryDetailWithReturnTo,
	getLibraryNavigationContext,
	getSafeLibraryReturnTo
} from './libraryReturnNavigation';

describe('library return navigation', () => {
	it('recognizes Movies and TV list/detail routes independently', () => {
		expect(getLibraryNavigationContext('/library/movies')).toEqual({
			section: 'movies',
			kind: 'list',
			listPath: '/library/movies'
		});
		expect(getLibraryNavigationContext('/library/movie/movie-id')).toEqual({
			section: 'movies',
			kind: 'detail',
			listPath: '/library/movies'
		});
		expect(getLibraryNavigationContext('/library/tv')).toEqual({
			section: 'tv',
			kind: 'list',
			listPath: '/library/tv'
		});
		expect(getLibraryNavigationContext('/library/tv/series-id')).toEqual({
			section: 'tv',
			kind: 'detail',
			listPath: '/library/tv'
		});
	});

	it('rewrites TV detail navigation with the exact filtered TV list URL', () => {
		const result = getLibraryDetailWithReturnTo(
			'/library/tv',
			'?library=anime&status=continuing&progress=missing&sort=year-desc&q=voyager',
			'/library/tv/series-id'
		);

		const url = new URL(result!, 'http://cinephage.local');
		expect(url.pathname).toBe('/library/tv/series-id');
		expect(url.searchParams.get('returnTo')).toBe(
			'/library/tv?library=anime&status=continuing&progress=missing&sort=year-desc&q=voyager'
		);
	});

	it('rewrites movie detail navigation with the exact filtered Movies list URL', () => {
		const result = getLibraryDetailWithReturnTo(
			'/library/movies',
			'?library=anime&fileStatus=missingFile&resolution=2160p&sort=added-desc&q=alien',
			'/library/movie/movie-id'
		);

		const url = new URL(result!, 'http://cinephage.local');
		expect(url.pathname).toBe('/library/movie/movie-id');
		expect(url.searchParams.get('returnTo')).toBe(
			'/library/movies?library=anime&fileStatus=missingFile&resolution=2160p&sort=added-desc&q=alien'
		);
	});

	it('does not cross Movies and TV navigation', () => {
		expect(
			getLibraryDetailWithReturnTo(
				'/library/movies',
				'?fileStatus=missingFile',
				'/library/tv/series-id'
			)
		).toBeNull();
	});

	it('rejects non-library and external targets', () => {
		expect(
			getLibraryDetailWithReturnTo('/library/tv', '?status=ended', '/settings/system/general')
		).toBeNull();
		expect(
			getLibraryDetailWithReturnTo(
				'/library/tv',
				'?status=ended',
				'https://example.com/library/tv/series-id'
			)
		).toBeNull();
	});
});

describe('getSafeLibraryReturnTo', () => {
	it('restores the exact filtered movie list URL', () => {
		expect(
			getSafeLibraryReturnTo(
				'/library/movies?monitored=unmonitored&hdrFormat=dolby-vision&sort=year-desc&q=matrix',
				'/library/movies'
			)
		).toBe('/library/movies?monitored=unmonitored&hdrFormat=dolby-vision&sort=year-desc&q=matrix');
	});

	it('restores the exact filtered TV list URL', () => {
		expect(
			getSafeLibraryReturnTo('/library/tv?status=ended&resolution=1080p&sort=size-desc&q=voyager', '/library/tv')
		).toBe('/library/tv?status=ended&resolution=1080p&sort=size-desc&q=voyager');
	});

	it('does not use a movie return path for the TV list', () => {
		expect(getSafeLibraryReturnTo('/library/movies?fileStatus=missingFile', '/library/tv')).toBeNull();
	});

	it('rejects external and protocol-relative return paths', () => {
		expect(
			getSafeLibraryReturnTo('https://example.com/library/movies', '/library/movies')
		).toBeNull();
		expect(getSafeLibraryReturnTo('//example.com/library/movies', '/library/movies')).toBeNull();
	});

	it('rejects missing and malformed values', () => {
		expect(getSafeLibraryReturnTo(null, '/library/movies')).toBeNull();
		expect(getSafeLibraryReturnTo('', '/library/movies')).toBeNull();
		expect(getSafeLibraryReturnTo('not-a-path', '/library/movies')).toBeNull();
	});
});
