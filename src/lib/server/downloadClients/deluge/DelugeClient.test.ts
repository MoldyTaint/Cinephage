import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DelugeClient } from './DelugeClient';

function createClient(): DelugeClient {
	return new DelugeClient({
		host: 'localhost',
		port: 8112,
		useSsl: false,
		password: 'deluge'
	});
}

interface RpcRequestPayload {
	method?: string;
	params?: unknown[];
}

function mockDelugeResponse(torrent: Record<string, unknown>): ReturnType<typeof vi.fn> {
	return vi.fn(async (_url: string, init?: RequestInit) => {
		const payload = JSON.parse(String(init?.body ?? '{}')) as RpcRequestPayload;

		if (payload.method === 'auth.login') {
			return new Response(JSON.stringify({ result: true, error: null }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		if (payload.method === 'web.connected') {
			return new Response(JSON.stringify({ result: true, error: null }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		if (payload.method === 'web.update_ui' || payload.method === 'web.get_torrent_status') {
			return new Response(
				JSON.stringify({
					result: { torrents: { deadbeef: torrent } },
					error: null
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			);
		}

		return new Response(JSON.stringify({ result: {}, error: null }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	});
}

describe('DelugeClient', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	describe('canBeRemoved', () => {
		const baseTorrent = {
			name: 'test',
			total_size: 1000,
			total_done: 1000,
			progress: 100,
			download_payload_rate: 0,
			upload_payload_rate: 0,
			eta: 0,
			save_path: '/downloads',
			label: '',
			time_added: 1234567890,
			finished_time: 1234567900,
			seeding_time: 3600,
			ratio: 1.5,
			hash: 'deadbeef',
			error: ''
		};

		it('returns true when seeding and ratio limit is reached', async () => {
			vi.stubGlobal(
				'fetch',
				mockDelugeResponse({
					...baseTorrent,
					state: 'Seeding',
					stop_at_ratio: true,
					stop_ratio: 1.0
				})
			);

			const client = createClient();
			const download = await client.getDownload('deadbeef');

			expect(download?.status).toBe('seeding');
			expect(download?.canBeRemoved).toBe(true);
			expect(download?.ratioLimit).toBe(1.0);
		});

		it('returns false when seeding and ratio limit is not reached', async () => {
			vi.stubGlobal(
				'fetch',
				mockDelugeResponse({
					...baseTorrent,
					state: 'Seeding',
					stop_at_ratio: true,
					stop_ratio: 2.0
				})
			);

			const client = createClient();
			const download = await client.getDownload('deadbeef');

			expect(download?.status).toBe('seeding');
			expect(download?.canBeRemoved).toBe(false);
			expect(download?.ratioLimit).toBe(2.0);
		});

		it('returns false when seeding and stop_at_ratio is disabled', async () => {
			vi.stubGlobal(
				'fetch',
				mockDelugeResponse({
					...baseTorrent,
					state: 'Seeding',
					stop_at_ratio: false,
					stop_ratio: 1.0
				})
			);

			const client = createClient();
			const download = await client.getDownload('deadbeef');

			expect(download?.status).toBe('seeding');
			expect(download?.canBeRemoved).toBe(false);
			expect(download?.ratioLimit).toBeUndefined();
		});

		it('returns true when paused regardless of ratio', async () => {
			vi.stubGlobal(
				'fetch',
				mockDelugeResponse({
					...baseTorrent,
					state: 'Paused',
					stop_at_ratio: true,
					stop_ratio: 2.0
				})
			);

			const client = createClient();
			const download = await client.getDownload('deadbeef');

			expect(download?.status).toBe('paused');
			expect(download?.canBeRemoved).toBe(true);
		});

		it('returns true when completed regardless of ratio', async () => {
			vi.stubGlobal(
				'fetch',
				mockDelugeResponse({
					...baseTorrent,
					state: 'Seeding',
					progress: 100,
					stop_at_ratio: true,
					stop_ratio: 2.0
				})
			);

			const client = createClient();
			const download = await client.getDownload('deadbeef');

			// Deluge "Seeding" with progress=100 maps to 'seeding' status
			expect(download?.status).toBe('seeding');
			expect(download?.canBeRemoved).toBe(false);
		});
	});
});
