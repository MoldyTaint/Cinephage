import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { namingSettingsService } from '$lib/server/library/naming/NamingSettingsService';
import { DEFAULT_NAMING_CONFIG } from '$lib/server/library/naming/NamingService';
import { namingConfigUpdateSchema } from '$lib/validation/schemas';
import { logger } from '$lib/logging';

/**
 * GET /api/naming
 * Returns current naming configuration
 */
export const GET: RequestHandler = async () => {
	try {
		const config = await namingSettingsService.getConfig();

		return json({
			config,
			defaults: DEFAULT_NAMING_CONFIG
		});
	} catch (error) {
		logger.error('Error getting naming config', error instanceof Error ? error : undefined);
		return json({ error: 'Failed to get naming configuration' }, { status: 500 });
	}
};

/**
 * PUT /api/naming
 * Update naming configuration
 */
export const PUT: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const validation = namingConfigUpdateSchema.safeParse(body);

		if (!validation.success) {
			return json(
				{ error: 'Invalid request body', details: validation.error.issues },
				{ status: 400 }
			);
		}

		const updatedConfig = await namingSettingsService.updateConfig(validation.data);

		return json({
			success: true,
			config: updatedConfig
		});
	} catch (error) {
		logger.error('Error updating naming config', error instanceof Error ? error : undefined);
		return json({ error: 'Failed to update naming configuration' }, { status: 500 });
	}
};

/**
 * DELETE /api/naming
 * Reset naming configuration to defaults
 */
export const DELETE: RequestHandler = async () => {
	try {
		const defaultConfig = await namingSettingsService.resetToDefaults();

		return json({
			success: true,
			config: defaultConfig,
			message: 'Naming settings reset to defaults'
		});
	} catch (error) {
		logger.error('Error resetting naming config', error instanceof Error ? error : undefined);
		return json({ error: 'Failed to reset naming configuration' }, { status: 500 });
	}
};
