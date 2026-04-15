import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { namingPresets } from '$lib/server/db/schema';
import { getBuiltInPreset, type NamingPreset } from '$lib/server/library/naming/presets';
import { namingSettingsService } from '$lib/server/library/naming/NamingSettingsService';
import { eq } from 'drizzle-orm';
import { logger } from '$lib/logging';
import { requireAdmin } from '$lib/server/auth/authorization.js';

/**
 * POST /api/naming/presets/[id]/apply
 * Apply a preset's config to the current naming settings
 */
export const POST: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	const { params } = event;
	try {
		const { id } = params;
		let presetConfig: NamingPreset['config'];

		// Check built-in presets first
		const builtIn = getBuiltInPreset(id);
		if (builtIn) {
			presetConfig = builtIn.config;
		} else {
			// Check custom presets
			const [customPreset] = await db.select().from(namingPresets).where(eq(namingPresets.id, id));

			if (!customPreset) {
				return json({ error: 'Preset not found' }, { status: 404 });
			}

			presetConfig = customPreset.config as NamingPreset['config'];
		}

		// Apply the preset config to naming settings
		await namingSettingsService.updateConfig(presetConfig);

		// Get the updated config to return
		const updatedConfig = await namingSettingsService.getConfig();

		return json({
			success: true,
			config: updatedConfig
		});
	} catch (err) {
		logger.error({ err, component: 'NamingPresetApplyApi' }, 'Error applying naming preset');
		return json({ error: 'Failed to apply preset' }, { status: 500 });
	}
};
