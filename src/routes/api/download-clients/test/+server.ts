import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDownloadClientManager } from '$lib/server/downloadClients';
import { downloadClientTestSchema } from '$lib/validation/schemas';

/**
 * POST /api/download-clients/test
 * Test a download client connection before saving.
 */
export const POST: RequestHandler = async ({ request }) => {
	let data: unknown;
	try {
		data = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const result = downloadClientTestSchema.safeParse(data);

	if (!result.success) {
		return json(
			{
				error: 'Validation failed',
				details: result.error.flatten()
			},
			{ status: 400 }
		);
	}

	const validated = result.data;
	const manager = getDownloadClientManager();

	try {
		const testResult = await manager.testClient({
			host: validated.host,
			port: validated.port,
			useSsl: validated.useSsl,
			urlBase: validated.urlBase,
			mountMode: validated.mountMode,
			username: validated.username,
			password: validated.password,
			implementation: validated.implementation,
			apiKey:
				validated.implementation === 'sabnzbd' || validated.implementation === 'nzb-mount'
					? validated.password
					: undefined
		});

		return json(testResult);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json(
			{
				success: false,
				error: message
			},
			{ status: 500 }
		);
	}
};
