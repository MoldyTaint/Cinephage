/**
 * Authorization helpers for RBAC
 *
 * Provides utility functions for checking admin status and permissions.
 * Single admin system - only one admin account is allowed.
 */
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

/**
 * User role type
 */
export type UserRole = 'admin' | 'user';

/**
 * Check if the current user is an admin
 */
export function isAdmin(event: RequestEvent): boolean {
	return event.locals.user?.role === 'admin';
}

/**
 * Require admin access for API routes
 * Returns 403 response if user is not an admin
 *
 * Usage in +server.ts:
 * ```typescript
 * export const POST: RequestHandler = async (event) => {
 *   const authError = requireAdmin(event);
 *   if (authError) return authError;
 *   // ... handle request
 * };
 * ```
 */
export function requireAdmin(event: RequestEvent): Response | null {
	if (!event.locals.user) {
		return json(
			{
				success: false,
				error: 'Unauthorized. Authentication required.',
				code: 'UNAUTHORIZED'
			},
			{ status: 401 }
		);
	}

	if (event.locals.user.role !== 'admin') {
		return json(
			{
				success: false,
				error: 'Forbidden. Admin access required.',
				code: 'FORBIDDEN'
			},
			{ status: 403 }
		);
	}

	return null;
}

/**
 * Require authentication for API routes
 * Returns 401 response if user is not authenticated
 *
 * Usage in +server.ts:
 * ```typescript
 * export const GET: RequestHandler = async (event) => {
 *   const authError = requireAuth(event);
 *   if (authError) return authError;
 *   // ... handle request
 * };
 * ```
 */
export function requireAuth(event: RequestEvent): Response | null {
	if (!event.locals.user) {
		return json(
			{
				success: false,
				error: 'Unauthorized. Authentication required.',
				code: 'UNAUTHORIZED'
			},
			{ status: 401 }
		);
	}
	return null;
}

/**
 * Get current user role from event locals
 */
export function getUserRole(event: RequestEvent): UserRole | null {
	return (event.locals.user?.role as UserRole) || null;
}

/**
 * Permission set type
 */
type PermissionSet = Record<string, string[]>;

/**
 * Check if user has a specific permission
 *
 * @param permissions - The permission set to check
 * @param resource - The resource (e.g., 'indexer', 'library')
 * @param action - The action (e.g., 'create', 'read', 'update', 'delete')
 * @returns boolean indicating if permission is granted
 */
export function hasPermission(
	permissions: PermissionSet | null | undefined,
	resource: string,
	action: string
): boolean {
	if (!permissions) {
		return false;
	}

	// Check wildcard permission
	if (permissions['*']?.includes('*')) {
		return true;
	}

	// Check resource-specific wildcard
	const resourcePerms = permissions[resource];
	if (!resourcePerms) {
		return false;
	}

	if (resourcePerms.includes('*')) {
		return true;
	}

	return resourcePerms.includes(action);
}

/**
 * Type guard to check if user is authenticated
 */
export function isAuthenticated(event: RequestEvent): boolean {
	return !!event.locals.user;
}

/**
 * Get current user from event locals
 * Throws error if user is not authenticated (for use after requireAuth check)
 */
export function getUser(event: RequestEvent) {
	if (!event.locals.user) {
		throw new Error('User not authenticated');
	}
	return event.locals.user;
}
