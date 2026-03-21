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
});
