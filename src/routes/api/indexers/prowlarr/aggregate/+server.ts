import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth/authorization.js';
import {
	getProwlarrConnection,
	saveProwlarrConnection,
	enableAggregateMode,
	disableAggregateMode
} from '$lib/server/indexers/prowlarr/ProwlarrConnectionService.js';
import { z } from 'zod';

const schema = z.object({ enable: z.boolean() });

/** POST - enable or disable aggregate endpoint mode. */
export const POST: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const result = schema.safeParse(body);
	if (!result.success) {
		return json({ error: result.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
	}

	const conn = await getProwlarrConnection();
	if (!conn) {
		return json({ error: 'No Prowlarr connection configured' }, { status: 400 });
	}

	try {
		if (result.data.enable) {
			await enableAggregateMode(conn);
		} else {
			await disableAggregateMode(conn);
		}
	} catch (err) {
		return json(
			{ error: err instanceof Error ? err.message : 'Failed to switch mode' },
			{ status: 500 }
		);
	}

	conn.useAggregateEndpoint = result.data.enable;
	await saveProwlarrConnection(conn);

	return json({ success: true });
};
