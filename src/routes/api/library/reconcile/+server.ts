import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getLibraryEntityService } from '$lib/server/library/LibraryEntityService.js';
import { requireAdmin } from '$lib/server/auth/authorization.js';
import { logger } from '$lib/logging/index.js';

/**
 * POST /api/library/reconcile
 * Run library <-> root folder reconciliation manually.
 *
 * This is the runEndpoint for the 'library-reconcile' scheduled task in
 * UnifiedTaskRegistry. The scheduler invokes it on its configured interval
 * (default 6 hours). Admins can also trigger it via the Tasks settings page.
 *
 * Reconciliation heals drift between libraries, root folders, and their
 * join-table assignments. It runs:
 *   - backfillLibraryRootFolders (seed missing default assignments)
 *   - syncSystemLibrariesFromRootFolders (reconcile system libraries +
 *     root folder assignments)
 */
export const POST: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	const startedAt = Date.now();
	logger.info('[/api/library/reconcile] Starting manual reconciliation');

	try {
		await getLibraryEntityService().reconcileAll();
		const durationMs = Date.now() - startedAt;
		logger.info({ durationMs }, '[/api/library/reconcile] Completed');
		return json({ success: true, durationMs });
	} catch (err) {
		logger.error({ err }, '[/api/library/reconcile] Failed');
		return json(
			{ success: false, error: err instanceof Error ? err.message : 'Reconciliation failed' },
			{ status: 500 }
		);
	}
};
