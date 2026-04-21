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

function mockRpcTorrentGet(
	mockTorrent: Record<string, unknown>,
	statusOverride?: number
): ReturnType<typeof vi.fn> {
	return vi.fn(async (_url: string, init?: RequestInit) => {
		const payload = JSON.parse(String(init?.body ?? '{}')) as RpcRequestPayload;

		if (payload.method === 'session-get') {
			return new Response(
				JSON.stringify({
					result: 'success',
					arguments: {
						version: '4.0.6',
						'rpc-version': 17,
						'download-dir': '/downloads'
					}
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			);
		}

		const torrent = { ...mockTorrent };
		if (statusOverride !== undefined) {
			torrent.status = statusOverride;
		}

		return new Response(
			JSON.stringify({
				result: 'success',
				arguments: {
					torrents: [torrent]
				}
			}),
			{ status: 200, headers: { 'Content-Type': 'application/json' } }
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

	describe('canBeRemoved', () => {
		const baseTorrent = {
			id: 1,
			name: 'test',
			hashString: 'deadbeef',
			percentDone: 1,
			totalSize: 1000,
			rateDownload: 0,
			rateUpload: 0,
			eta: -1,
			downloadDir: '/downloads',
			labels: [],
			addedDate: 1234567890,
			doneDate: 1234567900,
			secondsSeeding: 3600,
			uploadRatio: 1.5,
			seedRatioLimit: 2.0,
			seedIdleLimit: 60,
			seedIdleMode: 1,
			error: 0,
			errorString: ''
		};

		it('returns true when seeding and isFinished is true', async () => {
			vi.stubGlobal('fetch', mockRpcTorrentGet({ ...baseTorrent, status: 6, isFinished: true }));

			const client = createClient();
			const download = await client.getDownload('deadbeef');

			expect(download?.status).toBe('seeding');
			expect(download?.canBeRemoved).toBe(true);
		});

		it('returns false when seeding and isFinished is false', async () => {
			vi.stubGlobal('fetch', mockRpcTorrentGet({ ...baseTorrent, status: 6, isFinished: false }));

			const client = createClient();
			const download = await client.getDownload('deadbeef');

			expect(download?.status).toBe('seeding');
			expect(download?.canBeRemoved).toBe(false);
		});

		it('returns true when completed regardless of isFinished', async () => {
			vi.stubGlobal('fetch', mockRpcTorrentGet({ ...baseTorrent, status: 0, isFinished: false }));

			const client = createClient();
			const download = await client.getDownload('deadbeef');

			expect(download?.status).toBe('completed');
			expect(download?.canBeRemoved).toBe(true);
		});

		it('returns false when downloading', async () => {
			vi.stubGlobal(
				'fetch',
				mockRpcTorrentGet({ ...baseTorrent, status: 4, isFinished: false, percentDone: 0.5 })
			);

			const client = createClient();
			const download = await client.getDownload('deadbeef');

			expect(download?.status).toBe('downloading');
			expect(download?.canBeRemoved).toBe(false);
		});

		it('returns true when paused', async () => {
			vi.stubGlobal(
				'fetch',
				mockRpcTorrentGet({ ...baseTorrent, status: 0, isFinished: false, percentDone: 0 })
			);

			const client = createClient();
			const download = await client.getDownload('deadbeef');

			expect(download?.status).toBe('paused');
			expect(download?.canBeRemoved).toBe(true);
		});
	});
});
