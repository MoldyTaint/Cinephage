import { redirect, type RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';

/**
 * Check if admin setup is complete.
 *
 * Cached in module state because this runs on every request; the cache is
 * invalidated by markSetupComplete()/resetSetupCompleteCache() when the user
 * table changes (sign-up hook, tests). A missing user table (first run) is a
 * transient state and is never cached.
 */
let setupCompleteCache: boolean | null = null;

export async function isSetupComplete(): Promise<boolean> {
	if (setupCompleteCache !== null) {
		return setupCompleteCache;
	}
	try {
		const user = await db.query.user.findFirst({
			columns: {
				id: true
			}
		});
		setupCompleteCache = !!user;
		return setupCompleteCache;
	} catch {
		// Table doesn't exist yet (first run)
		return false;
	}
}

/** Force recomputation on the next isSetupComplete() call. */
export function resetSetupCompleteCache(): void {
	setupCompleteCache = null;
}

/**
 * Require setup to be incomplete (redirect to dashboard if setup is complete)
 * Use on setup/login pages
 */
export async function requireSetup(_event: RequestEvent): Promise<void> {
	const complete = await isSetupComplete();

	if (complete) {
		// Setup is complete, redirect to dashboard
		throw redirect(302, '/');
	}
}
