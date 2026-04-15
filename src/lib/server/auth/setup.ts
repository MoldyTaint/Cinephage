import { redirect, type RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';

/**
 * Check if admin setup is complete
 * Queries database every time - no caching to avoid stale state
 */
export async function isSetupComplete(): Promise<boolean> {
	try {
		const user = await db.query.user.findFirst({
			columns: {
				id: true
			}
		});
		return !!user;
	} catch {
		// Table doesn't exist yet (first run)
		return false;
	}
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
