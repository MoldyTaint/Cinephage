import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { normalizeNamingConfig, normalizeNamingPresetSelection } from '$lib/naming/editor-state';
import { namingSettingsService } from '$lib/server/library/naming/NamingSettingsService';
import { DEFAULT_NAMING_CONFIG } from '$lib/server/library/naming/NamingService';
import { namingSettingsUpdateSchema } from '$lib/validation/schemas';
import { logger } from '$lib/logging';
import { requireAdmin } from '$lib/server/auth/authorization.js';

/**
 * GET /api/naming
 * Returns current naming configuration
 */
export const GET: RequestHandler = async () => {
	try {
		const config = await namingSettingsService.getConfig();
		const presetSelection = await namingSettingsService.getPresetSelection();

		return json({
			config,
			presetSelection,
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
export const PUT: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	const { request } = event;
	try {
		const body = await request.json();
		const validation = namingSettingsUpdateSchema.safeParse(body);

		if (!validation.success) {
			return json(
				{ error: 'Invalid request body', details: validation.error.issues },
				{ status: 400 }
			);
		}

		const updatedSettings = await namingSettingsService.updateSettings({
			config: normalizeNamingConfig(validation.data.config),
			presetSelection: normalizeNamingPresetSelection(validation.data.presetSelection)
		});

		return json({
			success: true,
			config: updatedSettings.config,
			presetSelection: updatedSettings.presetSelection
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
export const DELETE: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	try {
		const defaultConfig = await namingSettingsService.resetToDefaults();
		const presetSelection = await namingSettingsService.getPresetSelection();

		return json({
			success: true,
			config: defaultConfig,
			presetSelection,
			message: 'Naming settings reset to defaults'
		});
	} catch (error) {
		logger.error('Error resetting naming config', error instanceof Error ? error : undefined);
		return json({ error: 'Failed to reset naming configuration' }, { status: 500 });
	}
};
