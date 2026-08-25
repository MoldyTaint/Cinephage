import { describe, expect, it } from 'vitest';

import {
	getLibraryDetailWithReturnTo,
	getLibraryNavigationContext
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
