import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { downloadClientCreateSchema, downloadClientUpdateSchema } from '$lib/validation/schemas';
import { getDownloadClientManager } from '$lib/server/downloadClients/DownloadClientManager';

export const load: PageServerLoad = async () => {
	const downloadClientManager = getDownloadClientManager();
	const downloadClients = await downloadClientManager.getClients();

	return {
		downloadClients
	};
};

export const actions: Actions = {
	createDownloadClient: async ({ request }) => {
		const data = await request.formData();
		const jsonData = data.get('data');

		if (!jsonData || typeof jsonData !== 'string') {
			return fail(400, { downloadClientError: 'Invalid request data' });
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(jsonData);
		} catch {
			return fail(400, { downloadClientError: 'Invalid JSON data' });
		}

		const result = downloadClientCreateSchema.safeParse(parsed);
		if (!result.success) {
			return fail(400, {
				downloadClientError: result.error.issues[0]?.message ?? 'Validation failed'
			});
		}

		const manager = getDownloadClientManager();

		try {
			await manager.createClient(result.data);
			return { downloadClientSuccess: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return fail(500, { downloadClientError: message });
		}
	},

	updateDownloadClient: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id');
		const jsonData = data.get('data');

		if (!id || typeof id !== 'string') {
			return fail(400, { downloadClientError: 'Missing client ID' });
		}

		if (!jsonData || typeof jsonData !== 'string') {
			return fail(400, { downloadClientError: 'Invalid request data' });
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(jsonData);
		} catch {
			return fail(400, { downloadClientError: 'Invalid JSON data' });
		}

		const result = downloadClientUpdateSchema.safeParse(parsed);
		if (!result.success) {
			return fail(400, {
				downloadClientError: result.error.issues[0]?.message ?? 'Validation failed'
			});
		}

		const manager = getDownloadClientManager();

		try {
			await manager.updateClient(id, result.data);
			return { downloadClientSuccess: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return fail(500, { downloadClientError: message });
		}
	},

	deleteDownloadClient: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id');

		if (!id || typeof id !== 'string') {
			return fail(400, { downloadClientError: 'Missing client ID' });
		}

		const manager = getDownloadClientManager();

		try {
			await manager.deleteClient(id);
			return { downloadClientSuccess: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return fail(500, { downloadClientError: message });
		}
	},

	toggleDownloadClient: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id');
		const enabled = data.get('enabled') === 'true';

		if (!id || typeof id !== 'string') {
			return fail(400, { downloadClientError: 'Missing client ID' });
		}

		const manager = getDownloadClientManager();

		try {
			await manager.updateClient(id, { enabled });
			return { downloadClientSuccess: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return fail(500, { downloadClientError: message });
		}
	},

	bulkEnable: async ({ request }) => {
		const data = await request.formData();
		const idsJson = data.get('ids');

		if (!idsJson || typeof idsJson !== 'string') {
			return fail(400, { downloadClientError: 'Missing client IDs' });
		}

		let ids: string[];
		try {
			ids = JSON.parse(idsJson);
		} catch {
			return fail(400, { downloadClientError: 'Invalid IDs format' });
		}

		const manager = getDownloadClientManager();

		try {
			for (const id of ids) {
				await manager.updateClient(id, { enabled: true });
			}
			return { downloadClientSuccess: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return fail(500, { downloadClientError: message });
		}
	},

	bulkDisable: async ({ request }) => {
		const data = await request.formData();
		const idsJson = data.get('ids');

		if (!idsJson || typeof idsJson !== 'string') {
			return fail(400, { downloadClientError: 'Missing client IDs' });
		}

		let ids: string[];
		try {
			ids = JSON.parse(idsJson);
		} catch {
			return fail(400, { downloadClientError: 'Invalid IDs format' });
		}

		const manager = getDownloadClientManager();

		try {
			for (const id of ids) {
				await manager.updateClient(id, { enabled: false });
			}
			return { downloadClientSuccess: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return fail(500, { downloadClientError: message });
		}
	},

	bulkDelete: async ({ request }) => {
		const data = await request.formData();
		const idsJson = data.get('ids');

		if (!idsJson || typeof idsJson !== 'string') {
			return fail(400, { downloadClientError: 'Missing client IDs' });
		}

		let ids: string[];
		try {
			ids = JSON.parse(idsJson);
		} catch {
			return fail(400, { downloadClientError: 'Invalid IDs format' });
		}

		const manager = getDownloadClientManager();

		try {
			for (const id of ids) {
				await manager.deleteClient(id);
			}
			return { downloadClientSuccess: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return fail(500, { downloadClientError: message });
		}
	}
};
