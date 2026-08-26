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

export class RcloneClient {
	private readonly endpoint: string;
	private readonly username: string | null;
	private readonly password: string | null;
	private readonly remote: string;
	private readonly basePath: string;
	private readonly timeoutMs: number;

	constructor(config: RcloneClientConfig) {
		this.endpoint = config.endpoint.replace(/\/+$/, '');
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
		const sourceSize = (await stat(sourcePath)).size;
		const headers = this.headers();
		headers.set('Content-Type', `multipart/form-data; boundary=${boundary}`);
		headers.set('Content-Length', String(prefix.length + sourceSize + suffix.length));

		const response = await this.uploadRequest(url, headers, body, options.onRemoteStart);

		if (!response.ok) throw await this.responseError(response);
		return `${this.remote}:${this.joinRemotePath(remoteDirectory, filename)}`;
	}

	async getStats(group: string): Promise<RcloneStats> {
		return this.jsonRequest<RcloneStats>('core/stats', { group }, 2500);
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
			return await fetch(url, init);
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
}
