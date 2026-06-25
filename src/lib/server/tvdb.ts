/**
 * TheTVDB v4 API client.
 *
 * Singleton object mirroring the structure of `tmdb.ts`. TVDB is a TV-only
 * supplementary metadata source: it fills episode gaps (air dates, runtime,
 * titles, overviews) and provides reliable tvdbId resolution. TMDB remains
 * canonical; callers must only use TVDB data to fill empty fields.
 *
 * Auth: POST /login {apikey, pin?} -> ~24h JWT used as Authorization: Bearer.
 * Free/project keys work without a PIN; subscriber keys need the PIN.
 *
 * API quirk: the episode-list endpoint returns name/overview as null. Air date,
 * runtime, image path and the TVDB episode id come free from the list; episode
 * text requires a per-episode /episodes/{id}/extended call.
 */

import { db } from './db';
import { settings } from './db/schema';
import { eq } from 'drizzle-orm';
import { TVDB } from '$lib/config/constants';
import { createChildLogger } from '$lib/logging';
import { ConfigurationError, ExternalServiceError } from '$lib/errors';

const logger = createChildLogger({ logDomain: 'system' as const });

// ---------------------------------------------------------------------------
// Types (minimal; shapes we actually consume)
// ---------------------------------------------------------------------------

export interface TvdbEpisode {
	id: number;
	seriesId: number;
	name: string | null;
	aired: string | null;
	runtime: number | null;
	overview: string | null;
	image: string | null;
	seasonNumber: number;
	number: number;
	absoluteNumber: number;
}

export interface TvdbSearchResult {
	id: number;
	tvdb_id?: number;
	name: string;
	overview?: string | null;
	year?: string | null;
	image?: string | null;
	remoteIds?: { id: string; sourceName: string }[];
}

export interface TvdbEpisodePage {
	episodes: TvdbEpisode[];
	/** Whether another page of results exists */
	hasNext: boolean;
}

// ---------------------------------------------------------------------------
// Settings cache (api key + optional subscriber pin) - mirrors TMDB pattern
// ---------------------------------------------------------------------------

const SETTINGS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let _cachedApiKey: string | null = null;
let _cachedPin: string | null = null;
let _settingsCacheTimestamp = 0;
let _settingsCachePromise: Promise<void> | null = null;

async function loadTvdbSettings(): Promise<{ apiKey: string; pin: string }> {
	const now = Date.now();
	if (_cachedApiKey !== null && now - _settingsCacheTimestamp < SETTINGS_CACHE_TTL_MS) {
		return { apiKey: _cachedApiKey, pin: _cachedPin ?? '' };
	}

	if (!_settingsCachePromise) {
		_settingsCachePromise = (async () => {
			try {
				const [apiKeySetting, pinSetting] = await Promise.all([
					db.query.settings.findFirst({ where: eq(settings.key, 'tvdb_api_key') }),
					db.query.settings.findFirst({ where: eq(settings.key, 'tvdb_api_pin') })
				]);

				_cachedApiKey = apiKeySetting?.value ?? null;
				_cachedPin = pinSetting?.value ?? null;
				_settingsCacheTimestamp = Date.now();
			} finally {
				_settingsCachePromise = null;
			}
		})();
	}
	await _settingsCachePromise;

	return { apiKey: _cachedApiKey ?? '', pin: _cachedPin ?? '' };
}

// ---------------------------------------------------------------------------
// Token cache (JWT from /login)
// ---------------------------------------------------------------------------

const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000; // re-login 5 min before expiry
let _cachedToken: string | null = null;
let _tokenExpiresAt = 0;
let _tokenPromise: Promise<string> | null = null;

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

