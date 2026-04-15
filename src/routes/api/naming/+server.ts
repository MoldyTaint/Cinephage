import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { normalizeNamingConfig, normalizeNamingPresetSelection } from '$lib/naming/editor-state';
import { namingSettingsService } from '$lib/server/library/naming/NamingSettingsService';
import { DEFAULT_NAMING_CONFIG } from '$lib/server/library/naming/NamingService';
import { namingSettingsUpdateSchema } from '$lib/validation/schemas';
import { requireAdmin } from '$lib/server/auth/authorization.js';
import { resetRenamePreviewService } from '$lib/server/library/naming/RenamePreviewService.js';
import { parseBody } from '$lib/server/api/validate.js';

/**
 * GET /api/naming
 * Returns current naming configuration
 */
export const GET: RequestHandler = async () => {
	const config = await namingSettingsService.getConfig();
	const presetSelection = await namingSettingsService.getPresetSelection();

	return json({
		config,
		presetSelection,
		defaults: DEFAULT_NAMING_CONFIG
	});
};

/**
 * PUT /api/naming
 * Update naming configuration
 */
export const PUT: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	const { request } = event;
	const validation = await parseBody(request, namingSettingsUpdateSchema);

	const updatedSettings = await namingSettingsService.updateSettings({
		config: normalizeNamingConfig(validation.config),
		presetSelection: normalizeNamingPresetSelection(validation.presetSelection)
	});

	// Invalidate cached NamingService so subsequent operations use the new config
	resetRenamePreviewService();

	return json({
		success: true,
		config: updatedSettings.config,
		presetSelection: updatedSettings.presetSelection
	});
};

/**
 * DELETE /api/naming
 * Reset naming configuration to defaults
 */
export const DELETE: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	const defaultConfig = await namingSettingsService.resetToDefaults();
	const presetSelection = await namingSettingsService.getPresetSelection();

	// Invalidate cached NamingService so subsequent operations use the default config
	resetRenamePreviewService();

	return json({
		success: true,
		config: defaultConfig,
		presetSelection,
		message: 'Naming settings reset to defaults'
	});
};
