export type LibrarySection = 'movies' | 'tv';

export interface LibraryNavigationContext {
	section: LibrarySection;
	kind: 'list' | 'detail';
	listPath: '/library/movies' | '/library/tv';
}

const MOVIES_LIST = '/library/movies' as const;
const TV_LIST = '/library/tv' as const;

export function getLibraryNavigationContext(pathname: string): LibraryNavigationContext | null {
	if (pathname === MOVIES_LIST) {
		return { section: 'movies', kind: 'list', listPath: MOVIES_LIST };
	}
	if (/^\/library\/movie\/[^/]+$/.test(pathname)) {
		return { section: 'movies', kind: 'detail', listPath: MOVIES_LIST };
	}
	if (pathname === TV_LIST) {
		return { section: 'tv', kind: 'list', listPath: TV_LIST };
	}
	if (/^\/library\/tv\/[^/]+$/.test(pathname)) {
		return { section: 'tv', kind: 'detail', listPath: TV_LIST };
	}
	return null;
}

/**
 * Build the canonical detail URL for a navigation originating from a library list.
 * The exact list pathname + query string is written into returnTo so the detail
 * page can restore every active filter, sort option, sub-library, and text search.
 */
export function getLibraryDetailWithReturnTo(
	fromPathname: string,
	fromSearch: string,
	target: string
): string | null {
	const from = getLibraryNavigationContext(fromPathname);
	if (!from || from.kind !== 'list') return null;

	try {
		const targetUrl = new URL(target, 'http://cinephage.local');
		if (targetUrl.origin !== 'http://cinephage.local') return null;

		const to = getLibraryNavigationContext(targetUrl.pathname);
		if (!to || to.kind !== 'detail' || to.section !== from.section) return null;

		const returnTo = `${fromPathname}${fromSearch}`;
		targetUrl.searchParams.set('returnTo', returnTo);
		return `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;
	} catch {
		return null;
	}
}

/**
 * Validate a return path before using it for navigation.
 *
 * Only the matching internal library list route is accepted. This keeps the
 * returnTo parameter useful for restoring filters/sort state without turning
 * it into an open redirect.
 */
export function getSafeLibraryReturnTo(
	value: string | null,
	expectedListPath: string
): string | null {
	if (!value || !value.startsWith('/') || value.startsWith('//')) return null;

	try {
		const url = new URL(value, 'http://cinephage.local');
		if (url.origin !== 'http://cinephage.local') return null;
		if (url.pathname !== expectedListPath) return null;
		return `${url.pathname}${url.search}${url.hash}`;
	} catch {
		return null;
	}
}

/**
 * Compute the detail-page back-link target from the current page URL.
 *
 * Returns the validated absolute list URL (or null when no valid returnTo is
 * present) WITHOUT passing it through resolvePath(). The header components
 * apply resolvePath() to their backHref exactly once, and during SSR — with
 * kit.paths.relative at its default — resolve() returns a ../..-prefixed
 * relative path. Pre-resolving here would feed that relative value back into
 * the header's resolve() call, which throws on non-absolute input and turns
 * the whole detail page into a 500 (PR #518 regression).
 */
export function getLibraryDetailBackHref(
	pageUrl: URL,
	expectedListPath: '/library/movies' | '/library/tv'
): string | null {
	return getSafeLibraryReturnTo(pageUrl.searchParams.get('returnTo'), expectedListPath);
}
