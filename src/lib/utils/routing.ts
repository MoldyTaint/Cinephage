/**
 * Routing Utilities
 *
 * Helper functions for SvelteKit routing with dynamic paths.
 */

import { browser } from '$app/environment';
import { base, resolve } from '$app/paths';

const LIBRARY_MOVIES_PATH = '/library/movies';
const LIBRARY_TV_PATH = '/library/tv';
const RETURN_TO_PARAM = 'returnTo';

function stripBase(pathname: string): string {
	if (!base) return pathname;
	if (pathname === base) return '/';
	return pathname.startsWith(`${base}/`) ? pathname.slice(base.length) : pathname;
}

function expectedLibraryListPath(pathname: string): string | null {
	if (/^\/library\/movie\/[^/]+$/.test(pathname)) return LIBRARY_MOVIES_PATH;
	if (/^\/library\/tv\/[^/]+$/.test(pathname)) return LIBRARY_TV_PATH;
	return null;
}

function isLibraryListPath(pathname: string): boolean {
	return pathname === LIBRARY_MOVIES_PATH || pathname === LIBRARY_TV_PATH;
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
 * Apply library list/detail return-state handling to a route before resolving it.
 *
 * This function is intentionally browser-independent so the behavior can be
 * regression tested without relying on window/navigation globals.
 */
export function getLibraryStatefulPath(
	path: string,
	currentPath: string,
	currentSearch = ''
): string {
	try {
		const requested = new URL(path, 'http://cinephage.local');
		const detailListPath = expectedLibraryListPath(requested.pathname);

		// List -> detail: carry the complete URL-backed view state forward.
		if (
			detailListPath &&
			currentPath === detailListPath &&
			!requested.searchParams.has(RETURN_TO_PARAM)
		) {
			requested.searchParams.set(RETURN_TO_PARAM, `${currentPath}${currentSearch}`);
			return `${requested.pathname}${requested.search}${requested.hash}`;
		}

		// Detail -> list: restore the exact filtered/sorted list URL when valid.
		if (isLibraryListPath(requested.pathname)) {
			const currentDetailListPath = expectedLibraryListPath(currentPath);
			if (currentDetailListPath === requested.pathname) {
				const currentParams = new URLSearchParams(currentSearch);
				const returnTo = getSafeLibraryReturnTo(
					currentParams.get(RETURN_TO_PARAM),
					requested.pathname
				);
				if (returnTo) return returnTo;
			}
		}
	} catch {
		// Keep the existing routing behavior for malformed or unexpected paths.
	}

	return path;
}

/**
 * Preserve URL-backed library view state when navigating to a media detail page.
 *
 * Movies/TV filters, sort order, and selected sub-library already live in the
 * list URL. When a detail link is resolved from one of those list pages we add
 * the full list path+query as returnTo. When the detail page resolves its normal
 * library back-link, the validated returnTo path is substituted automatically.
 *
 * Keeping this logic in the shared routing helper makes grid, table, and mobile
 * navigation behave consistently without each caller having to duplicate the
 * same state-passing code.
 */
function preserveLibraryReturnState(path: string): string {
	if (!browser) return path;

	const currentUrl = new URL(window.location.href);
	return getLibraryStatefulPath(path, stripBase(currentUrl.pathname), currentUrl.search);
}

/**
 * Resolve a dynamic route path.
 *
 * SvelteKit's resolve() expects typed route strings, but we often need to
 * use dynamically constructed paths. This wrapper handles the type
 * coercion safely.
 *
 * @param path - A dynamic path string (e.g., `/movies/${id}`)
 * @returns The resolved path with proper base handling
 */
export function resolvePath(path: string): string {
	const preservedPath = preserveLibraryReturnState(path);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return resolve(preservedPath as any);
}
