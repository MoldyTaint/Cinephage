import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SABnzbdClient } from './SABnzbdClient';
import { SABnzbdProxy, SabnzbdApiError } from './SABnzbdProxy';

vi.mock('./SABnzbdProxy', () => {
	class SabnzbdApiError extends Error {
		constructor(
			message: string,
			public readonly statusCode?: number
		) {
			super(message);
			this.name = 'SabnzbdApiError';
		}
	}

	class SABnzbdProxy {
		static instances: SABnzbdProxy[] = [];
		getVersion = vi.fn();
		getConfig = vi.fn();
		getFullStatus = vi.fn();
		getWarnings = vi.fn();
		getCategories = vi.fn();
		getHistory = vi.fn();
		getQueue = vi.fn();
		getQueueItem = vi.fn();
		getHistoryItem = vi.fn();

		constructor() {
			SABnzbdProxy.instances.push(this);
		}
	}

	return { SABnzbdProxy, SabnzbdApiError };
});

function getProxyInstance() {
	const proxyClass = SABnzbdProxy as unknown as { instances: Array<Record<string, unknown>> };
	return proxyClass.instances[0] as {
		getVersion: ReturnType<typeof vi.fn>;
		getConfig: ReturnType<typeof vi.fn>;
		getFullStatus: ReturnType<typeof vi.fn>;
		getWarnings: ReturnType<typeof vi.fn>;
		getCategories: ReturnType<typeof vi.fn>;
		getHistory: ReturnType<typeof vi.fn>;
		getQueue: ReturnType<typeof vi.fn>;
		getQueueItem: ReturnType<typeof vi.fn>;
		getHistoryItem: ReturnType<typeof vi.fn>;
	};
}

