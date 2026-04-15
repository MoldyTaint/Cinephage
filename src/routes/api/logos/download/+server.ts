import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getLogoDownloadService } from '$lib/server/logos/LogoDownloadService.js';
import { logger } from '$lib/logging';

/**
 * POST /api/logos/download
 * Start downloading logos from GitHub
 */
export const POST: RequestHandler = async () => {
	try {
		const service = getLogoDownloadService();

		// Check if already downloaded
		const status = await service.getStatus();
		if (status.downloaded && status.count > 0) {
			return json({
				success: true,
				message: 'Logos already downloaded',
				data: status
			});
		}

		// Start download in background
		service.download().catch((err) => {
			logger.error('[LogosDownloadAPI] Download failed', err);
		});

		return json({
			success: true,
			message: 'Download started'
		});
	} catch (error) {
		logger.error('[LogosDownloadAPI] Failed to start download', error);
		return json(
			{
				success: false,
				error: 'Failed to start download'
			},
			{ status: 500 }
		);
	}
};

/**
 * DELETE /api/logos/download
 * Remove all downloaded logos
 */
export const DELETE: RequestHandler = async () => {
	try {
		const service = getLogoDownloadService();
		await service.remove();

		return json({
			success: true,
			message: 'Logos removed'
		});
	} catch (error) {
		logger.error('[LogosDownloadAPI] Failed to remove logos', error);
		return json(
			{
				success: false,
				error: 'Failed to remove logos'
			},
			{ status: 500 }
		);
	}
};
