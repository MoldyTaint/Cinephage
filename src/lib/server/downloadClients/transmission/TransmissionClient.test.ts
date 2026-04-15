import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TransmissionClient } from './TransmissionClient';

interface RpcRequestPayload {
	method?: string;
	arguments?: Record<string, unknown>;
}

function createClient(): TransmissionClient {
	return new TransmissionClient({
		host: 'localhost',
		port: 9091,
		useSsl: false
	});
}

function mockRpcAddSuccess(payloads: RpcRequestPayload[]): ReturnType<typeof vi.fn> {
	return vi.fn(async (_url: string, init?: RequestInit) => {
		const payload = JSON.parse(String(init?.body ?? '{}')) as RpcRequestPayload;
		payloads.push(payload);

		if (payloads.length === 1) {
			return new Response(null, {
				status: 409,
				headers: { 'X-Transmission-Session-Id': 'session-1' }
			});
		}

		return new Response(
			JSON.stringify({
				result: 'success',
				arguments: {
					'torrent-added': {
						id: 42,
						name: 'test',
						hashString: 'deadbeef'
					}
				}
			}),
			{
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	});
}

describe('TransmissionClient', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('prefers torrent file metainfo over magnet or download URL when available', async () => {
		const payloads: RpcRequestPayload[] = [];
		vi.stubGlobal('fetch', mockRpcAddSuccess(payloads));

		const client = createClient();
		const torrentFile = Buffer.from('dummy-torrent-file');

		const hash = await client.addDownload({
			torrentFile,
			magnetUri: 'magnet:?xt=urn:btih:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
			downloadUrl: 'https://example.com/file.torrent',
			category: 'tv'
		});

		expect(hash).toBe('deadbeef');
		expect(payloads).toHaveLength(2);
		expect(payloads[1].method).toBe('torrent-add');
		expect(payloads[1].arguments?.metainfo).toBe(torrentFile.toString('base64'));
		expect(payloads[1].arguments?.filename).toBeUndefined();
	});

	it('uses magnet URI when torrent file is unavailable', async () => {
		const payloads: RpcRequestPayload[] = [];
		vi.stubGlobal('fetch', mockRpcAddSuccess(payloads));

		const client = createClient();
		const magnetUri = 'magnet:?xt=urn:btih:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

		const hash = await client.addDownload({
			magnetUri,
			downloadUrl: 'https://example.com/file.torrent',
			category: 'tv'
		});

		expect(hash).toBe('deadbeef');
		expect(payloads).toHaveLength(2);
		expect(payloads[1].method).toBe('torrent-add');
		expect(payloads[1].arguments?.filename).toBe(magnetUri);
		expect(payloads[1].arguments?.metainfo).toBeUndefined();
	});
});