describe('SABnzbdClient mount-mode compatibility', () => {
	beforeEach(() => {
		const proxyClass = SABnzbdProxy as unknown as { instances: Array<Record<string, unknown>> };
		proxyClass.instances.length = 0;
	});

	it('keeps sabnzbd implementation identity in mount mode', () => {
		const client = new SABnzbdClient({
			host: 'localhost',
			port: 3000,
			useSsl: false,
			apiKey: 'key',
			implementation: 'sabnzbd',
			mountMode: 'nzbdav'
		});

		expect(client.implementation).toBe('sabnzbd');
	});

	it('continues when fullstatus returns unknown mode for mount-mode clients', async () => {
		const client = new SABnzbdClient({
			host: 'localhost',
			port: 3000,
			useSsl: false,
			apiKey: 'key',
			implementation: 'sabnzbd',
			mountMode: 'altmount'
		});
		const proxy = getProxyInstance();
		proxy.getVersion.mockResolvedValue('4.5');
		proxy.getConfig.mockResolvedValue({ categories: [], misc: { complete_dir: '/complete' } });
		proxy.getWarnings.mockResolvedValue([]);
		proxy.getFullStatus.mockImplementation(() => {
			throw new SabnzbdApiError('Unknown mode: fullstatus');
		});

		const result = await client.test();

		expect(result.success).toBe(true);
		expect(proxy.getFullStatus).toHaveBeenCalled();
	});

	it('continues when warnings endpoint is unsupported for mount-mode clients', async () => {
		const client = new SABnzbdClient({
			host: 'localhost',
			port: 3000,
			useSsl: false,
			apiKey: 'key',
			implementation: 'sabnzbd',
			mountMode: 'nzbdav'
		});
		const proxy = getProxyInstance();
		proxy.getVersion.mockResolvedValue('4.5');
		proxy.getConfig.mockResolvedValue({ categories: [], misc: { complete_dir: '/complete' } });
		proxy.getFullStatus.mockResolvedValue({
			diskspace1: '0',
			diskspace2: '0',
			diskspacetotal1: '0',
			diskspacetotal2: '0'
		});
		proxy.getWarnings.mockImplementation(() => {
			throw new SabnzbdApiError('Unknown mode: warnings');
		});

		const result = await client.test();

		expect(result.success).toBe(true);
		expect(proxy.getWarnings).toHaveBeenCalled();
	});

	it('treats optional diagnostics as non-fatal for standard sabnzbd clients', async () => {
		const client = new SABnzbdClient({
			host: 'localhost',
			port: 8080,
			useSsl: false,
			apiKey: 'key',
			implementation: 'sabnzbd'
		});
		const proxy = getProxyInstance();
		proxy.getVersion.mockResolvedValue('4.5');
		proxy.getConfig.mockResolvedValue({ categories: [], misc: { complete_dir: '/complete' } });
		proxy.getFullStatus.mockImplementation(() => {
			throw new SabnzbdApiError('SABnzbd API returned 400: Bad Request', 400);
		});
		proxy.getWarnings.mockResolvedValue([]);

		const result = await client.test();

		expect(result.success).toBe(true);
	});

	it('remains strict for non-optional diagnostic failures', async () => {
		const client = new SABnzbdClient({
			host: 'localhost',
			port: 8080,
			useSsl: false,
			apiKey: 'key',
			implementation: 'sabnzbd'
		});
		const proxy = getProxyInstance();
		proxy.getVersion.mockResolvedValue('4.5');
		proxy.getConfig.mockResolvedValue({ categories: [], misc: { complete_dir: '/complete' } });
		proxy.getFullStatus.mockImplementation(() => {
			throw new SabnzbdApiError('SABnzbd API returned 500: Internal Server Error', 500);
		});

		const result = await client.test();

		expect(result.success).toBe(false);
		expect(result.error).toContain('500');
	});

	it('falls back to get_cats when get_config omits categories (SAB 5.x, issue #482)', async () => {
		const client = new SABnzbdClient({
			host: 'localhost',
			port: 8080,
			useSsl: false,
			apiKey: 'key',
			implementation: 'sabnzbd'
		});
		const proxy = getProxyInstance();
		proxy.getVersion.mockResolvedValue('5.0.4');
		// SABnzbd 5.x get_config response has no `categories` key at all.
		proxy.getConfig.mockResolvedValue({ misc: { complete_dir: '/complete' } });
		proxy.getFullStatus.mockResolvedValue({
			diskspace1: '0',
			diskspace2: '0',
			diskspacetotal1: '0',
			diskspacetotal2: '0'
		});
		proxy.getWarnings.mockResolvedValue([]);
		proxy.getCategories.mockResolvedValue(['movies', 'tv', 'audio', 'software']);

		const result = await client.test();

		expect(result.success).toBe(true);
		expect(result.details?.categories).toEqual(['movies', 'tv', 'audio', 'software']);
		expect(proxy.getCategories).toHaveBeenCalled();
	});

	it('uses get_config categories when present and skips get_cats', async () => {
		const client = new SABnzbdClient({
			host: 'localhost',
			port: 8080,
			useSsl: false,
			apiKey: 'key',
			implementation: 'sabnzbd'
		});
		const proxy = getProxyInstance();
		proxy.getVersion.mockResolvedValue('4.5');
		proxy.getConfig.mockResolvedValue({
			categories: [
				{ name: 'movies', dir: '/complete/movies' },
				{ name: 'tv', dir: '/complete/tv' }
			],
			misc: { complete_dir: '/complete' }
		});
		proxy.getFullStatus.mockResolvedValue({
			diskspace1: '0',
			diskspace2: '0',
			diskspacetotal1: '0',
			diskspacetotal2: '0'
		});
		proxy.getWarnings.mockResolvedValue([]);

		const result = await client.test();

		expect(result.success).toBe(true);
		expect(result.details?.categories).toEqual(['movies', 'tv']);
		expect(proxy.getCategories).not.toHaveBeenCalled();
	});

	it('succeeds with empty categories when both get_config and get_cats omit them', async () => {
		const client = new SABnzbdClient({
			host: 'localhost',
			port: 8080,
			useSsl: false,
			apiKey: 'key',
			implementation: 'sabnzbd'
		});
		const proxy = getProxyInstance();
		proxy.getVersion.mockResolvedValue('5.0.4');
		proxy.getConfig.mockResolvedValue({ misc: { complete_dir: '/complete' } });
		proxy.getFullStatus.mockResolvedValue({
			diskspace1: '0',
			diskspace2: '0',
			diskspacetotal1: '0',
			diskspacetotal2: '0'
		});
		proxy.getWarnings.mockResolvedValue([]);
		proxy.getCategories.mockResolvedValue([]);

		const result = await client.test();

		expect(result.success).toBe(true);
		expect(result.details?.categories).toEqual([]);
	});
});

