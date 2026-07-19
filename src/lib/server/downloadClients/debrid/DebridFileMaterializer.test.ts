import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { link, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DebridFileMaterializer } from './DebridFileMaterializer';

vi.mock('node:fs/promises', async (importOriginal) => {
	const actual = await importOriginal<typeof import('node:fs/promises')>();
	return { ...actual, link: vi.fn(actual.link) };
});

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tempRoot(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'cinephage-materializer-'));
	roots.push(root);
	return root;
}

async function server(handler: (request: IncomingMessage, response: ServerResponse) => void) {
	const instance = createServer(handler);
	await new Promise<void>((resolve) => instance.listen(0, '127.0.0.1', resolve));
	const address = instance.address();
	if (!address || typeof address === 'string') throw new Error('Server did not bind');
	return {
		url: `http://127.0.0.1:${address.port}`,
		close: () => new Promise<void>((resolve) => instance.close(() => resolve()))
	};
}

function plan(root: string, name = 'Movie.mkv') {
	return {
		fileName: name,
		relativePath: name,
		finalPath: join(root, 'Movie', name)
	};
}

function materializer(url: string, size = 11, timeouts = 100) {
	return new DebridFileMaterializer({
		adapter: {
			resolveFreshLink: async (itemId, fileId) => {
				expect([itemId, fileId]).toEqual(['item', 'file']);
				return { url, sizeBytes: size };
			}
		},
		connectTimeoutMs: timeouts,
		readTimeoutMs: timeouts,
		maxRedirects: 2
	});
}

function input(root: string, filePlan = plan(root), overrides: Record<string, unknown> = {}) {
	return {
		providerItemId: 'item',
		providerFileId: 'file',
		providerSizeBytes: 11,
		plan: filePlan,
		rootPath: root,
		...overrides
	};
}

async function hiddenFiles(finalPath: string): Promise<string[]> {
	try {
		return (await readdir(dirname(finalPath))).filter((name) => name.startsWith('.'));
	} catch {
		return [];
	}
}

