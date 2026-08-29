import { describe, expect, it } from 'vitest';

import {
	getLibraryDetailBackHref,
	getLibraryDetailWithReturnTo,
	getLibraryNavigationContext,
	getSafeLibraryReturnTo
} from './libraryReturnNavigation';

/**
 * Faithful simulation of SvelteKit's server-side resolve() during SSR
 * (kit.paths.relative defaults to true, empty base — @sveltejs/kit 2.70.2,
 * src/runtime/app/paths/server.js): absolute paths are returned relative to
 * the page being rendered, and non-absolute input throws.
 */
function ssrResolve(path: string, currentPathname: string): string {
	if (!path.startsWith('/')) {
		throw new Error(
			`Cannot use \`resolve(...)\` with a non-absolute pathname or route ID (got "${path}").`
		);
	}
	const segments = currentPathname.split('/').slice(2);
	const prefix = segments.map(() => '..').join('/') || '.';
	return prefix + path;
}

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
			getSafeLibraryReturnTo(
				'/library/tv?status=ended&resolution=1080p&sort=size-desc&q=voyager',
				'/library/tv'
			)
		).toBe('/library/tv?status=ended&resolution=1080p&sort=size-desc&q=voyager');
	});

	it('does not use a movie return path for the TV list', () => {
		expect(
			getSafeLibraryReturnTo('/library/movies?fileStatus=missingFile', '/library/tv')
		).toBeNull();
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

describe('getLibraryDetailBackHref', () => {
	it('returns the validated filtered Movies list URL from the page URL', () => {
		const url = new URL(
			'/library/movie/movie-id?returnTo=%2Flibrary%2Fmovies%3Fmonitored%3Dunmonitored%26sort%3Dyear-desc%26q%3Dmatrix',
			'http://cinephage.local'
		);
		expect(getLibraryDetailBackHref(url, '/library/movies')).toBe(
			'/library/movies?monitored=unmonitored&sort=year-desc&q=matrix'
		);
	});

	it('returns the validated filtered TV list URL from the page URL', () => {
		const url = new URL(
			'/library/tv/series-id?returnTo=%2Flibrary%2Ftv%3Fstatus%3Dended%26q%3Dvoyager',
			'http://cinephage.local'
		);
		expect(getLibraryDetailBackHref(url, '/library/tv')).toBe('/library/tv?status=ended&q=voyager');
	});

	it('returns null for missing, external, and cross-section returnTo values', () => {
		expect(
			getLibraryDetailBackHref(
				new URL('/library/movie/movie-id', 'http://cinephage.local'),
				'/library/movies'
			)
		).toBeNull();
		expect(
			getLibraryDetailBackHref(
				new URL(
					'/library/movie/movie-id?returnTo=https%3A%2F%2Fevil.example.com%2Flibrary%2Fmovies',
					'http://cinephage.local'
				),
				'/library/movies'
			)
		).toBeNull();
		expect(
			getLibraryDetailBackHref(
				new URL(
					'/library/movie/movie-id?returnTo=%2Flibrary%2Ftv%3Fstatus%3Dended',
					'http://cinephage.local'
				),
				'/library/movies'
			)
		).toBeNull();
	});

	it('returns an absolute path that survives the header single-resolve during SSR', () => {
		// What the header does: resolvePath(backHref) once, while rendering
		// /library/movie/movie-id server-side.
		const backHref = getLibraryDetailBackHref(
			new URL(
				'/library/movie/movie-id?returnTo=%2Flibrary%2Fmovies%3Fmonitored%3Dtrue',
				'http://cinephage.local'
			),
			'/library/movies'
		)!;
		expect(backHref.startsWith('/')).toBe(true);

		const href = ssrResolve(backHref, '/library/movie/movie-id');
		expect(href).toBe('../../library/movies?monitored=true');
	});

	it('double-resolving the back value throws during SSR (the PR #518 regression)', () => {
		// The pre-fix detail pages called resolvePath() on the validated value
		// before the header resolved it again. During SSR the first call
		// relativizes the path and the second throws — HTTP 500.
		const backHref = getLibraryDetailBackHref(
			new URL(
				'/library/tv/series-id?returnTo=%2Flibrary%2Ftv%3Fstatus%3Dended',
				'http://cinephage.local'
			),
			'/library/tv'
		)!;
		const preResolved = ssrResolve(backHref, '/library/tv/series-id');
		expect(() => ssrResolve(preResolved, '/library/tv/series-id')).toThrow(/non-absolute pathname/);
	});
});
