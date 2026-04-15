/**
 * Permission checking utilities for API keys
 *
 * Permissions follow a resource:action pattern:
 * - '*': Full access to everything
 * - 'livetv:*': Full access to Live TV endpoints
 * - 'library:read': Read-only access to library
 * - 'download:write': Write access to downloads
 */

export type Permission = string;
export type PermissionSet = Record<string, string[]>;

/**
 * Check if a permission set allows access to a specific route
 *
 * @param permissions - The permission set from API key metadata
 * @param route - The route path being accessed
 * @returns boolean indicating if access is allowed
 */
export function checkApiKeyPermission(
	permissions: PermissionSet | null | undefined,
	route: string
): boolean {
	// No permissions = no access
	if (!permissions) {
		return false;
	}

	// Wildcard permission grants full access
	if (permissions['*']?.includes('*')) {
		return true;
	}

	// Check specific resource permissions
	for (const [resource, actions] of Object.entries(permissions)) {
		// Resource wildcard (e.g., 'livetv:*')
		if (actions.includes('*')) {
			const resourcePattern = resource.replace('*', '.*');
			const regex = new RegExp(`^/api/${resourcePattern}(/|$)`);
			if (regex.test(route)) {
				return true;
			}
		}

		// Check specific actions
		for (const action of actions) {
			const permissionString = `${resource}:${action}`;

			// Live TV permissions
			if (permissionString === 'livetv:*') {
				if (route.startsWith('/api/livetv/')) {
					return true;
				}
			}

			// Library permissions
			if (permissionString === 'library:read') {
				if (route.startsWith('/api/library/') && route.endsWith('/')) {
					return true;
				}
			}

			// Download permissions
			if (permissionString === 'download:*') {
				if (route.startsWith('/api/download/')) {
					return true;
				}
			}
		}
	}

	return false;
}

/**
 * Default permission sets for different API key types
 */
export const DEFAULT_PERMISSIONS = {
	FULL: { '*': ['*'] },
	LIVE_TV: { livetv: ['*'] },
	READ_ONLY: {
		library: ['read'],
		discover: ['read'],
		activity: ['read']
	}
} as const;

/**
 * Permission checking middleware for SvelteKit
 * Call this in hooks.server.ts or individual routes
 */
export function requireApiKeyPermission(
	permissions: PermissionSet | null | undefined,
	route: string,
	requiredPermission: string
): boolean {
	// Full access shortcut
	if (permissions?.['*']?.includes('*')) {
		return true;
	}

	// Check specific permission
	const [resource, action] = requiredPermission.split(':');
	if (!resource || !action) {
		return false;
	}

	const resourcePerms = permissions?.[resource];
	if (!resourcePerms) {
		return false;
	}

	return resourcePerms.includes('*') || resourcePerms.includes(action);
}
