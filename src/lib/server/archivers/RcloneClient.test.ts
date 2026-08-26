import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
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
		let requestHeaders = new Headers();
		const progress: number[] = [];
		const remoteJobs: number[] = [];
		const fetchMock = vi
			.fn()
			.mockResolvedValue(Response.json({ finished: true, success: true, error: '' }));
		vi.stubGlobal('fetch', fetchMock);
		const server = createServer(async (request, response) => {
			requestUrl = `http://${request.headers.host}${request.url}`;
			requestHeaders = new Headers(request.headers as Record<string, string>);
			const chunks: Buffer[] = [];
			for await (const chunk of request) chunks.push(Buffer.from(chunk));
			requestBody = Buffer.concat(chunks);
			response.setHeader('Content-Type', 'application/json');
			response.end('{"jobid":42}');
		});
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
		const address = server.address();
		if (!address || typeof address === 'string') throw new Error('Test server did not bind');

		try {
			const destination = await createClient(`http://127.0.0.1:${address.port}`).uploadFile(
				sourcePath,
				'Movie',
				{
					group: 'cinephage/archive/job-id',
					onProgress: (bytes) => progress.push(bytes),
					onRemoteStart: (jobid) => remoteJobs.push(jobid)
				}
			);

			const parsedUrl = new URL(requestUrl);
			expect(parsedUrl.pathname).toBe('/operations/uploadfile');
			expect(parsedUrl.searchParams.get('fs')).toBe('archive:');
			expect(parsedUrl.searchParams.get('remote')).toBe('Media/Movie');
			expect(parsedUrl.searchParams.get('_group')).toBe('cinephage/archive/job-id');
			expect(parsedUrl.searchParams.get('_async')).toBe('true');
			expect(requestBody.toString()).toContain('filename="Movie.mkv"');
			expect(requestBody.toString()).toContain('video');
			expect(Number(requestHeaders.get('Content-Length'))).toBe(requestBody.length);
			expect(progress.at(-1)).toBe(5);
			expect(remoteJobs).toEqual([42]);
			expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toEqual({
				jobid: 42
			});
			expect(destination).toBe('archive:Media/Movie/Movie.mkv');
		} finally {
			await new Promise<void>((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve()))
			);
			await rm(directory, { recursive: true, force: true });
		}
	});

	it('includes the RC command and endpoint when the transport fails', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockRejectedValue(
				new TypeError('fetch failed', {
					cause: new Error('ECONNREFUSED')
				})
			)
		);

		await expect(createClient().getStats('cinephage/archive/job-id')).rejects.toThrow(
			'rclone RC core/stats request to http://rclone:5572 failed: fetch failed: ECONNREFUSED'
		);
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

function createClient(endpoint = 'http://rclone:5572/'): RcloneClient {
	return new RcloneClient({
		endpoint,
		username: 'cinephage',
		password: 'secret',
		remote: 'archive:',
		basePath: '/Media/',
		timeoutSeconds: 60
	});
}
