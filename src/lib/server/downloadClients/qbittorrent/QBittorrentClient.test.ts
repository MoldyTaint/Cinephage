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
