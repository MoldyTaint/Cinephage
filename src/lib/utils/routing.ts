/**
 * Routing Utilities
 *
 * Helper functions for SvelteKit routing with dynamic paths.
 */

import { resolve } from '$app/paths';

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
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return resolve(path as any);
}