describe('SABnzbdClient relative complete_dir resolution (issue #489)', () => {
	function historySlot() {
		return {
			nzo_id: 'nzo-1',
			name: 'Item.Name',
			category: 'movies',
			status: 'Completed',
			storage: '/data/Downloads/complete/Item.Name',
			path: '/data/Downloads/complete/Item.Name',
			bytes: 1_000_000,
			completed: 1_700_000_000
		};
	}

	beforeEach(() => {
		const proxyClass = SABnzbdProxy as unknown as { instances: Array<Record<string, unknown>> };
		proxyClass.instances.length = 0;
	});

	it('marks items completed when complete_dir is relative and downloadPathLocal is configured', async () => {
		const client = new SABnzbdClient({
			host: 'localhost',
			port: 8080,
			useSsl: false,
			apiKey: 'key',
			implementation: 'sabnzbd',
			downloadPathLocal: '/data'
		});
		const proxy = getProxyInstance();
		proxy.getConfig.mockResolvedValue({
			categories: [],
			misc: { complete_dir: 'Downloads/complete' }
		});
		proxy.getHistory.mockResolvedValue({ slots: [historySlot()] });
		proxy.getQueue.mockResolvedValue({ slots: [] });

		const downloads = await client.getDownloads();

		expect(downloads.length).toBe(1);
		expect(downloads[0].status).toBe('completed');
		expect(downloads[0].savePath).toBe('/data/Downloads/complete/Item.Name');
	});

	it('keeps items in postprocessing when relative complete_dir has no local base to resolve against', async () => {
		const client = new SABnzbdClient({
			host: 'localhost',
			port: 8080,
			useSsl: false,
			apiKey: 'key',
			implementation: 'sabnzbd'
		});
		const proxy = getProxyInstance();
		proxy.getConfig.mockResolvedValue({
			categories: [],
			misc: { complete_dir: 'Downloads/complete' }
		});
		proxy.getHistory.mockResolvedValue({ slots: [historySlot()] });
		proxy.getQueue.mockResolvedValue({ slots: [] });

		const downloads = await client.getDownloads();

		expect(downloads.length).toBe(1);
		expect(downloads[0].status).toBe('postprocessing');
	});

	it('does not mangle Windows-style absolute complete_dir when downloadPathLocal is configured', async () => {
		const client = new SABnzbdClient({
			host: 'localhost',
			port: 8080,
			useSsl: false,
			apiKey: 'key',
			implementation: 'sabnzbd',
			downloadPathLocal: '/mnt/sab'
		});
		const proxy = getProxyInstance();
		proxy.getConfig.mockResolvedValue({
			categories: [],
			misc: { complete_dir: 'D:/Downloads/complete' }
		});
		proxy.getHistory.mockResolvedValue({
			slots: [
				{
					...historySlot(),
					storage: 'D:/Downloads/complete/Item.Name',
					path: 'D:/Downloads/complete/Item.Name'
				}
			]
		});
		proxy.getQueue.mockResolvedValue({ slots: [] });

		const downloads = await client.getDownloads();

		expect(downloads.length).toBe(1);
		expect(downloads[0].status).toBe('completed');
		expect(downloads[0].savePath).toBe('D:/Downloads/complete/Item.Name');
	});
});