describe('DebridFileMaterializer', () => {
	it('rejects insecure links and paths outside the trusted library root', async () => {
		const root = await tempRoot();
		const outside = await tempRoot();
		await expect(
			materializer('http://provider.invalid/file.mkv').materialize(input(root))
		).rejects.toThrow(/HTTPS/i);
		await expect(
			materializer('https://provider.invalid/file.mkv').materialize(input(root, plan(outside)))
		).rejects.toThrow(/root|escape/i);
	});

	it('streams through a hidden sibling and refuses an existing destination', async () => {
		const root = await tempRoot();
		const filePlan = plan(root);
		const local = await server((_request, response) => {
			response.writeHead(200, { 'content-length': '11' });
			response.end('hello world');
		});
		try {
			const worker = materializer(`${local.url}/file`);
			expect(await worker.materialize(input(root, filePlan))).toEqual({
				finalPath: filePlan.finalPath,
				sizeBytes: 11,
				createdByAttempt: true,
				replacedExisting: false
			});
			expect(await readFile(filePlan.finalPath, 'utf8')).toBe('hello world');
			expect(await hiddenFiles(filePlan.finalPath)).toEqual([]);
			await expect(worker.materialize(input(root, filePlan))).rejects.toThrow(/collision|clobber/i);
			expect(await readFile(filePlan.finalPath, 'utf8')).toBe('hello world');
		} finally {
			await local.close();
		}
	});

	it('promotes successfully when the filesystem does not support hard links', async () => {
		const root = await tempRoot();
		const filePlan = plan(root);
		const local = await server((_request, response) => response.end('hello world'));
		try {
			vi.mocked(link).mockRejectedValueOnce(
				Object.assign(new Error('operation not supported on socket'), { code: 'ENOTSUP' })
			);
			await expect(
				materializer(`${local.url}/file`).materialize(input(root, filePlan))
			).resolves.toMatchObject({ finalPath: filePlan.finalPath, sizeBytes: 11 });
			expect(await readFile(filePlan.finalPath, 'utf8')).toBe('hello world');
			expect(await hiddenFiles(filePlan.finalPath)).toEqual([]);
		} finally {
			await local.close();
		}
	});

	it('does not follow a symlinked directory or final path', async () => {
		const root = await tempRoot();
		const outside = await tempRoot();
		const filePlan = plan(root);
		await symlink(outside, dirname(filePlan.finalPath));
		await expect(
			materializer('https://provider.invalid/file').materialize(input(root, filePlan))
		).rejects.toThrow(/symlink|escape/i);

		await rm(dirname(filePlan.finalPath));
		await mkdir(dirname(filePlan.finalPath), { recursive: true });
		const target = join(outside, 'target.mkv');
		await writeFile(target, 'existing');
		await symlink(target, filePlan.finalPath);
		await expect(
			materializer('https://provider.invalid/file').materialize(input(root, filePlan))
		).rejects.toThrow(/collision|clobber/i);
	});

	it('cleans temporary files after timeout, truncation, and size mismatch', async () => {
		const root = await tempRoot();
		const local = await server((request, response) => {
			if (request.url === '/slow') {
				response.writeHead(200, { 'content-length': '11' });
				return;
			}
			if (request.url === '/truncated') {
				response.writeHead(200, { 'content-length': '20' });
				response.end('short');
				return;
			}
			response.writeHead(200, { 'content-length': '5' });
			response.end('short');
		});
		try {
			for (const [path, error] of [
				['slow', /timeout|network/i],
				['truncated', /truncat|network|timeout/i],
				['mismatch', /size/i]
			] as const) {
				const filePlan = plan(root, `${path}.mkv`);
				await expect(
					materializer(`${local.url}/${path}`, path === 'mismatch' ? 11 : 11, 20).materialize(
						input(root, filePlan)
					)
				).rejects.toThrow(error);
				expect(await hiddenFiles(filePlan.finalPath)).toEqual([]);
			}
		} finally {
			await local.close();
		}
	});

	it('follows bounded local redirects and rejects hostile or looping redirects', async () => {
		const root = await tempRoot();
		const local = await server((request, response) => {
			if (request.url === '/file') {
				response.writeHead(200, { 'content-length': '11' });
				response.end('hello world');
				return;
			}
			response.writeHead(302, {
				location:
					request.url === '/redirect'
						? '/file'
						: request.url === '/hostile'
							? 'http://provider.invalid/file'
							: '/loop'
			});
			response.end();
		});
		try {
			const goodPlan = plan(root, 'good.mkv');
			await expect(
				materializer(`${local.url}/redirect`).materialize(input(root, goodPlan))
			).resolves.toMatchObject({ sizeBytes: 11 });
			for (const [path, error] of [
				['hostile', /HTTPS/i],
				['loop', /redirect limit/i]
			] as const) {
				await expect(
					materializer(`${local.url}/${path}`).materialize(input(root, plan(root, `${path}.mkv`)))
				).rejects.toThrow(error);
			}
		} finally {
			await local.close();
		}
	});

	it('cancels safely and redacts signed link data from errors', async () => {
		const root = await tempRoot();
		const controller = new AbortController();
		controller.abort();
		const signed = 'http://127.0.0.1/file?token=secret-token&signature=abc123';
		let caught: unknown;
		try {
			await materializer(signed).materialize(
				input(root, plan(root), { signal: controller.signal })
			);
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(Error);
		expect((caught as Error).message).toMatch(/cancel/i);
		expect((caught as Error).message).not.toMatch(/secret-token|signature=|127\.0\.0\.1/i);
		expect(await hiddenFiles(plan(root).finalPath)).toEqual([]);
	});

	it('allows only one concurrent attempt to claim the final path', async () => {
		const root = await tempRoot();
		const filePlan = plan(root);
		const local = await server((_request, response) => response.end('hello world'));
		try {
			const worker = materializer(`${local.url}/file`);
			const results = await Promise.allSettled([
				worker.materialize(input(root, filePlan)),
				worker.materialize(input(root, filePlan))
			]);
			expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
			expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(1);
			expect(await readFile(filePlan.finalPath, 'utf8')).toBe('hello world');
			expect(await hiddenFiles(filePlan.finalPath)).toEqual([]);
		} finally {
			await local.close();
		}
	});
});
