import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RcloneClient } from './RcloneClient.js';

describe('RcloneClient', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('tests the RC endpoint and configured remote with basic authentication', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(Response.json({ version: 'v1.72.0' }))
			.mockResolvedValueOnce(Response.json({ Features: {} }));
		vi.stubGlobal('fetch', fetchMock);

		const result = await createClient().test();

		expect(result).toEqual({ success: true, version: 'v1.72.0' });
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://rclone:5572/core/version');
		const firstRequest = fetchMock.mock.calls[0]?.[1] as RequestInit;
		const secondRequest = fetchMock.mock.calls[1]?.[1] as RequestInit;
		expect(new Headers(firstRequest.headers).get('Authorization')).toBe(
			`Basic ${Buffer.from('cinephage:secret').toString('base64')}`
		);
		expect(JSON.parse(String(secondRequest.body))).toEqual({
			fs: 'archive:Media'
		});
	});

	it('streams a mounted source file to operations/uploadfile with an rclone stats group', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'cinephage-rclone-'));
		const sourcePath = join(directory, 'Movie.mkv');
		await writeFile(sourcePath, 'video');
		let requestUrl = '';
		let requestBody = Buffer.alloc(0);
		const progress: number[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: URL, init: RequestInit) => {
				requestUrl = String(url);
				const chunks: Buffer[] = [];
				for await (const chunk of init.body as unknown as AsyncIterable<Buffer>) chunks.push(chunk);
				requestBody = Buffer.concat(chunks);
				return Response.json({});
			})
		);

		try {
			const destination = await createClient().uploadFile(sourcePath, 'Movie', {
				group: 'cinephage/archive/job-id',
				onProgress: (bytes) => progress.push(bytes)
			});

			const parsedUrl = new URL(requestUrl);
			expect(parsedUrl.pathname).toBe('/operations/uploadfile');
			expect(parsedUrl.searchParams.get('fs')).toBe('archive:');
			expect(parsedUrl.searchParams.get('remote')).toBe('Media/Movie');
			expect(parsedUrl.searchParams.get('_group')).toBe('cinephage/archive/job-id');
			expect(requestBody.toString()).toContain('filename="Movie.mkv"');
			expect(requestBody.toString()).toContain('video');
			expect(progress.at(-1)).toBe(5);
			expect(destination).toBe('archive:Media/Movie/Movie.mkv');
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it('requests process statistics for the archive group', async () => {
		const fetchMock = vi.fn().mockResolvedValue(Response.json({ bytes: 100, totalBytes: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		await expect(createClient().getStats('cinephage/archive/job-id')).resolves.toEqual({
			bytes: 100,
			totalBytes: 200
		});
		const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
		expect(JSON.parse(String(request.body))).toEqual({
			group: 'cinephage/archive/job-id'
		});
	});
});

function createClient(): RcloneClient {
	return new RcloneClient({
		endpoint: 'http://rclone:5572/',
		username: 'cinephage',
		password: 'secret',
		remote: 'archive:',
		basePath: '/Media/',
		timeoutSeconds: 60
	});
}
