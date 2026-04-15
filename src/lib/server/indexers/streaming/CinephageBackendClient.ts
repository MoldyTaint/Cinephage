import { logger } from '$lib/logging';
import type { StreamSource, StreamSubtitle, StreamType } from '$lib/server/streaming/types';
import { getStreamingIndexerSettings } from '$lib/server/streaming/settings';

const streamLog = { logDomain: 'streams' as const };

const CINEPHAGE_API_BASE_URL = 'https://api.cinephage.net';

interface CinephageBackendConfig {
	baseUrl: string;
	commit?: string;
	version?: string;
	missing: string[];
	configured: boolean;
}

interface CinephageBackendResponse {
	success?: boolean;
	tmdbId?: string | number;
	type?: string;
	streams?: unknown[];
	sources?: unknown[];
	data?: {
		streams?: unknown[];
		sources?: unknown[];
	};
	result?: {
		streams?: unknown[];
		sources?: unknown[];
	};
	meta?: Record<string, unknown>;
}

export interface CinephageStreamLookupParams {
	tmdbId: number;
	type: 'movie' | 'tv';
	season?: number;
	episode?: number;
}

export interface CinephageStreamLookupResult {
	success: boolean;
	sources: StreamSource[];
	error?: string;
	meta?: Record<string, unknown>;
}

export interface CinephageBackendHealth {
	configured: boolean;
	healthy: boolean;
	baseUrl: string;
	missing: string[];
	version?: string;
	commit?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getFirstString(...values: unknown[]): string | undefined {
	for (const value of values) {
		if (typeof value === 'string' && value.trim().length > 0) {
			return value.trim();
		}
	}

	return undefined;
}

function normalizeStreamType(value: string | undefined, url: string): StreamType {
	const normalized = value?.toLowerCase();

	if (normalized === 'mp4') {
		return 'mp4';
	}

	if (normalized === 'm3u8' || normalized === 'hls') {
		return normalized;
	}

	return url.includes('.mp4') ? 'mp4' : 'm3u8';
}

function normalizeSubtitles(value: unknown): StreamSubtitle[] | undefined {
	if (!Array.isArray(value)) {
		return undefined;
	}

	const subtitles: StreamSubtitle[] = [];

	for (const entry of value) {
		if (!isRecord(entry)) {
			continue;
		}

		const url = getFirstString(entry.url, entry.file, entry.src);
		if (!url) {
			continue;
		}

		const language = getFirstString(entry.language, entry.lang, entry.code, entry.srclang) ?? 'und';
		const isDefault = entry.isDefault === true || entry.default === true;

		subtitles.push({
			url,
			label: getFirstString(entry.label, entry.name, entry.language, entry.lang) ?? language,
			language,
			isDefault
		});
	}

	return subtitles.length > 0 ? subtitles : undefined;
}

function extractStreams(payload: CinephageBackendResponse): unknown[] {
	if (Array.isArray(payload.streams)) {
		return payload.streams;
	}

	if (Array.isArray(payload.sources)) {
		return payload.sources;
	}

	if (isRecord(payload.data)) {
		if (Array.isArray(payload.data.streams)) {
			return payload.data.streams;
		}

		if (Array.isArray(payload.data.sources)) {
			return payload.data.sources;
		}
	}

	if (isRecord(payload.result)) {
		if (Array.isArray(payload.result.streams)) {
			return payload.result.streams;
		}

		if (Array.isArray(payload.result.sources)) {
			return payload.result.sources;
		}
	}

	return [];
}

function normalizeSource(entry: unknown, apiBaseUrl: string): StreamSource | null {
	if (!isRecord(entry)) {
		return null;
	}

	const headers = isRecord(entry.headers)
		? (Object.fromEntries(
				Object.entries(entry.headers).filter(([, value]) => typeof value === 'string')
			) as Record<string, string>)
		: undefined;

	const url = getFirstString(
		entry.url,
		entry.streamUrl,
		entry.stream,
		entry.file,
		entry.src,
		entry.playlist
	);
	if (!url) {
		return null;
	}

	const referer = getFirstString(entry.referer, headers?.Referer, headers?.referer) ?? apiBaseUrl;
	const quality =
		getFirstString(entry.quality, entry.label, entry.resolution, entry.name, entry.title) ?? 'Auto';
	const server = getFirstString(entry.server, entry.source, entry.sourceName, entry.name);
	const provider = getFirstString(entry.provider, entry.providerId, entry.backend) ?? 'cinephage';
	const language = getFirstString(entry.language, entry.audioLanguage, entry.audioLang, entry.lang);
	const type = normalizeStreamType(getFirstString(entry.type, entry.streamType, entry.format), url);

	return {
		quality,
		title: getFirstString(entry.title, entry.name, server, provider) ?? `${provider} stream`,
		url,
		type,
		referer,
		requiresSegmentProxy: type !== 'mp4',
		server,
		language,
		headers,
		provider,
		subtitles: normalizeSubtitles(entry.subtitles ?? entry.tracks),
		status: 'working'
	};
}

async function loadConfig(): Promise<CinephageBackendConfig> {
	const settings = await getStreamingIndexerSettings();

	const commit = getFirstString(settings?.cinephageCommit);
	const version = getFirstString(settings?.cinephageVersion);

	const missing = [
		settings ? null : 'cinephage-stream indexer',
		commit ? null : 'cinephageCommit',
		version ? null : 'cinephageVersion'
	].filter((entry): entry is string => entry !== null);

	return {
		baseUrl: CINEPHAGE_API_BASE_URL,
		commit,
		version,
		missing,
		configured: missing.length === 0
	};
}

export class CinephageBackendClient {
	async getHealth(): Promise<CinephageBackendHealth> {
		const config = await loadConfig();
		const healthy = await this.isHealthy();

		return {
			configured: config.configured,
			healthy,
			baseUrl: config.baseUrl,
			missing: config.missing,
			version: config.version,
			commit: config.commit
		};
	}

