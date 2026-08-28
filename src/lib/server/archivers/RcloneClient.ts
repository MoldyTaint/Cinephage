import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ArchiverTestResult } from './types.js';

export interface RcloneClientConfig {
	endpoint: string;
	username?: string | null;
	password?: string | null;
	remote: string;
	basePath?: string | null;
	timeoutSeconds: number;
}

interface RcloneVersionResponse {
	version?: string;
}

export interface RcloneStats {
	bytes?: number;
	totalBytes?: number;
	speed?: number;
	eta?: number | null;
	errors?: number;
	transfers?: number;
	totalTransfers?: number;
	transferring?: Array<{
		name: string;
		bytes: number;
		size: number;
		percentage: number;
		speed: number;
		eta?: number | null;
	}>;
}

export interface RcloneListItem {
	Path?: string;
	Name?: string;
	Size?: number;
	IsDir?: boolean;
}

interface RcloneListResponse {
	list?: RcloneListItem[];
}

interface RcloneStatResponse {
	item?: RcloneListItem | null;
}

export class RcloneClient {
	private readonly endpoint: string;
	private readonly username: string | null;
	private readonly password: string | null;
	private readonly remote: string;
	private readonly basePath: string;
	private readonly timeoutMs: number;

	constructor(config: RcloneClientConfig) {
		const endpoint = new URL(config.endpoint);
		if (!['http:', 'https:'].includes(endpoint.protocol)) {
			throw new Error('Only HTTP and HTTPS rclone RC endpoints are supported');
		}
		if (endpoint.username || endpoint.password) {
			throw new Error('Rclone credentials must not be embedded in the endpoint URL');
		}
		this.endpoint = endpoint.toString().replace(/\/+$/, '');
		this.username = config.username || null;
		this.password = config.password || null;
		this.remote = config.remote.replace(/:$/, '');
		this.basePath = this.normalizeRemotePath(config.basePath ?? '');
		this.timeoutMs = config.timeoutSeconds * 1000;
	}

