/**
 * Smart List Presets API
 * GET /api/smartlists/presets - List all available external list presets
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { presetService } from '$lib/server/smartlists/presets/PresetService.js';

export const GET: RequestHandler = async () => {
	try {
		const presets = presetService.getAllPresets();
		return json(presets);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json({ error: message }, { status: 500 });
	}
};
