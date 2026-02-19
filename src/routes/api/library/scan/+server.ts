import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { db } from '$lib/server/db/index.js';
import { libraryScanHistory, rootFolders } from '$lib/server/db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { librarySchedulerService } from '$lib/server/library/index.js';
import { logger } from '$lib/logging';

/**
 * GET /api/library/scan
 * Get scan history
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const limit = parseInt(url.searchParams.get('limit') || '20', 10);
		const rootFolderId = url.searchParams.get('rootFolderId');

		const query = db
			.select({
				id: libraryScanHistory.id,
				rootFolderId: libraryScanHistory.rootFolderId,
				rootFolderPath: rootFolders.path,
				scanType: libraryScanHistory.scanType,
				status: libraryScanHistory.status,
				filesScanned: libraryScanHistory.filesScanned,
				filesAdded: libraryScanHistory.filesAdded,
				filesUpdated: libraryScanHistory.filesUpdated,
				filesRemoved: libraryScanHistory.filesRemoved,
				unmatchedFiles: libraryScanHistory.unmatchedFiles,
				errorMessage: libraryScanHistory.errorMessage,
				startedAt: libraryScanHistory.startedAt,
				completedAt: libraryScanHistory.completedAt
			})
			.from(libraryScanHistory)
			.leftJoin(rootFolders, eq(libraryScanHistory.rootFolderId, rootFolders.id))
			.orderBy(desc(libraryScanHistory.startedAt))
			.limit(limit);

		const history = rootFolderId
			? await query.where(eq(libraryScanHistory.rootFolderId, rootFolderId))
			: await query;

		return json({
			success: true,
			history
		});
	} catch (error) {
		logger.error('[API] Error fetching scan history', error instanceof Error ? error : undefined);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to fetch scan history'
			},
			{ status: 500 }
		);
	}
};

/**
 * POST /api/library/scan
 * Trigger a manual scan
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		let body: { rootFolderId?: string; fullScan?: boolean } = {};
		try {
			body = await request.json();
		} catch {
			// Empty body or invalid JSON is acceptable - use defaults
			logger.debug('Library scan request with empty/invalid body, using defaults');
		}
		const { rootFolderId, fullScan } = body;

		if (rootFolderId) {
			// Scan specific root folder
			const [rootFolder] = await db
				.select()
				.from(rootFolders)
				.where(eq(rootFolders.id, rootFolderId));

			if (!rootFolder) {
				return json({ success: false, error: 'Root folder not found' }, { status: 404 });
			}

			// Use scheduler path so unmatched processing + stat refresh run consistently
			const scanResult = await librarySchedulerService.runFolderScan(rootFolderId);

			const scanResultData = scanResult ? (scanResult as unknown as Record<string, unknown>) : {};
			const { success: _ignored, ...safeScanResultData } = scanResultData;
			return json({
				success: true,
				message: `Scan completed for ${rootFolder.path}`,
				result: scanResult,
				...safeScanResultData
			});
		} else if (fullScan) {
			// Full library scan
			const results = await librarySchedulerService.runFullScan();
			const summary = summarizeScanResults(results);

			const summaryData = summary ? (summary as unknown as Record<string, unknown>) : {};
			const { success: _ignored, ...safeSummaryData } = summaryData;
			return json({
				success: true,
				message: 'Full library scan completed',
				result: summary,
				...safeSummaryData
			});
		} else {
			// Default: trigger manual scan through scheduler
			const results = await librarySchedulerService.runFullScan();
			const summary = summarizeScanResults(results);

			const summaryData = summary ? (summary as unknown as Record<string, unknown>) : {};
			const { success: _ignored, ...safeSummaryData } = summaryData;
			return json({
				success: true,
				message: 'Library scan completed',
				result: summary,
				...safeSummaryData
			});
		}
	} catch (error) {
		logger.error('[API] Error triggering scan', error instanceof Error ? error : undefined);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to trigger scan'
			},
			{ status: 500 }
		);
	}
};

function summarizeScanResults(
	results: Array<{
		filesScanned: number;
		filesAdded: number;
		filesUpdated: number;
		filesRemoved: number;
		unmatchedFiles: number;
	}>
) {
	return results.reduce(
		(acc, item) => {
			acc.filesScanned += item.filesScanned ?? 0;
			acc.filesAdded += item.filesAdded ?? 0;
			acc.filesUpdated += item.filesUpdated ?? 0;
			acc.filesRemoved += item.filesRemoved ?? 0;
			acc.unmatchedFiles += item.unmatchedFiles ?? 0;
			return acc;
		},
		{
			filesScanned: 0,
			filesAdded: 0,
			filesUpdated: 0,
			filesRemoved: 0,
			unmatchedFiles: 0
		}
	);
}
