/**
 * Portal Scan Results API
 *
 * GET    /api/livetv/portals/[id]/scan/results - Get scan results
 * DELETE /api/livetv/portals/[id]/scan/results - Clear scan results
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPortalScannerService, type ScanResult } from '$lib/server/livetv/stalker';
import { logger } from '$lib/logging';

/**
 * Get scan results for a portal
 */
export const GET: RequestHandler = async ({ params, url }) => {
	try {
		const status = url.searchParams.get('status') as ScanResult['status'] | null;

		const scannerService = getPortalScannerService();
		const results = await scannerService.getScanResults(params.id, status || undefined);

		return json({
			success: true,
			results
		});
	} catch (error) {
		logger.error('[API] Failed to get scan results', error instanceof Error ? error : undefined);

		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to get scan results'
			},
			{ status: 500 }
		);
	}
};

/**
 * Clear scan results
 */
export const DELETE: RequestHandler = async ({ params, url }) => {
	try {
		const status = url.searchParams.get('status') as ScanResult['status'] | null;

		const scannerService = getPortalScannerService();
		const deleted = await scannerService.clearResults(params.id, status || undefined);

		return json({
			success: true,
			deleted
		});
	} catch (error) {
		logger.error('[API] Failed to clear scan results', error instanceof Error ? error : undefined);

		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to clear scan results'
			},
			{ status: 500 }
		);
	}
};
