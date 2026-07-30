import { z } from 'zod';
import { db } from '$lib/server/db';
import { indexers } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '$lib/logging';
import { BaseCinephageModule } from '../BaseCinephageModule.js';
import type { ConnectionTestResult, CinephageModuleContext } from '../types.js';
import type { CinephageCore } from '../../core/CinephageCore.js';
import { getCinephageCore } from '../../core/CinephageCore.js';
import type { CinephageSettingsService } from '../../settings/CinephageSettingsService.js';
import { getCinephageSettingsService } from '../../settings/CinephageSettingsService.js';
import type {
	PlaybackMediaType,
	StreamSource,
	StreamSubtitle,
	StreamType
} from '$lib/server/streaming/types';

export const CINEPHAGE_STREAM_DEFINITION_ID = 'cinephage-stream';
export const MODULE_ID = 'library-streaming';

export const libraryStreamingSettingsSchema = z.object({
	useHttps: z.boolean().default(false),
	externalHost: z.string().trim().default('')
});

export type LibraryStreamingSettings = z.infer<typeof libraryStreamingSettingsSchema>;

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

const streamLog = { logDomain: 'streams' as const };

// ---- Stream normalization helpers (ported from the old CinephageApiService) ----

interface CinephageApiResponse {
	url?: string;
	provider?: string;
	quality?: string;
	protocol?: string;
	headers?: Record<string, unknown>;
	subtitles?: unknown[];
	streams?: unknown[];
	sources?: unknown[];
	data?: { streams?: unknown[]; sources?: unknown[] };
	result?: { streams?: unknown[]; sources?: unknown[] };
	meta?: Record<string, unknown>;
	error?: { details?: { limit?: number; resetAt?: string }; message?: string };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getFirstString(...values: unknown[]): string | undefined {
	for (const value of values) {
		if (typeof value === 'string' && value.trim().length > 0) return value.trim();
	}
	return undefined;
}

function normalizeStreamType(value: string | undefined, url: string): StreamType {
	const normalized = value?.toLowerCase();
	if (normalized === 'mp4') return 'mp4';
	if (normalized === 'm3u8' || normalized === 'hls') return normalized;
	return url.includes('.mp4') ? 'mp4' : 'm3u8';
}

function normalizeSubtitles(value: unknown): StreamSubtitle[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const subtitles: StreamSubtitle[] = [];
	for (const entry of value) {
		if (!isRecord(entry)) continue;
		const url = getFirstString(entry.url, entry.file, entry.src);
		if (!url) continue;
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

function extractStreams(payload: CinephageApiResponse): unknown[] {
	if (typeof payload.url === 'string' && typeof payload.provider === 'string') return [payload];
	if (Array.isArray(payload.streams)) return payload.streams;
	if (Array.isArray(payload.sources)) return payload.sources;
	if (isRecord(payload.data)) {
		if (Array.isArray(payload.data.streams)) return payload.data.streams;
		if (Array.isArray(payload.data.sources)) return payload.data.sources;
	}
	if (isRecord(payload.result)) {
		if (Array.isArray(payload.result.streams)) return payload.result.streams;
		if (Array.isArray(payload.result.sources)) return payload.result.sources;
	}
	return [];
}

function normalizeSource(entry: unknown, apiBaseUrl: string): StreamSource | null {
	if (!isRecord(entry)) return null;
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
	if (!url) return null;
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

/**
 * CinephageStreamingModule
 *
 * The single module for all Cinephage streaming — local library search
 * (the cinephage-stream indexer row, useHttps/externalHost config) AND
 * remote VOD playback via api.cinephage.net.
 *
 * Replaces the two-module split (LibraryStreaming + RemoteStreaming) that
 * was surfaced as separate toggles on the settings panel but were really
 * a single feature users care about: "Cinephage Streaming".
 */
export class LibraryStreamingModule extends BaseCinephageModule {
	readonly id = MODULE_ID;
	readonly name = 'Cinephage Streaming';
	readonly description =
		'Stream content from your local library and resolve VOD sources via the Cinephage network';
	readonly maturity = 'stable' as const;
	readonly capabilities = {
		providesIndexer: { definitionId: CINEPHAGE_STREAM_DEFINITION_ID }
	} as const;
	readonly settingsSchema = libraryStreamingSettingsSchema;

	private readonly settings: CinephageSettingsService;
	private readonly core: CinephageCore;
	private _effectiveEnabled = true;

	constructor(
		settings: CinephageSettingsService = getCinephageSettingsService(),
		core: CinephageCore = getCinephageCore()
	) {
		super();
		this.settings = settings;
		this.core = core;
	}

	async refreshEnabledState(): Promise<void> {
		const [subsystem, moduleCfg] = await Promise.all([
			this.settings.getConfig(),
			this.settings.getModuleConfig(this.id)
		]);
		this._effectiveEnabled = subsystem.enabled && moduleCfg.enabled;
	}

	isEnabled(): boolean {
		return this._effectiveEnabled;
	}

	async init(_ctx: CinephageModuleContext): Promise<void> {
		await this.refreshEnabledState();
		await this.syncIndexerRow();
	}

	async syncIndexerRow(): Promise<void> {
		const existing = await db
			.select()
			.from(indexers)
			.where(eq(indexers.definitionId, CINEPHAGE_STREAM_DEFINITION_ID));
		const now = new Date().toISOString();

		if (existing.length === 0) {
			await db.insert(indexers).values({
				name: 'Cinephage Library',
				definitionId: CINEPHAGE_STREAM_DEFINITION_ID,
				enabled: true,
				isBuiltIn: true,
				baseUrl: 'https://api.cinephage.net',
				priority: 50,
				enableAutomaticSearch: true,
				enableInteractiveSearch: true,
				createdAt: now,
				updatedAt: now
			});
			return;
		}

		const row = existing[0];
		if (!row.isBuiltIn) {
			await db
				.update(indexers)
				.set({ isBuiltIn: true, updatedAt: now })
				.where(eq(indexers.id, row.id));
		}
	}

	async getSettings(): Promise<LibraryStreamingSettings> {
		const stored = await this.settings.getModuleConfig(this.id);
		const parsed = libraryStreamingSettingsSchema.safeParse(stored.settings);
		return parsed.success ? parsed.data : libraryStreamingSettingsSchema.parse({});
	}

	async updateSettings(updates: Partial<LibraryStreamingSettings>): Promise<void> {
		const current = await this.getSettings();
		const merged = libraryStreamingSettingsSchema.parse({ ...current, ...updates });
		await this.settings.updateModuleSettings(this.id, {
			useHttps: merged.useHttps,
			externalHost: merged.externalHost
		});
	}

	async getBaseUrl(): Promise<string | null> {
		const s = await this.getSettings();
		if (!s.externalHost) return null;
		const host = s.externalHost.replace(/^https?:\/\//, '');
		const protocol = s.useHttps ? 'https' : 'http';
		return `${protocol}://${host}`;
	}

	// ---- VOD playback (formerly RemoteStreamingModule) ----

	async getStreams(params: CinephageStreamLookupParams): Promise<CinephageStreamLookupResult> {
		const baseUrl = await this.core.getBaseUrl();
		const identity = await this.core.getIdentity();
		if (!identity.isConfigured || !identity.commit) {
			return {
				success: false,
				sources: [],
				error:
					'Cinephage subsystem identity is not configured. Set APP_VERSION/APP_COMMIT env vars or configure overrides in Cinephage settings.'
			};
		}

		const url = new URL(`${baseUrl}/api/v1/stream/${params.tmdbId}`);
		url.searchParams.set('type', params.type);
		if (params.type === 'tv') {
			if (params.season !== undefined) url.searchParams.set('season', String(params.season));
			if (params.episode !== undefined) url.searchParams.set('episode', String(params.episode));
		}

		try {
			const response = await this.core.getHttpClient().get(url.toString(), {
				headers: { Accept: 'application/json', ...(await this.core.getAuthHeaders()) },
				signal: params.signal
			});

			switch (response.status) {
				case 401:
					return {
						success: false,
						sources: [],
						error:
							'Cinephage API rejected authentication. Verify the configured version and commit.'
					};
				case 403:
					return {
						success: false,
						sources: [],
						error: 'Cinephage API returned forbidden: insufficient permissions'
					};
				case 429: {
					let msg = 'Cinephage API rate limited this request';
					try {
						const body = JSON.parse(response.body) as CinephageApiResponse;
						const details = body.error?.details;
						if (details) {
							const parts = [msg];
							if (typeof details.limit === 'number') parts.push(`limit: ${details.limit}/window`);
							if (typeof details.resetAt === 'string') parts.push(`resets at ${details.resetAt}`);
							msg = parts.join(', ');
						}
					} catch {
						/* default msg */
					}
					return { success: false, sources: [], error: msg };
				}
				case 502:
					return {
						success: false,
						sources: [],
						error: 'Cinephage API returned 502: no streams available for this content'
					};
				case 400: {
					let msg = 'Cinephage API returned HTTP 400';
					try {
						const body = JSON.parse(response.body) as CinephageApiResponse;
						if (body.error?.message) msg = body.error.message;
					} catch {
						/* default msg */
					}
					return { success: false, sources: [], error: msg };
				}
			}

			if (response.status < 200 || response.status >= 300) {
				return {
					success: false,
					sources: [],
					error: `Cinephage API returned HTTP ${response.status}`
				};
			}

			const body = JSON.parse(response.body) as CinephageApiResponse;
			const sources = extractStreams(body)
				.map((entry) => normalizeSource(entry, baseUrl))
				.filter((entry): entry is StreamSource => entry !== null);

			return {
				success: sources.length > 0,
				sources,
				error: sources.length > 0 ? undefined : 'Cinephage API returned no playable streams',
				meta: body.meta
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logger.error(
				{ error: message, tmdbId: params.tmdbId, type: params.type, ...streamLog },
				'Cinephage API request failed'
			);
			return { success: false, sources: [], error: message };
		}
	}

	async test(): Promise<ConnectionTestResult> {
		const identity = await this.core.getIdentity();
		if (!identity.isConfigured || !identity.commit) {
			return {
				success: false,
				error:
					'Cinephage server identity could not be resolved. Set APP_VERSION/APP_COMMIT env vars or configure overrides in Cinephage settings.'
			};
		}
		try {
			const baseUrl = await this.core.getBaseUrl();
			const response = await this.core.getHttpClient().get(`${baseUrl}/api/v1/health`, {
				headers: { Accept: 'application/json', ...(await this.core.getAuthHeaders()) }
			});
			if (response.status >= 200 && response.status < 300) return { success: true };
			return { success: false, error: `Cinephage API returned HTTP ${response.status}` };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error)
			};
		}
	}
}

let _instance: LibraryStreamingModule | null = null;

export function getLibraryStreamingModule(): LibraryStreamingModule {
	if (!_instance) {
		_instance = new LibraryStreamingModule();
	}
	return _instance;
}

export function resetLibraryStreamingModule(): void {
	_instance = null;
}
