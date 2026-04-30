import { describe, expect, it, vi, afterEach } from 'vitest';
import {
	StalkerPortalClient,
	detectStalkerEndpoint,
	probeStalkerEndpoint,
	type StalkerPortalConfig
} from './StalkerPortalClient';

function createConfig(overrides: Partial<StalkerPortalConfig> = {}): StalkerPortalConfig {
	return {
		portalUrl: 'http://example.com/c',
		macAddress: '00:1A:79:00:00:01',
		serialNumber: 'ABCD12345678',
		deviceId: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
		deviceId2: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
		model: 'MAG254',
		timezone: 'Europe/London',
		...overrides
	};
}

const MOCK_HANDSHAKE_RESPONSE = '{"js":{"token":"TEST"}}';

function mockFetch() {
	return vi
		.spyOn(globalThis, 'fetch')
		.mockImplementation(() =>
			Promise.resolve(new Response(MOCK_HANDSHAKE_RESPONSE, { status: 200 }))
		);
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('detectStalkerEndpoint', () => {
	it('returns portal.php for standard /c URLs', () => {
		expect(detectStalkerEndpoint('http://skunkytv.live/c')).toBe('portal.php');
		expect(detectStalkerEndpoint('http://45.139.122.199:8080/c')).toBe('portal.php');
	});

	it('returns load.php for stalker_portal URLs', () => {
		expect(detectStalkerEndpoint('http://tv.banjotv.tv/stalker_portal/c')).toBe(
			'stalker_portal/server/load.php'
		);
		expect(detectStalkerEndpoint('http://wtc05.mi20.cc/stalker_portal/c')).toBe(
			'stalker_portal/server/load.php'
		);
	});

	it('returns load.php for normalized stalker_portal URLs', () => {
		expect(detectStalkerEndpoint('http://tv.banjotv.tv/stalker_portal')).toBe(
			'stalker_portal/server/load.php'
		);
	});

	it('returns portal.php for URLs without stalker_portal path', () => {
		expect(detectStalkerEndpoint('http://iptv.example.com/portal.php')).toBe('portal.php');
		expect(detectStalkerEndpoint('http://iptv.example.com/stalker_portal.php')).toBe('portal.php');
	});

	it('returns portal.php for plain host URLs', () => {
		expect(detectStalkerEndpoint('http://example.com')).toBe('portal.php');
	});
});

describe('probeStalkerEndpoint', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('returns portal.php when portal.php responds OK for stalker_portal URL', async () => {
		vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
			const urlStr = typeof url === 'string' ? url : url.toString();
			if (urlStr.includes('/stalker_portal/c/portal.php')) {
				return Promise.resolve(new Response('{"js":{"token":"OK"}}', { status: 200 }));
			}
			return Promise.resolve(new Response('', { status: 404 }));
		});

		const result = await probeStalkerEndpoint('http://xp1.tv/stalker_portal/c/');
		expect(result).toBe('portal.php');
	});

	it('returns stalker_portal/server/load.php when that endpoint responds OK', async () => {
		vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
			const urlStr = typeof url === 'string' ? url : url.toString();
			if (urlStr.includes('/stalker_portal/server/load.php')) {
				return Promise.resolve(new Response('{"js":{"token":"OK"}}', { status: 200 }));
			}
			return Promise.resolve(new Response('', { status: 404 }));
		});

		const result = await probeStalkerEndpoint('http://tv.banjotv.tv/stalker_portal/c');
		expect(result).toBe('stalker_portal/server/load.php');
	});

	it('returns heuristic fallback when portal is offline', async () => {
		vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
			Promise.reject(new Error('ECONNREFUSED'))
		);

		const result = await probeStalkerEndpoint('http://offline.example.com/stalker_portal/c');
		expect(result).toBe('stalker_portal/server/load.php');
	});

	it('returns portal.php for standard /c URLs', async () => {
		vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
			const urlStr = typeof url === 'string' ? url : url.toString();
			if (urlStr.includes('/c/portal.php')) {
				return Promise.resolve(new Response('{"js":{"token":"OK"}}', { status: 200 }));
			}
			return Promise.resolve(new Response('', { status: 404 }));
		});

		const result = await probeStalkerEndpoint('http://skunkytv.live/c');
		expect(result).toBe('portal.php');
	});
});

