import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	mediaBrowserServerCreateSchema,
	mediaBrowserServerUpdateSchema
} from '$lib/validation/schemas';
import { getMediaBrowserManager } from '$lib/server/notifications/mediabrowser';

export const load: PageServerLoad = async () => {
	const manager = getMediaBrowserManager();
	const servers = await manager.getServers();

	return {
		servers
	};
};

export const actions: Actions = {
	createServer: async ({ request }) => {
		const data = await request.formData();
		const jsonData = data.get('data');

		if (!jsonData || typeof jsonData !== 'string') {
			return fail(400, { serverError: 'Invalid request data' });
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(jsonData);
		} catch {
			return fail(400, { serverError: 'Invalid JSON data' });
		}

		const result = mediaBrowserServerCreateSchema.safeParse(parsed);
		if (!result.success) {
			return fail(400, {
				serverError: result.error.issues[0]?.message ?? 'Validation failed'
			});
		}

		const manager = getMediaBrowserManager();

		try {
			const shouldValidateConnection = result.data.enabled ?? true;
			if (shouldValidateConnection) {
				const testResult = await manager.testServerConfig({
					host: result.data.host,
					apiKey: result.data.apiKey,
					serverType: result.data.serverType
				});

				if (!testResult.success) {
					return fail(400, {
						serverError: testResult.error
							? `Connection test failed: ${testResult.error}`
							: 'Connection test failed'
					});
				}
			}

			await manager.createServer(result.data);
			return { serverSuccess: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return fail(500, { serverError: message });
		}
	},

	updateServer: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id');
		const jsonData = data.get('data');

		if (!id || typeof id !== 'string') {
			return fail(400, { serverError: 'Missing server ID' });
		}

		if (!jsonData || typeof jsonData !== 'string') {
			return fail(400, { serverError: 'Invalid request data' });
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(jsonData);
		} catch {
			return fail(400, { serverError: 'Invalid JSON data' });
		}

		const result = mediaBrowserServerUpdateSchema.safeParse(parsed);
		if (!result.success) {
			return fail(400, {
				serverError: result.error.issues[0]?.message ?? 'Validation failed'
			});
		}

		const manager = getMediaBrowserManager();

		try {
			const existing = await manager.getServerRecord(id);
			if (!existing) {
				return fail(404, { serverError: 'Server not found' });
			}

			const effectiveEnabled = result.data.enabled ?? existing.enabled ?? true;
			if (effectiveEnabled) {
				const host = result.data.host ?? existing.host;
				const apiKey = result.data.apiKey ?? existing.apiKey;
				const serverType = (result.data.serverType ?? existing.serverType) as 'jellyfin' | 'emby';

				const testResult = await manager.testServerConfig({
					host,
					apiKey,
					serverType
				});

				if (!testResult.success) {
					return fail(400, {
						serverError: testResult.error
							? `Connection test failed: ${testResult.error}`
							: 'Connection test failed'
					});
				}
			}

			await manager.updateServer(id, result.data);
			return { serverSuccess: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return fail(500, { serverError: message });
		}
	},

	deleteServer: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id');

		if (!id || typeof id !== 'string') {
			return fail(400, { serverError: 'Missing server ID' });
		}

		const manager = getMediaBrowserManager();

		try {
			await manager.deleteServer(id);
			return { serverSuccess: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return fail(500, { serverError: message });
		}
	},

	toggleServer: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id');
		const enabled = data.get('enabled') === 'true';

		if (!id || typeof id !== 'string') {
			return fail(400, { serverError: 'Missing server ID' });
		}

		const manager = getMediaBrowserManager();

		try {
			await manager.updateServer(id, { enabled });
			return { serverSuccess: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return fail(500, { serverError: message });
		}
	},

	bulkEnable: async ({ request }) => {
		const data = await request.formData();
		const idsJson = data.get('ids');

		if (!idsJson || typeof idsJson !== 'string') {
			return fail(400, { serverError: 'Missing server IDs' });
		}

		let ids: string[];
		try {
			ids = JSON.parse(idsJson);
		} catch {
			return fail(400, { serverError: 'Invalid IDs format' });
		}

		const manager = getMediaBrowserManager();

		try {
			for (const id of ids) {
				await manager.updateServer(id, { enabled: true });
			}
			return { serverSuccess: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return fail(500, { serverError: message });
		}
	},

	bulkDisable: async ({ request }) => {
		const data = await request.formData();
		const idsJson = data.get('ids');

		if (!idsJson || typeof idsJson !== 'string') {
			return fail(400, { serverError: 'Missing server IDs' });
		}

		let ids: string[];
		try {
			ids = JSON.parse(idsJson);
		} catch {
			return fail(400, { serverError: 'Invalid IDs format' });
		}

		const manager = getMediaBrowserManager();

		try {
			for (const id of ids) {
				await manager.updateServer(id, { enabled: false });
			}
			return { serverSuccess: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return fail(500, { serverError: message });
		}
	},

	bulkDelete: async ({ request }) => {
		const data = await request.formData();
		const idsJson = data.get('ids');

		if (!idsJson || typeof idsJson !== 'string') {
			return fail(400, { serverError: 'Missing server IDs' });
		}

		let ids: string[];
		try {
			ids = JSON.parse(idsJson);
		} catch {
			return fail(400, { serverError: 'Invalid IDs format' });
		}

		const manager = getMediaBrowserManager();

		try {
			for (const id of ids) {
				await manager.deleteServer(id);
			}
			return { serverSuccess: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return fail(500, { serverError: message });
		}
	}
};
