import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dnsLookupMock = vi.hoisted(() => vi.fn());

vi.mock('node:dns', () => ({
	promises: { lookup: dnsLookupMock }
}));

import { fetchWithTimeout, resolveAndValidateUrl } from './ssrf-protection';

describe('fetchWithTimeout signal handling', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		dnsLookupMock.mockReset();
	});

	it('composes the supplied signal with the timeout signal', async () => {
		const external = new AbortController();
		let requestSignal: AbortSignal | undefined;
		vi.stubGlobal(
			'fetch',
			vi.fn((_url: string, options: RequestInit) => {
				requestSignal = options.signal as AbortSignal;
				return new Promise<Response>((_resolve, reject) => {
					requestSignal?.addEventListener(
						'abort',
						() => reject(new DOMException('Aborted', 'AbortError')),
						{
							once: true
						}
					);
				});
			})
		);

		const pending = fetchWithTimeout(
			'https://cdn.test/stream',
			{ signal: external.signal },
			10_000
		);
		external.abort();

		await expect(pending).rejects.toThrow('Aborted');
		expect(requestSignal?.aborted).toBe(true);
	});
});

describe('resolveAndValidateUrl DNS safety', () => {
	beforeEach(() => dnsLookupMock.mockReset());

	it('rejects a hostname when any DNS result is private', async () => {
		dnsLookupMock.mockResolvedValue([
			{ address: '93.184.216.34', family: 4 },
			{ address: '192.168.1.20', family: 4 }
		]);

		await expect(resolveAndValidateUrl('https://mixed.example/stream')).resolves.toMatchObject({
			safe: false,
			reason: expect.stringContaining('192.168.1.20')
		});
		expect(dnsLookupMock).toHaveBeenCalledWith('mixed.example', { all: true, verbatim: true });
	});

	it('preserves safe hostname and literal IP behavior', async () => {
		dnsLookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);

		await expect(resolveAndValidateUrl('https://public.example/stream')).resolves.toEqual({
			safe: true
		});
		await expect(resolveAndValidateUrl('https://127.0.0.1/stream')).resolves.toMatchObject({
			safe: false
		});
		expect(dnsLookupMock).toHaveBeenCalledTimes(1);
	});

	it.each(['https://[::1]/stream', 'https://[::ffff:127.0.0.1]/stream'])(
		'rejects private bracketed IPv6 literal %s',
		async (url) => {
			await expect(resolveAndValidateUrl(url)).resolves.toMatchObject({
				safe: false,
				reason: 'Private/internal IP address'
			});
			expect(dnsLookupMock).not.toHaveBeenCalled();
		}
	);
});
