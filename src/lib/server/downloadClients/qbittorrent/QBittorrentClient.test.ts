import { afterEach, describe, expect, it, vi } from 'vitest';
import { QBittorrentClient } from './QBittorrentClient';

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('QBittorrentClient sequential download', () => {
	it.each([
		[true, 'true'],
		[false, null]
	] as const)('sends the add option only when enabled (%s)', async (enabled, expected) => {
		let addBody: FormData | undefined;
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
				if (String(url).endsWith('/api/v2/auth/login')) {
					return new Response('Ok.', {
						status: 200,
						headers: { 'set-cookie': 'SID=test-session; path=/' }
					});
				}
				if (String(url).endsWith('/api/v2/torrents/add')) {
					addBody = init?.body as FormData;
					return new Response('Ok.', { status: 200 });
				}
				throw new Error(`Unexpected qBittorrent request: ${String(url)}`);
			})
		);

		const client = new QBittorrentClient({
			host: 'localhost',
			port: 8080,
			useSsl: false,
			sequentialDownload: enabled
		});

		await client.addDownload({
			downloadUrl: 'https://example.com/test.torrent',
			category: 'movies'
		});

		expect(addBody?.get('sequentialDownload')).toBe(expected);
	});
});

describe('QBittorrentClient add response parsing', () => {
	function stubAddResponse(body: string, status = 200): void {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string | URL | Request) => {
				if (String(url).endsWith('/api/v2/auth/login')) {
					return new Response('Ok.', {
						status: 200,
						headers: { 'set-cookie': 'SID=test-session; path=/' }
					});
				}
				if (String(url).endsWith('/api/v2/torrents/add')) {
					return new Response(body, { status });
				}
				throw new Error(`Unexpected qBittorrent request: ${String(url)}`);
			})
		);
	}

	function createClient(): QBittorrentClient {
		return new QBittorrentClient({
			host: 'localhost',
			port: 8080,
			useSsl: false
		});
	}

	it('accepts a successful WebAPI v2.14 response containing failure_count', async () => {
		stubAddResponse(
			JSON.stringify({
				added_torrent_ids: ['3e0e520f8ac598a94539458192f71cbd01857c1e'],
				failure_count: 0,
				pending_count: 0,
				success_count: 1
			})
		);

		await expect(
			createClient().addDownload({ downloadUrl: 'https://example.com/test.torrent' })
		).resolves.toBe('3e0e520f8ac598a94539458192f71cbd01857c1e');
	});

	it('accepts a pending WebAPI v2.14 response', async () => {
		stubAddResponse(
			JSON.stringify({
				added_torrent_ids: [],
				failure_count: 0,
				pending_count: 1,
				success_count: 0
			}),
			202
		);

		await expect(
			createClient().addDownload({ downloadUrl: 'https://example.com/test.torrent' })
		).resolves.toBe('');
	});

	it('rejects a failed WebAPI v2.14 response', async () => {
		stubAddResponse(
			JSON.stringify({
				added_torrent_ids: [],
				failure_count: 1,
				pending_count: 0,
				success_count: 0
			})
		);

		await expect(
			createClient().addDownload({ downloadUrl: 'https://example.com/test.torrent' })
		).rejects.toThrow('qBittorrent rejected the torrent');
	});

	it('continues to reject the legacy Fails. response', async () => {
		stubAddResponse('Fails.');

		await expect(
			createClient().addDownload({ downloadUrl: 'https://example.com/test.torrent' })
		).rejects.toThrow('qBittorrent rejected the torrent: Fails.');
	});
});