	async test(): Promise<ArchiverTestResult> {
		try {
			const version = await this.jsonRequest<RcloneVersionResponse>('core/version', {});
			await this.jsonRequest('operations/fsinfo', { fs: this.remoteFs() });
			return { success: true, version: version.version ?? 'unknown' };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error)
			};
		}
	}

	async uploadFile(
		sourcePath: string,
		destinationDirectory = '',
		options: {
			group?: string;
			onProgress?: (bytes: number) => void;
			onRemoteStart?: () => void;
		} = {}
	): Promise<string> {
		const filename = basename(sourcePath);
		const remoteDirectory = this.joinRemotePath(this.basePath, destinationDirectory);
		const remotePath = this.joinRemotePath(remoteDirectory, filename);
		const sourceStat = await stat(sourcePath);
		if (!sourceStat.isFile())
			throw new Error(`Archive source is not a regular file: ${sourcePath}`);
		const sourceSize = sourceStat.size;
		const existing = await this.statFile(remotePath);
		if (existing) {
			throw new Error(`Archive destination already exists: ${this.remote}:${remotePath}`);
		}
		const url = this.buildUrl('operations/uploadfile');
		url.searchParams.set('fs', `${this.remote}:`);
		url.searchParams.set('remote', remoteDirectory);
		if (options.group) url.searchParams.set('_group', options.group);

		const boundary = `cinephage-${randomUUID()}`;
		const safeFilename = filename.replace(/[\r\n"]/g, '_');
		const prefix = Buffer.from(
			`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safeFilename}"\r\nContent-Type: application/octet-stream\r\n\r\n`
		);
		const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
		const body = this.multipartStream(prefix, sourcePath, suffix, options.onProgress);
		const headers = this.headers();
		headers.set('Content-Type', `multipart/form-data; boundary=${boundary}`);
		headers.set('Content-Length', String(prefix.length + sourceSize + suffix.length));

		const response = await this.uploadRequest(url, headers, body, options.onRemoteStart);

		if (!response.ok) throw await this.responseError(response);
		await this.verifyUploadedFile(remotePath, sourceSize);
		return `${this.remote}:${remotePath}`;
	}

	async getStats(group: string): Promise<RcloneStats> {
		return this.jsonRequest<RcloneStats>('core/stats', { group }, 2500);
	}

	async listFiles(directory: string, recurse = true): Promise<RcloneListItem[]> {
		const listingRoot = this.joinRemotePath(this.basePath, directory);
		const response = await this.jsonRequest<RcloneListResponse>(
			'operations/list',
			{
				fs: `${this.remote}:`,
				remote: listingRoot,
				opt: {
					recurse,
					filesOnly: true,
					noModTime: true,
					noMimeType: true
				}
			},
			10_000
		);
		return (response.list ?? [])
			.filter((item) => !item.IsDir)
			.map((item) => ({
				...item,
				Path: item.Path ? this.relativeListingPath(item.Path, listingRoot, directory) : item.Path
			}));
	}

	async statFile(remotePath: string): Promise<RcloneListItem | null> {
		const response = await this.jsonRequest<RcloneStatResponse>('operations/stat', {
			fs: `${this.remote}:`,
			remote: this.normalizeRemotePath(remotePath),
			opt: {
				filesOnly: true,
				noModTime: true,
				noMimeType: true
			}
		});
		return response.item ?? null;
	}

	private async *multipartStream(
		prefix: Buffer,
		sourcePath: string,
		suffix: Buffer,
		onProgress?: (bytes: number) => void
	) {
		yield prefix;
		let bytes = 0;
		for await (const chunk of createReadStream(sourcePath)) {
			bytes += Buffer.byteLength(chunk);
			onProgress?.(bytes);
			yield chunk;
		}
		yield suffix;
	}

	private async uploadRequest(
		url: URL,
		headers: Headers,
		body: AsyncIterable<Buffer>,
		onBodySent?: () => void
	): Promise<Response> {
		try {
			return await new Promise<Response>((resolve, reject) => {
				const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
					url,
					{ method: 'POST', headers: Object.fromEntries(headers.entries()) },
					(response) => {
						const chunks: Buffer[] = [];
						response.on('data', (chunk: Buffer) => chunks.push(chunk));
						response.on('error', reject);
						response.on('end', () => {
							const responseHeaders = new Headers();
							for (let index = 0; index < response.rawHeaders.length; index += 2) {
								responseHeaders.append(
									response.rawHeaders[index]!,
									response.rawHeaders[index + 1]!
								);
							}
							resolve(
								new Response(Buffer.concat(chunks), {
									status: response.statusCode ?? 500,
									statusText: response.statusMessage,
									headers: responseHeaders
								})
							);
						});
					}
				);
				request.setTimeout(this.timeoutMs, () => {
					request.destroy(new Error(`no network activity for ${this.timeoutMs / 1000} seconds`));
				});
				request.on('error', reject);
				void pipeline(Readable.from(body), request).then(onBodySent).catch(reject);
			});
		} catch (error) {
			throw this.transportError('operations/uploadfile', url, error);
		}
	}

	private async jsonRequest<T = Record<string, unknown>>(
		command: string,
		payload: Record<string, unknown>,
		timeoutMs = Math.min(this.timeoutMs, 30_000)
	): Promise<T> {
		const headers = this.headers();
		headers.set('Content-Type', 'application/json');
		const url = this.buildUrl(command);
		const response = await this.fetchRc(command, url, {
			method: 'POST',
			headers,
			body: JSON.stringify(payload),
			signal: AbortSignal.timeout(timeoutMs)
		});
		if (!response.ok) throw await this.responseError(response);
		return (await response.json()) as T;
	}

	private buildUrl(command: string): URL {
		return new URL(`${this.endpoint}/${command}`);
	}

	private async fetchRc(command: string, url: URL, init: RequestInit): Promise<Response> {
		try {
			return await fetch(url, { ...init, redirect: 'error' });
		} catch (error) {
			throw this.transportError(command, url, error);
		}
	}

	private transportError(command: string, url: URL, error: unknown): Error {
		const outerMessage = error instanceof Error ? error.message : String(error);
		const nestedCause = error instanceof Error ? error.cause : undefined;
		const nestedMessage =
			nestedCause instanceof Error
				? nestedCause.message
				: nestedCause && typeof nestedCause === 'object' && 'message' in nestedCause
					? String(nestedCause.message)
					: null;
		const detail =
			nestedMessage && nestedMessage !== outerMessage
				? `${outerMessage}: ${nestedMessage}`
				: outerMessage;
		return new Error(`rclone RC ${command} request to ${url.origin} failed: ${detail}`, {
			cause: error
		});
	}

	private headers(): Headers {
		const headers = new Headers({ Accept: 'application/json' });
		if (this.username || this.password) {
			headers.set(
				'Authorization',
				`Basic ${Buffer.from(`${this.username ?? ''}:${this.password ?? ''}`).toString('base64')}`
			);
		}
		return headers;
	}

	private remoteFs(): string {
		return `${this.remote}:${this.basePath}`;
	}

	private normalizeRemotePath(value: string): string {
		return value.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
	}

	private joinRemotePath(...parts: string[]): string {
		return parts
			.map((part) => this.normalizeRemotePath(part))
			.filter(Boolean)
			.join('/');
	}

	private relativeListingPath(path: string, listingRoot: string, directory: string): string {
		const normalizedPath = this.normalizeRemotePath(path);
		const prefixes = [listingRoot, directory]
			.map((prefix) => this.normalizeRemotePath(prefix))
			.filter(Boolean)
			.sort((left, right) => right.length - left.length);
		for (const prefix of prefixes) {
			if (normalizedPath.startsWith(`${prefix}/`)) {
				return normalizedPath.slice(prefix.length + 1);
			}
		}
		return normalizedPath;
	}

	private async responseError(response: Response): Promise<Error> {
		let detail = response.statusText;
		try {
			const body = (await response.json()) as { error?: string };
			if (body.error) detail = body.error;
		} catch {
			// Keep HTTP status text when rclone did not return JSON.
		}
		return new Error(`rclone RC returned ${response.status}: ${detail}`);
	}

	private async verifyUploadedFile(remotePath: string, expectedSize: number): Promise<void> {
		let lastSize: number | null = null;
		for (let attempt = 0; attempt < 6; attempt += 1) {
			const item = await this.statFile(remotePath);
			if (item && !item.IsDir && item.Size === expectedSize) return;
			lastSize = item?.Size ?? null;
			if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 500));
		}
		throw new Error(
			`Archive verification failed for ${this.remote}:${remotePath}: expected ${expectedSize} bytes, found ${lastSize ?? 'no file'}`
		);
	}
}
