import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDebridAdapter, isDebridError, type RealDebridAdapter } from './debrid-adapter';

const RD_TOKEN = 'rd-secret-token';
const TB_TOKEN = 'tb-secret-token';
const json = (body: unknown, status = 200, headers?: HeadersInit) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json', ...headers }
	});
const capability = (token: string) => ({
	storedClientId: `client-${token.slice(0, 2)}`,
	tokenLoader: async () => token
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('debrid provider adapters', () => {
	it('runs the complete Real-Debrid contract with late auth and all-file selection', async () => {
		const calls: Array<{ url: string; init?: RequestInit }> = [];
		let selected = false;
		const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
			const url = String(input);
			calls.push({ url, init });
			if (url.endsWith('/user')) return json({ id: 1, username: 'user' });
			if (url.includes('/torrents?')) return json([{ id: 'rd-1', hash: 'a'.repeat(40) }]);
			if (url.endsWith('/torrents/addMagnet')) return json({ id: 'rd-1' }, 201);
			if (url.includes('/selectFiles/')) {
				selected = true;
				return new Response(null, { status: 204 });
			}
			if (url.includes('/torrents/info/'))
				return json({
					id: 'rd-1',
					status: selected ? 'downloaded' : 'waiting_files_selection',
					progress: selected ? 100 : 0,
					links: selected ? ['https://provider.test/intermediate'] : [],
					files: [{ id: 1, path: '/Movie.mkv', bytes: 10, selected: selected ? 1 : 0 }]
				});
			if (url.endsWith('/unrestrict/link'))
				return json({ download: 'https://cdn.test/movie', filename: 'Movie.mkv', filesize: 10 });
			if (url.includes('/torrents/delete/')) return new Response(null, { status: 204 });
			return json({}, 404);
		});
		vi.stubGlobal('fetch', fetch);

		const adapter = createDebridAdapter('realdebrid', capability(RD_TOKEN)) as RealDebridAdapter;
		await expect(adapter.testCredentials()).resolves.toMatchObject({ accountId: '1' });
		await expect(adapter.findByInfoHash('a'.repeat(40))).resolves.toBe('rd-1');
		await expect(
			adapter.submit({ kind: 'magnet', magnet: 'magnet:?xt=urn:btih:demo' })
		).resolves.toEqual({ providerItemId: 'rd-1' });
		await expect(adapter.inspect('rd-1')).resolves.toMatchObject({
			readiness: 'ready',
			files: [{ providerFileId: '1', name: 'Movie.mkv' }]
		});
		await expect(adapter.resolveFreshLink('rd-1', '1')).resolves.toEqual({
			url: 'https://cdn.test/movie',
			filename: 'Movie.mkv',
			sizeBytes: 10
		});
		await expect(adapter.delete('rd-1')).resolves.toEqual({ outcome: 'deleted' });
		expect(calls.every((call) => call.init?.redirect === 'manual')).toBe(true);
		expect(
			calls.every(
				(call) => new Headers(call.init?.headers).get('authorization') === `Bearer ${RD_TOKEN}`
			)
		).toBe(true);
		expect(calls.find((call) => call.url.includes('/selectFiles/'))?.init?.body).toBe('files=all');
		expect(JSON.stringify(adapter)).not.toContain(RD_TOKEN);
	});

	it('runs the complete TorBox contract and keeps requestdl credentials query-only', async () => {
		const calls: Array<{ url: string; init?: RequestInit }> = [];
		const envelope = (data: unknown) => json({ success: true, error: null, detail: null, data });
		const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
			const url = String(input);
			calls.push({ url, init });
			if (url.includes('/user/me')) return envelope({ id: 2, plan: 1 });
			if (url.includes('/createtorrent'))
				return envelope({ torrent_id: 7, hash: 'b'.repeat(40), auth_id: 'auth' });
			if (url.includes('/mylist'))
				return envelope([
					{
						id: 7,
						hash: 'b'.repeat(40),
						download_state: 'completed',
						download_finished: true,
						download_present: true,
						files: [{ id: 3, name: 'Show.S01E01.mkv', size: 20 }]
					}
				]);
			if (url.includes('/requestdl')) return envelope('https://cdn.test/episode');
			if (url.includes('/controltorrent')) return envelope(null);
			return json({}, 404);
		});
		vi.stubGlobal('fetch', fetch);

		const adapter = createDebridAdapter('torbox', capability(TB_TOKEN));
		await expect(adapter.testCredentials()).resolves.toMatchObject({ accountId: '2' });
		await expect(adapter.findByInfoHash('b'.repeat(40))).resolves.toBe('7');
		await expect(
			adapter.submit({ kind: 'torrent', bytes: new Uint8Array([1]), filename: 'show.torrent' })
		).resolves.toEqual({ providerItemId: '7' });
		await expect(adapter.inspect('7')).resolves.toMatchObject({ readiness: 'ready' });
		await expect(adapter.resolveFreshLink('7', '3')).resolves.toEqual({
			url: 'https://cdn.test/episode'
		});
		await expect(adapter.delete('7')).resolves.toEqual({ outcome: 'deleted' });
		const direct = calls.find((call) => call.url.includes('/requestdl'))!;
		expect(direct.url).toContain(`token=${TB_TOKEN}`);
		expect(new Headers(direct.init?.headers).has('authorization')).toBe(false);
		expect(direct.url).toContain('zip_link=false');
		expect(calls.find((call) => call.url.includes('/controltorrent'))?.init?.body).toBe(
			JSON.stringify({ operation: 'delete', torrent_id: 7 })
		);
	});

	it('treats a cached TorBox item with present finished files as ready', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				json({
					success: true,
					error: null,
					detail: null,
					data: {
						id: 7,
						download_state: 'cached',
						download_finished: true,
						download_present: true,
						files: [{ id: 3, name: 'Movie.mkv', size: 20 }]
					}
				})
			)
		);

		const adapter = createDebridAdapter('torbox', capability(TB_TOKEN));
		await expect(adapter.inspect('7')).resolves.toMatchObject({
			providerState: 'cached',
			readiness: 'ready'
		});
	});

	it('retries safe reads but never retries an ambiguous submission', async () => {
		vi.spyOn(Math, 'random').mockReturnValue(0);
		let reads = 0;
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: string | URL | Request) => {
				if (String(input).endsWith('/user')) {
					reads++;
					return reads < 3 ? json({}, 503) : json({ id: 1, username: 'ok' });
				}
				return json({}, 500);
			})
		);
		const adapter = createDebridAdapter('realdebrid', capability(RD_TOKEN));
		await expect(adapter.testCredentials()).resolves.toMatchObject({ valid: true });
		expect(reads).toBe(3);
		await expect(
			adapter.submit({ kind: 'magnet', magnet: 'magnet:?xt=urn:btih:demo' })
		).rejects.toSatisfy(
			(error: unknown) => isDebridError(error) && error.kind === 'ambiguous_submission'
		);
		expect(
			vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes('/addMagnet'))
		).toHaveLength(1);
	});

	it('fails closed on redirects and malformed file metadata without leaking secrets', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(null, { status: 302 }))
		);
		const redirected = createDebridAdapter('realdebrid', capability(RD_TOKEN));
		await expect(redirected.testCredentials()).rejects.toSatisfy((error: unknown) => {
			expect(JSON.stringify(error)).not.toContain(RD_TOKEN);
			return isDebridError(error) && error.kind === 'redirect';
		});

		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				json({
					id: 'rd-1',
					status: 'downloaded',
					links: ['https://provider.test/link'],
					files: [{ id: 1.5, path: '/Movie.mkv', bytes: 10, selected: 1 }]
				})
			)
		);
		const malformed = createDebridAdapter('realdebrid', capability(RD_TOKEN));
		await expect(malformed.inspect('rd-1')).rejects.toSatisfy(
			(error: unknown) => isDebridError(error) && error.kind === 'provider_contract'
		);
	});

	it('normalizes authentication and TorBox terminal/delete outcomes', async () => {
		const responses = [
			json({ success: false, error: 'BAD_TOKEN', detail: TB_TOKEN, data: null }, 403),
			json({ success: false, error: 'MONTHLY_LIMIT', detail: TB_TOKEN, data: null }, 400),
			json({ success: false, error: 'ITEM_NOT_FOUND', detail: TB_TOKEN, data: null }, 404)
		];
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => responses.shift()!)
		);
		const adapter = createDebridAdapter('torbox', capability(TB_TOKEN));
		await expect(adapter.testCredentials()).rejects.toSatisfy(
			(error: unknown) => isDebridError(error) && error.kind === 'authentication'
		);
		await expect(
			adapter.submit({ kind: 'magnet', magnet: 'magnet:?xt=urn:btih:demo' })
		).rejects.toSatisfy((error: unknown) => isDebridError(error) && error.kind === 'terminal');
		await expect(adapter.delete('7')).resolves.toEqual({ outcome: 'already_absent' });
	});
});
