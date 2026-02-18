import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getSubtitleProviderManager } from '$lib/server/subtitles/services/SubtitleProviderManager';
import { ensureProvidersRegistered } from '$lib/server/subtitles/providers/registry';

export const load: PageServerLoad = async () => {
	// Ensure provider registry is initialized before accessing definitions
	await ensureProvidersRegistered();

	const manager = getSubtitleProviderManager();
	const providers = await manager.getProviders();
	const definitions = manager.getDefinitions();

	// Add definition info to each provider
	const providersWithDefinitions = providers.map((provider) => ({
		...provider,
		definitionName: definitions.find((d) => d.implementation === provider.implementation)?.name,
		definition: definitions.find((d) => d.implementation === provider.implementation)
	}));

	return {
		providers: providersWithDefinitions,
		definitions
	};
};

export const actions: Actions = {
	createProvider: async ({ request }) => {
		const data = await request.formData();
		const jsonData = data.get('data');

		if (!jsonData || typeof jsonData !== 'string') {
			return fail(400, { providerError: 'Invalid request data' });
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(jsonData);
		} catch {
			return fail(400, { providerError: 'Invalid JSON data' });
		}

		const manager = getSubtitleProviderManager();

		try {
			const providerData = parsed as {
				name: string;
				implementation: string;
				enabled: boolean;
				priority: number;
				apiKey?: string;
				username?: string;
				password?: string;
				requestsPerMinute: number;
			};

			await manager.createProvider({
				name: providerData.name,
				implementation: providerData.implementation as
					| 'opensubtitles'
					| 'addic7ed'
					| 'subdl'
					| 'yifysubtitles'
					| 'gestdown'
					| 'subf2m',
				enabled: providerData.enabled,
				priority: providerData.priority,
				apiKey: providerData.apiKey,
				username: providerData.username,
				password: providerData.password,
				requestsPerMinute: providerData.requestsPerMinute
			});

			return { providerSuccess: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return fail(500, { providerError: message });
		}
	},

	updateProvider: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id');
		const jsonData = data.get('data');

		if (!id || typeof id !== 'string') {
			return fail(400, { providerError: 'Missing provider ID' });
		}

		if (!jsonData || typeof jsonData !== 'string') {
			return fail(400, { providerError: 'Invalid request data' });
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(jsonData);
		} catch {
			return fail(400, { providerError: 'Invalid JSON data' });
		}

		const manager = getSubtitleProviderManager();

		try {
			const providerData = parsed as {
				name: string;
				enabled: boolean;
				priority: number;
				apiKey?: string;
				username?: string;
				password?: string;
				requestsPerMinute: number;
			};

			await manager.updateProvider(id, {
				name: providerData.name,
				enabled: providerData.enabled,
				priority: providerData.priority,
				apiKey: providerData.apiKey,
				username: providerData.username,
				password: providerData.password,
				requestsPerMinute: providerData.requestsPerMinute
			});

			return { providerSuccess: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return fail(500, { providerError: message });
		}
	},

	deleteProvider: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id');

		if (!id || typeof id !== 'string') {
			return fail(400, { providerError: 'Missing provider ID' });
		}

		const manager = getSubtitleProviderManager();

		try {
			await manager.deleteProvider(id);
			return { providerSuccess: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return fail(500, { providerError: message });
		}
	},

	resetThrottle: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id');

		if (!id || typeof id !== 'string') {
			return fail(400, { providerError: 'Missing provider ID' });
		}

		const manager = getSubtitleProviderManager();

		try {
			await manager.resetThrottle(id);
			return { providerSuccess: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return fail(500, { providerError: message });
		}
	},

	toggleProvider: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id');
		const enabled = data.get('enabled') === 'true';

		if (!id || typeof id !== 'string') {
			return fail(400, { providerError: 'Missing provider ID' });
		}

		const manager = getSubtitleProviderManager();

		try {
			await manager.updateProvider(id, { enabled });
			return { providerSuccess: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return fail(500, { providerError: message });
		}
	},

	bulkEnable: async ({ request }) => {
		const data = await request.formData();
		const idsJson = data.get('ids');

		if (!idsJson || typeof idsJson !== 'string') {
			return fail(400, { providerError: 'Missing provider IDs' });
		}

		let ids: string[];
		try {
			ids = JSON.parse(idsJson);
		} catch {
			return fail(400, { providerError: 'Invalid IDs format' });
		}

		const manager = getSubtitleProviderManager();
		try {
			for (const id of ids) {
				await manager.updateProvider(id, { enabled: true });
			}
			return { providerSuccess: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return fail(500, { providerError: message });
		}
	},

	bulkDisable: async ({ request }) => {
		const data = await request.formData();
		const idsJson = data.get('ids');

		if (!idsJson || typeof idsJson !== 'string') {
			return fail(400, { providerError: 'Missing provider IDs' });
		}

		let ids: string[];
		try {
			ids = JSON.parse(idsJson);
		} catch {
			return fail(400, { providerError: 'Invalid IDs format' });
		}

		const manager = getSubtitleProviderManager();
		try {
			for (const id of ids) {
				await manager.updateProvider(id, { enabled: false });
			}
			return { providerSuccess: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return fail(500, { providerError: message });
		}
	},

	bulkDelete: async ({ request }) => {
		const data = await request.formData();
		const idsJson = data.get('ids');

		if (!idsJson || typeof idsJson !== 'string') {
			return fail(400, { providerError: 'Missing provider IDs' });
		}

		let ids: string[];
		try {
			ids = JSON.parse(idsJson);
		} catch {
			return fail(400, { providerError: 'Invalid IDs format' });
		}

		const manager = getSubtitleProviderManager();
		try {
			for (const id of ids) {
				await manager.deleteProvider(id);
			}
			return { providerSuccess: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return fail(500, { providerError: message });
		}
	}
};