describe('StalkerPortalClient endpoint URL generation', () => {
	it('builds correct handshake URL for standard /c portal', async () => {
		const spy = mockFetch();
		const client = new StalkerPortalClient(createConfig({ portalUrl: 'http://skunkytv.live/c' }));

		await client.handshake();

		const url = spy.mock.calls[0]?.[0] as string;
		expect(url).toContain('/c/portal.php?');
		expect(url).toContain('type=stb');
		expect(url).toContain('action=handshake');
	});

	it('builds correct handshake URL for stalker_portal /c endpoint', async () => {
		const spy = mockFetch();
		const client = new StalkerPortalClient(
			createConfig({ portalUrl: 'http://tv.banjotv.tv/stalker_portal/c' })
		);

		await client.handshake();

		const url = spy.mock.calls[0]?.[0] as string;
		expect(url).toContain('/stalker_portal/server/load.php?');
		expect(url).toContain('type=stb');
		expect(url).toContain('action=handshake');
		expect(url).not.toContain('/c/portal.php');
	});

	it('builds correct handshake URL for stalker_portal with explicit endpoint', async () => {
		const spy = mockFetch();
		const client = new StalkerPortalClient(
			createConfig({
				portalUrl: 'http://tv.banjotv.tv/stalker_portal/c',
				endpoint: 'stalker_portal/server/load.php'
			})
		);

		await client.handshake();

		const url = spy.mock.calls[0]?.[0] as string;
		expect(url).toContain('/stalker_portal/server/load.php?');
		expect(url).not.toContain('/c/portal.php');
	});

	it('builds correct handshake URL for normalized stalker_portal base', async () => {
		const spy = mockFetch();
		const client = new StalkerPortalClient(
			createConfig({ portalUrl: 'http://tv.banjotv.tv/stalker_portal' })
		);

		await client.handshake();

		const url = spy.mock.calls[0]?.[0] as string;
		expect(url).toContain('/stalker_portal/server/load.php?');
	});

	it('builds correct handshake URL for IP:port /c portal', async () => {
		const spy = mockFetch();
		const client = new StalkerPortalClient(
			createConfig({ portalUrl: 'http://45.139.122.199:8080/c' })
		);

		await client.handshake();

		const url = spy.mock.calls[0]?.[0] as string;
		expect(url).toContain(':8080/c/portal.php?');
	});

	it('uses portal.php for URLs without /stalker_portal/ even with explicit endpoint', async () => {
		const spy = mockFetch();
		const client = new StalkerPortalClient(
			createConfig({
				portalUrl: 'http://example.com/c',
				endpoint: 'portal.php'
			})
		);

		await client.handshake();

		const url = spy.mock.calls[0]?.[0] as string;
		expect(url).toContain('/c/portal.php?');
	});

	it('falls back to alternative endpoint on 404 for stalker_portal URLs', async () => {
		const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
			const urlStr = typeof url === 'string' ? url : url.toString();
			if (urlStr.includes('/stalker_portal/server/load.php')) {
				return Promise.resolve(new Response('', { status: 404 }));
			}
			return Promise.resolve(new Response('{"js":{"token":"FALLBACK"}}', { status: 200 }));
		});

		const client = new StalkerPortalClient(
			createConfig({ portalUrl: 'http://xp1.tv/stalker_portal/c' })
		);

		await client.handshake();

		const lastUrl = spy.mock.calls[spy.mock.calls.length - 1]?.[0] as string;
		expect(lastUrl).toContain('/stalker_portal/c/portal.php');
	});
});
