import { logger } from '$lib/logging';
import type {
	PlaybackMediaType,
	StreamSource,
	StreamSubtitle,
	StreamType,
	CinephageApiErrorBody
} from '$lib/server/streaming/types';
import { getCinephageBackendConfig } from '../config.js';
import { cinephageRequestWithConfig } from '../client.js';
import { isRecord, getFirstString, getHttpErrorStatus } from '../shared.js';

const streamLog = { logDomain: 'streams' as const };

interface CinephageStreamResponse {
	url?: string;
	provider?: string;
	streams?: unknown[];
	sources?: unknown[];
	data?: { streams?: unknown[]; sources?: unknown[] };
	result?: { streams?: unknown[]; sources?: unknown[] };
	meta?: Record<string, unknown>;
	error?: CinephageApiErrorBody;
}

export interface CinephageStreamLookupParams {
	tmdbId: number;
	type: PlaybackMediaType;
	season?: number;
	episode?: number;
	signal?: AbortSignal;
}

export interface CinephageStreamLookupResult {
	success: boolean;
	sources: StreamSource[];
	error?: string;
	meta?: Record<string, unknown>;
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

function extractStreams(payload: CinephageStreamResponse): unknown[] {
	if (typeof payload.url === 'string' && typeof payload.provider === 'string') {
		return [payload];
	}
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
	const type = normalizeStreamType(
		getFirstString(entry.protocol, entry.type, entry.streamType, entry.format),
		url
	);

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

function mapStreamError(status: number): string {
	if (status === 401) {
		return 'Cinephage API rejected authentication. Verify the configured version and commit.';
	}
	if (status === 403) {
		return 'Cinephage API returned forbidden: insufficient permissions';
	}
	if (status === 429) {
		return 'Cinephage API rate limited this request';
	}
	if (status === 502) {
		return 'Cinephage API returned 502: no streams available for this content';
	}
	if (status === 400) {
		return 'Cinephage API returned HTTP 400';
	}
	return `Cinephage API returned HTTP ${status}`;
}

export async function getStreams(
	params: CinephageStreamLookupParams
): Promise<CinephageStreamLookupResult> {
	const config = await getCinephageBackendConfig();
	if (!config.configured) {
		return {
			success: false,
			sources: [],
			error: `Cinephage API is not configured: missing ${config.missing.join(', ')}.`
		};
	}

	try {
		const response = await cinephageRequestWithConfig(config, `/api/v1/stream/${params.tmdbId}`, {
			query: {
				type: params.type,
				season: params.type === 'tv' ? params.season : undefined,
				episode: params.type === 'tv' ? params.episode : undefined
			},
			signal: params.signal
		});

		const body = JSON.parse(response.body) as CinephageStreamResponse;
		const sources = extractStreams(body)
			.map((entry) => normalizeSource(entry, config.baseUrl))
			.filter((entry): entry is StreamSource => entry !== null);

		return {
			success: sources.length > 0,
			sources,
			error: sources.length > 0 ? undefined : 'Cinephage API returned no playable streams',
			meta: body.meta
		};
	} catch (error) {
		const status = getHttpErrorStatus(error);
		if (status !== undefined) {
			return { success: false, sources: [], error: mapStreamError(status) };
		}

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
			'Cinephage API request failed'
		);

		return { success: false, sources: [], error: message };
	}
}
