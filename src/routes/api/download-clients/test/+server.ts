import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDownloadClientManager } from '$lib/server/downloadClients/DownloadClientManager';
import { downloadClientTestSchema } from '$lib/validation/schemas';
import { toFriendlyDownloadClientError } from '$lib/downloadClients/errorMessages';
import { z } from 'zod';

const downloadClientTestWithIdSchema = downloadClientTestSchema.extend({
	id: z.string().min(1).optional().nullable()
});

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

	const result = downloadClientTestWithIdSchema.safeParse(data);

	if (!result.success) {
		const firstIssue = result.error.issues[0];
		return json(
			{
				success: false,
				error: firstIssue?.message ?? 'Please review the required fields and try again.',
				details: result.error.flatten()
			},
			{ status: 400 }
		);
	}

	const validated = result.data;
	const manager = getDownloadClientManager();

	try {
		const hasPasswordOverride =
			typeof validated.password === 'string' && validated.password.trim().length > 0;

		const testResult =
			validated.id && !hasPasswordOverride
				? await manager.testClientWithCredentialFallback(validated.id, {
						host: validated.host,
						port: validated.port,
						useSsl: validated.useSsl,
						urlBase: validated.urlBase,
						mountMode: validated.mountMode,
						username: validated.username,
						password: validated.password,
						implementation: validated.implementation
					})
				: await manager.testClient({
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

		if (!testResult.success) {
			return json({
				...testResult,
				error: toFriendlyDownloadClientError(testResult.error)
			});
		}

		return json(testResult);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json(
			{
				success: false,
				error: toFriendlyDownloadClientError(message)
			},
			{ status: 500 }
		);
	}
};
