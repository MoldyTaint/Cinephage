import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NZBMountClient } from './NZBMountClient';
import { SABnzbdProxy, SabnzbdApiError } from '../sabnzbd/SABnzbdProxy';

vi.mock('../sabnzbd/SABnzbdProxy', () => {
	class SabnzbdApiError extends Error {
		constructor(message: string) {
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

describe('NZBMountClient test routine', () => {
	beforeEach(() => {
		const proxyClass = SABnzbdProxy as unknown as { instances: Array<Record<string, unknown>> };
		proxyClass.instances.length = 0;
	});

	it('skips fullstatus for altmount', async () => {
		const client = new NZBMountClient({
			host: 'localhost',
			port: 3000,
			useSsl: false,
			apiKey: 'key',
			mountMode: 'altmount'
		});
		const proxy = getProxyInstance();
		proxy.getVersion.mockResolvedValue('4.5');
		proxy.getConfig.mockResolvedValue({ categories: [], misc: { complete_dir: '/complete' } });
		proxy.getWarnings.mockResolvedValue([]);
		proxy.getFullStatus.mockImplementation(() => {
			throw new Error('fullstatus should not be called');
		});

		const result = await client.test();

		expect(result.success).toBe(true);
		expect(proxy.getFullStatus).not.toHaveBeenCalled();
	});

	it('continues when fullstatus returns unknown mode for nzbdav', async () => {
		const client = new NZBMountClient({
			host: 'localhost',
			port: 3000,
			useSsl: false,
			apiKey: 'key',
			mountMode: 'nzbdav'
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
	});

	it('continues when warnings endpoint is unsupported', async () => {
		const client = new NZBMountClient({
			host: 'localhost',
			port: 3000,
			useSsl: false,
			apiKey: 'key',
			mountMode: 'altmount'
		});
		const proxy = getProxyInstance();
		proxy.getVersion.mockResolvedValue('4.5');
		proxy.getConfig.mockResolvedValue({ categories: [], misc: { complete_dir: '/complete' } });
		proxy.getWarnings.mockImplementation(() => {
			throw new SabnzbdApiError('Unknown mode: warnings');
		});

		const result = await client.test();

		expect(result.success).toBe(true);
	});
});