async function fetchWithRetry(url: string, options?: RequestInit, retries = 3): Promise<Response> {
	const BASE_DELAY_MS = 1000;

	for (let attempt = 0; attempt <= retries; attempt++) {
		const res = await fetch(url, options);

		if (attempt === retries || res.ok || res.status !== 429) {
			return res;
		}

		const retryAfter = res.headers.get('Retry-After');
		const parsed = parseInt(retryAfter ?? '', 10);
		const delayMs = !isNaN(parsed) ? parsed * 1000 : BASE_DELAY_MS * Math.pow(2, attempt);

		logger.warn(
			{ url: url.split('?')[0], attempt: attempt + 1, delayMs },
			'TVDB rate limited, retrying'
		);
		await new Promise((resolve) => setTimeout(resolve, delayMs));
	}

	return fetch(url, options);
}

async function login(): Promise<string> {
	const { apiKey, pin } = await loadTvdbSettings();
	if (!apiKey) {
		throw new ConfigurationError('TVDB API key not configured');
	}

	const body: Record<string, string> = { apikey: apiKey };
	if (pin) body.pin = pin;

	const res = await fetchWithRetry(`${TVDB.BASE_URL}/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
		body: JSON.stringify(body)
	});

	if (!res.ok) {
		throw new ExternalServiceError(
			'TVDB',
			`login failed: ${res.status} ${res.statusText}`,
			res.status
		);
	}

	const json = (await res.json()) as { status?: string; data?: { token?: string } };
	const token = json.data?.token;
	if (!token) {
		throw new ExternalServiceError('TVDB', 'login returned no token');
	}

	_cachedToken = token;
	// TVDB JWTs last ~30 days in practice; derive a conservative expiry from the
	// payload if present, otherwise refresh daily.
	_tokenExpiresAt = decodeTokenExpiry(token) ?? Date.now() + 24 * 60 * 60 * 1000;
	return token;
}

async function getToken(): Promise<string> {
	if (_cachedToken && Date.now() < _tokenExpiresAt - TOKEN_REFRESH_MARGIN_MS) {
		return _cachedToken;
	}

	if (!_tokenPromise) {
		_tokenPromise = login().finally(() => {
			_tokenPromise = null;
		});
	}
	return _tokenPromise;
}

function invalidateToken(): void {
	_cachedToken = null;
	_tokenExpiresAt = 0;
	_tokenPromise = null;
}

/**
 * Best-effort decode of a JWT `exp` claim. Returns epoch ms or null.
 */
function decodeTokenExpiry(token: string): number | null {
	try {
		const parts = token.split('.');
		if (parts.length < 2) return null;
		const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
			exp?: number;
		};
		return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
	} catch {
		return null;
	}
}

/**
 * Authenticated GET. Re-logs in once on 401 (handles token expiry mid-run).
 */
async function authedGet(path: string): Promise<unknown> {
	const token = await getToken();
	const makeRequest = (tok: string) =>
		fetchWithRetry(`${TVDB.BASE_URL}${path}`, {
			headers: { Authorization: `Bearer ${tok}`, Accept: 'application/json' }
		});

	let res = await makeRequest(token);

	if (res.status === 401) {
		logger.warn('TVDB token rejected (401) - re-logging in');
		invalidateToken();
		const fresh = await getToken();
		res = await makeRequest(fresh);
	}

	if (!res.ok) {
		let message = `${res.status} ${res.statusText}`;
		try {
			const errBody = (await res.json()) as { message?: string };
			if (errBody.message) message = errBody.message;
		} catch {
			// ignore parse error
		}
		throw new ExternalServiceError('TVDB', `${path.split('?')[0]}: ${message}`, res.status);
	}

	return res.json();
}

// ---------------------------------------------------------------------------
// Response normalisation helpers
// ---------------------------------------------------------------------------

interface TvdbEnvelope<T> {
	status?: string;
	data?: T;
	links?: { prev?: string | null; next?: string | null; total_items?: number };
}

function normaliseEpisode(raw: Record<string, unknown>): TvdbEpisode {
	return {
		id: Number(raw.id ?? 0),
		seriesId: Number(raw.seriesId ?? 0),
		name: (raw.name as string | null) ?? null,
		aired: (raw.aired as string | null) ?? null,
		runtime: raw.runtime != null ? Number(raw.runtime) : null,
		overview: (raw.overview as string | null) ?? null,
		image: (raw.image as string | null) ?? null,
		seasonNumber: Number(raw.seasonNumber ?? raw.season ?? 0),
		number: Number(raw.number ?? 0),
		absoluteNumber: Number(raw.absoluteNumber ?? 0)
	};
}

// ---------------------------------------------------------------------------
// Public client
// ---------------------------------------------------------------------------

export const tvdb = {
	/**
	 * Invalidate the cached TVDB settings + token. Call after updating
	 * tvdb_api_key or tvdb_api_pin in the settings table.
	 */
	invalidateSettings() {
		_cachedApiKey = null;
		_cachedPin = null;
		_settingsCacheTimestamp = 0;
		_settingsCachePromise = null;
		invalidateToken();
	},

	/** Whether a TVDB API key is configured. */
	async isConfigured(): Promise<boolean> {
		const { apiKey } = await loadTvdbSettings();
		return Boolean(apiKey);
	},

	/** Read the configured api key (empty string if unset). Exposed for diagnostics/tests. */
	async getApiKey(): Promise<string> {
		const { apiKey } = await loadTvdbSettings();
		return apiKey;
	},

	/**
	 * Force a login and surface failures. Useful for settings validation and the
	 * live test. Resolves to true on success.
	 */
	async verifyCredentials(): Promise<boolean> {
		invalidateToken();
		const token = await getToken();
		return Boolean(token);
	},

	/**
	 * Search series by name. Returns candidates for tvdbId resolution.
	 */
	async searchSeries(query: string): Promise<TvdbSearchResult[]> {
		const trimmed = query.trim();
		if (!trimmed) return [];

		const data = (await authedGet(
			`/search?query=${encodeURIComponent(trimmed)}&type=series`
		)) as TvdbEnvelope<TvdbSearchResult[]>;

		return (data.data ?? []).map((raw) => ({
			id: Number(raw.id ?? raw.tvdb_id ?? 0),
			tvdb_id: raw.tvdb_id ?? Number(raw.id ?? 0),
			name: raw.name,
			overview: raw.overview ?? null,
			year: raw.year ?? null,
			image: raw.image ?? null,
			remoteIds: raw.remoteIds
		}));
	},

	/**
	 * Get the extended series record (status, seasons, artworks, seasonTypes).
	 */
	async getSeriesExtended(tvdbId: number): Promise<Record<string, unknown>> {
		const data = (await authedGet(`/series/${tvdbId}/extended`)) as TvdbEnvelope<
			Record<string, unknown>
		>;
		return data.data ?? {};
	},

	/**
	 * Fetch one page of episodes for a season-type slug (`official`, `dvd`,
	 * `absolute`, ...). Pages are 0-indexed.
	 */
	async getEpisodePage(
		seriesId: number,
		seasonType: string = TVDB.DEFAULT_SEASON_TYPE,
		page: number = 0
	): Promise<TvdbEpisodePage> {
		const data = (await authedGet(
			`/series/${seriesId}/episodes/${encodeURIComponent(seasonType)}/${page}`
		)) as TvdbEnvelope<{ episodes?: TvdbEpisode[] } | TvdbEpisode[]>;

		const rawList = Array.isArray(data.data)
			? data.data
			: ((data.data as { episodes?: TvdbEpisode[] })?.episodes ?? []);

		return {
			episodes: rawList.map((raw) => normaliseEpisode(raw as unknown as Record<string, unknown>)),
			hasNext: Boolean(data.links?.next)
		};
	},

	/**
	 * Fetch full details for a single episode (name + overview). Required because
	 * the list endpoint returns text fields as null.
	 */
	async getEpisodeExtended(episodeId: number): Promise<TvdbEpisode | null> {
		const data = (await authedGet(`/episodes/${episodeId}/extended`)) as TvdbEnvelope<
			Record<string, unknown>
		>;

		if (!data.data) return null;
		return normaliseEpisode(data.data);
	},

	/** Test hooks (not used in production paths). */
	_invalidateTokenForTests: invalidateToken
};
