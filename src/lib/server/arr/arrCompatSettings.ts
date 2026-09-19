/**
 * ARR COMPATIBILITY — UNSUPPORTED, BEST-EFFORT, NON-PRIORITY.
 *
 * Cinephage is its own thing. This Radarr/Sonarr-compatible surface exists
 * only as a convenience for external tools. We do not cater to the arr
 * stack: when an arr client's expectations conflict with Cinephage
 * behavior, Cinephage wins, always. Never reshape, gate, or slow down core
 * behavior to satisfy arr compatibility, and arr-only failures are not
 * release blockers.
 *
 * Fuck the ARR stack and everything with it. It's not our shit nor our problem.
 *
 * Toggle for the Radarr/Sonarr-compatible API layer. Off by default.
 */

import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { settings } from '$lib/server/db/schema';

export const ARR_COMPAT_ENABLED_KEY = 'arr_compat_enabled';

export function isArrCompatEnabled(): boolean {
	const row = db.select().from(settings).where(eq(settings.key, ARR_COMPAT_ENABLED_KEY)).get();
	return row?.value === 'true';
}

export function setArrCompatEnabled(value: boolean): void {
	const stored = value ? 'true' : 'false';
	db.insert(settings)
		.values({ key: ARR_COMPAT_ENABLED_KEY, value: stored })
		.onConflictDoUpdate({ target: settings.key, set: { value: stored } })
		.run();
}