	async isHealthy(): Promise<boolean> {
		const config = await loadConfig();

		try {
			const response = await fetch(`${config.baseUrl}/health`, {
				method: 'GET',
				headers: { Accept: 'application/json' }
			});

			return response.ok;
		} catch {
			return false;
		}
	}

	async getBaseUrl(): Promise<string> {
		const config = await loadConfig();
		return config.baseUrl;
	}

	async getStreams(params: CinephageStreamLookupParams): Promise<CinephageStreamLookupResult> {
		const config = await loadConfig();
		if (!config.configured || !config.commit || !config.version) {
			return {
				success: false,
				sources: [],
				error: `Cinephage backend is not configured: missing ${config.missing.join(', ')}. Enter the current published Cinephage API version and commit in the streaming indexer settings.`
			};
		}

		const url = new URL(`${config.baseUrl}/api/v1/stream/${params.tmdbId}`);
		url.searchParams.set('type', params.type);
		if (params.type === 'tv') {
			if (params.season !== undefined) {
				url.searchParams.set('season', String(params.season));
			}
			if (params.episode !== undefined) {
				url.searchParams.set('episode', String(params.episode));
			}
		}

		try {
			const response = await fetch(url.toString(), {
				method: 'GET',
				headers: {
					Accept: 'application/json',
					'X-Cinephage-Version': config.version,
					'X-Cinephage-Commit': config.commit
				}
			});

			if (response.status === 401) {
				return {
					success: false,
					sources: [],
					error:
						'Cinephage backend rejected authentication. Verify the manually entered Cinephage API version and commit match the current published build.'
				};
			}

			if (response.status === 429) {
				const body = await response.json().catch(() => ({}));
				const retryAfter =
					isRecord(body) && typeof body.retryAfter === 'number' ? body.retryAfter : undefined;
				return {
					success: false,
					sources: [],
					error: retryAfter
						? `Cinephage backend rate limited this request (${retryAfter}s)`
						: 'Cinephage backend rate limited this request'
				};
			}

			if (!response.ok) {
				return {
					success: false,
					sources: [],
					error: `Cinephage backend returned HTTP ${response.status}`
				};
			}

			const body = (await response.json()) as CinephageBackendResponse;
			const sources = extractStreams(body)
				.map((entry) => normalizeSource(entry, config.baseUrl))
				.filter((entry): entry is StreamSource => entry !== null);

			return {
				success: sources.length > 0,
				sources,
				error: sources.length > 0 ? undefined : 'Cinephage backend returned no playable streams',
				meta: body.meta
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logger.error(
				{
					error: message,
					tmdbId: params.tmdbId,
					type: params.type,
					season: params.season,
					episode: params.episode,
					...streamLog
				},
				'Cinephage backend request failed'
			);

			return {
				success: false,
				sources: [],
				error: message
			};
		}
	}
}

let clientInstance: CinephageBackendClient | null = null;

export function getCinephageBackendClient(): CinephageBackendClient {
	if (!clientInstance) {
		clientInstance = new CinephageBackendClient();
	}

	return clientInstance;
}
