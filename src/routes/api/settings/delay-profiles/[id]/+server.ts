import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth/authorization.js';
import { delayProfileService } from '$lib/server/monitoring/specifications/DelaySpecification.js';
import { z } from 'zod';

const updateDelayProfileSchema = z.object({
	name: z.string().min(1).optional(),
	enabled: z.boolean().optional(),
	usenetDelay: z.number().int().min(0).optional(),
	torrentDelay: z.number().int().min(0).optional(),
	preferredProtocol: z.enum(['torrent', 'usenet']).nullable().optional(),
	bypassIfHighestQuality: z.boolean().optional(),
	bypassIfAboveScore: z.number().int().nullable().optional()
});

export const PUT: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	const { id } = event.params;
	const body = await event.request.json();
	const parsed = updateDelayProfileSchema.safeParse(body);

	if (!parsed.success) {
		return json(
			{ error: 'Invalid request body', details: parsed.error.flatten() },
			{ status: 400 }
		);
	}

	try {
		await delayProfileService.updateProfile(id, parsed.data);
		return json({ success: true });
	} catch (err) {
		return json({ error: 'Failed to update delay profile', details: String(err) }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	const { id } = event.params;

	try {
		await delayProfileService.deleteProfile(id);
		return json({ success: true });
	} catch (err) {
		return json(
			{ error: err instanceof Error ? err.message : 'Failed to delete delay profile' },
			{ status: 500 }
		);
	}
};
