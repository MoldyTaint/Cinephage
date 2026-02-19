/**
 * Stalker Portal Client
 *
 * Client for communicating with Stalker/Ministra protocol IPTV portals.
 * Implements the STB emulation protocol based on stalkerhek reference.
 *
 * Protocol flow:
 * 1. Handshake - reserve/obtain token
 * 2. Authenticate - either with credentials or device IDs
 * 3. API calls - all require proper headers with token
 */

import { logger } from '$lib/logging';
import type {
	StalkerAccountTestResult,
	StalkerRawProfile,
	StalkerCategory,
	StalkerChannel,
	EpgProgramRaw
} from '$lib/types/livetv';

const REQUEST_TIMEOUT = 30000; // 30 seconds (increased for slow portals)

// STB User-Agent string (mimics MAG200 set-top box)
const STB_USER_AGENT =
	'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 4 rev: 2116 Mobile Safari/533.3';

/**
 * Generate prehash for handshake authentication.
 * Reference implementations (stalkerhek) use prehash=0.
 * All tested portals accept this value.
 */
function generatePrehash(_macAddress: string): string {
	return '0';
}

/**
 * Configuration for Stalker Portal client
 */
export interface StalkerPortalConfig {
	portalUrl: string;
	macAddress: string;
	serialNumber: string;
	deviceId: string;
	deviceId2: string;
	model: string;
	timezone: string;
	token?: string;
	username?: string;
	password?: string;
}

interface StalkerResponse<T> {
	js: T;
	text?: string;
}

interface HandshakeResponse {
	token?: string;
	random?: string;
}

interface ProfileAuthResponse {
	id?: string;
	fname?: string;
}

interface GenresResponse {
	id: string;
	title: string;
	alias: string;
	censored: string;
}

interface ChannelData {
	id: string;
	name: string;
	number: string;
	logo: string;
	tv_genre_id: string;
	cmd: string;
	tv_archive: string;
	tv_archive_duration: string;
	cmds?: Array<{ id: string; ch_id: string }>;
}

interface ChannelsResponse {
	data: ChannelData[];
	total_items: number;
}

interface AccountInfoResponse {
	mac: string;
	phone: string;
}

interface CreateLinkResponse {
	cmd: string;
}

interface EpgInfoResponse {
	data: Record<string, EpgProgramData[]>;
}

interface EpgProgramData {
	id: string;
	ch_id: string;
	time: string;
	time_to: string;
	duration: number;
	name: string;
	descr: string;
	category: string;
	director: string;
	actor: string;
	start_timestamp: number;
	stop_timestamp: number;
	mark_archive: number;
}

/**
 * Retry configuration
 */
interface RetryConfig {
	maxRetries: number;
	baseDelay: number;
	maxDelay: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
	maxRetries: 3,
	baseDelay: 1000,
	maxDelay: 10000
};

/**
 * Generate a random 32-character hex token
 */
function generateToken(): string {
	const chars = 'ABCDEF0123456789';
	let token = '';
	for (let i = 0; i < 32; i++) {
		token += chars[Math.floor(Math.random() * chars.length)];
	}
	return token;
}

/**
 * Retry with exponential backoff
 */
async function retryWithBackoff<T>(
	fn: () => Promise<T>,
	config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> {
	let lastError: Error | null = null;

	for (let attempt = 0; attempt < config.maxRetries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));

			if (attempt < config.maxRetries - 1) {
				const delay = Math.min(config.baseDelay * Math.pow(2, attempt), config.maxDelay);
				logger.debug(`[StalkerPortal] Attempt ${attempt + 1} failed, retrying in ${delay}ms`, {
					error: lastError.message
				});
				await new Promise((resolve) => setTimeout(resolve, delay));
			}
		}
	}

	throw lastError;
}

export class StalkerPortalClient {
	private config: StalkerPortalConfig;
	private token: string;
	private authenticated: boolean = false;
	private watchdogInterval: ReturnType<typeof setInterval> | null = null;
	private static readonly WATCHDOG_INTERVAL_MS = 120_000; // 2 minutes (matches stalkerhek)

	constructor(config: StalkerPortalConfig) {
		// Normalize portal URL - ensure it doesn't end with slash
		this.config = {
			...config,
			portalUrl: config.portalUrl.replace(/\/+$/, ''),
			macAddress: config.macAddress.toUpperCase()
		};

		// Generate token if not provided
		this.token = config.token || generateToken();
	}

	/**
	 * Get the current token
	 */
	getToken(): string {
		return this.token;
	}

	/**
	 * Check if client is authenticated
	 */
	isAuthenticated(): boolean {
		return this.authenticated;
	}

	/**
	 * Get the portal.php endpoint URL
	 */
	private getPortalEndpoint(): string {
		const url = this.config.portalUrl;

		// Handle different portal URL formats
		if (url.includes('/portal.php')) {
			return url;
		}
		if (url.endsWith('/c') || url.endsWith('/c/')) {
			return `${url.replace(/\/+$/, '')}/portal.php`;
		}
		// Default: append /portal.php
		return `${url}/portal.php`;
	}

	/**
	 * Build cookie string for requests
	 */
	private getCookie(): string {
		const parts = [
			`sn=${encodeURIComponent(this.config.serialNumber)}`,
			`mac=${encodeURIComponent(this.config.macAddress)}`,
			'stb_lang=en',
			`timezone=${encodeURIComponent(this.config.timezone)}`
		];
		return parts.join('; ') + ';';
	}

	/**
	 * Build request headers for handshake (no Authorization)
	 */
	private getHandshakeHeaders(): HeadersInit {
		return {
			'User-Agent': STB_USER_AGENT,
			'X-User-Agent': `Model: ${this.config.model}; Link: Ethernet`,
			Accept: '*/*',
			'Accept-Language': 'en',
			Cookie: this.getCookie()
		};
	}

	/**
	 * Build request headers for authenticated requests
	 */
	private getHeaders(): HeadersInit {
		return {
			'User-Agent': STB_USER_AGENT,
			'X-User-Agent': `Model: ${this.config.model}; Link: Ethernet`,
			Accept: '*/*',
			'Accept-Language': 'en',
			Authorization: `Bearer ${this.token}`,
			Cookie: this.getCookie()
		};
	}

	/**
	 * Get headers for streaming (public for use by stream service)
	 */
	getStreamHeaders(): HeadersInit {
		return this.getHeaders();
	}

	/**
	 * Make a raw HTTP request to the portal
	 */
	private async httpRequest(url: string, useAuth: boolean = true): Promise<string> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

		try {
			const response = await fetch(url, {
				method: 'GET',
				headers: useAuth ? this.getHeaders() : this.getHandshakeHeaders(),
				signal: controller.signal
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			return await response.text();
		} catch (error) {
			clearTimeout(timeoutId);
			if (error instanceof Error && error.name === 'AbortError') {
				throw new Error('Request timed out', { cause: error });
			}
			throw error;
		}
	}

	/**
	 * Make a request to the portal API and parse JSON response
	 */
	private async request<T>(
		type: string,
		action: string,
		params: Record<string, string> = {},
		useAuth: boolean = true
	): Promise<T> {
		const endpoint = this.getPortalEndpoint();
		const url = new URL(endpoint);
		url.searchParams.set('type', type);
		url.searchParams.set('action', action);
		url.searchParams.set('JsHttpRequest', '1-xml');

		for (const [key, value] of Object.entries(params)) {
			url.searchParams.set(key, value);
		}

		if (action === 'create_link') {
			logger.debug('[StalkerPortal] Request URL', { fullUrl: url.toString() });
		}

		const text = await this.httpRequest(url.toString(), useAuth);

		if (action === 'create_link') {
			logger.debug('[StalkerPortal] Raw response', { text: text.substring(0, 500) });
		}

		const data = JSON.parse(text) as StalkerResponse<T>;
		return data.js;
	}

	/**
	 * Start the client - performs handshake and authentication
	 */
	async start(): Promise<void> {
		// Stop any existing watchdog before re-authenticating
		this.stopWatchdog();

		// Step 1: Handshake
		await this.handshake();

		// Step 2: Authenticate
		if (this.config.username && this.config.password) {
			await this.authenticate();
		} else {
			await this.authenticateWithDeviceIds();
		}

		this.authenticated = true;

		// Step 3: Start watchdog keepalive to prevent session expiration
		this.startWatchdog();
	}

	/**
	 * Perform handshake to reserve/obtain token
	 */
	async handshake(): Promise<void> {
		logger.debug('[StalkerPortal] Performing handshake', {
			portalUrl: this.config.portalUrl,
			mac: this.config.macAddress.substring(0, 8) + '...'
		});

		const endpoint = this.getPortalEndpoint();
		const url = new URL(endpoint);
		url.searchParams.set('type', 'stb');
		url.searchParams.set('action', 'handshake');
		url.searchParams.set('token', this.token);
		url.searchParams.set('prehash', generatePrehash(this.config.macAddress));
		url.searchParams.set('JsHttpRequest', '1-xml');

		const text = await this.httpRequest(url.toString(), false);
		const data = JSON.parse(text) as StalkerResponse<HandshakeResponse>;

		// If server provides a new token, use it
		if (data.js?.token && data.js.token !== '') {
			logger.debug('[StalkerPortal] Server provided new token');
			this.token = data.js.token;
		} else {
			logger.debug('[StalkerPortal] Token accepted');
		}
	}

	/**
	 * Authenticate with username/password credentials
	 */
	async authenticate(): Promise<void> {
		if (!this.config.username || !this.config.password) {
			throw new Error('Username and password required for credential authentication');
		}

		logger.debug('[StalkerPortal] Authenticating with credentials');

		const result = await this.request<boolean>(
			'stb',
			'do_auth',
			{
				login: this.config.username,
				password: this.config.password,
				device_id: this.config.deviceId,
				device_id2: this.config.deviceId2
			},
			true
		);

		if (!result) {
			throw new Error('Authentication failed: invalid credentials');
		}

		logger.debug('[StalkerPortal] Credential authentication successful');
	}

	/**
	 * Authenticate using device IDs (alternative to username/password)
	 */
	async authenticateWithDeviceIds(): Promise<void> {
		logger.debug('[StalkerPortal] Authenticating with device IDs');

		const result = await this.request<ProfileAuthResponse>(
			'stb',
			'get_profile',
			{
				hd: '1',
				sn: this.config.serialNumber,
				stb_type: this.config.model,
				device_id: this.config.deviceId,
				device_id2: this.config.deviceId2,
				auth_second_step: '1'
			},
			true
		);

		if (!result?.id) {
			throw new Error('Authentication failed: device ID auth rejected');
		}

		logger.debug('[StalkerPortal] Device ID authentication successful', {
			userId: result.id,
			name: result.fname
		});
	}

	/**
	 * Ensure client is authenticated
	 */
	private async ensureAuthenticated(): Promise<void> {
		if (!this.authenticated) {
			await this.start();
		}
	}

	/**
	 * Create a stream link for a channel
	 * This is the key method for getting playable stream URLs
	 *
	 * @param cmd - The channel CMD value (e.g., "ffmpeg http://...")
	 * @param retry - Whether to retry with re-authentication on failure
	 * @returns The playable stream URL
	 */
	async createLink(cmd: string, retry: boolean = true): Promise<string> {
		await this.ensureAuthenticated();

		logger.debug('[StalkerPortal] Creating link', { cmd });

		const result = await retryWithBackoff(async () => {
			return this.request<CreateLinkResponse>('itv', 'create_link', {
				cmd: cmd
			});
		});

		logger.debug('[StalkerPortal] create_link response', { result });

		if (!result?.cmd) {
			if (retry && (this.config.username || this.config.deviceId)) {
				// Session may have expired, try re-authenticating
				logger.debug('[StalkerPortal] create_link failed, attempting re-authentication');
				this.authenticated = false;
				await this.start();
				return this.createLink(cmd, false);
			}
			throw new Error('create_link failed: empty response');
		}

		// Parse the URL from the response
		// Response format: "ffmpeg http://actual-stream-url" or just the URL
		const cmdStr = result.cmd.trim();
		const parts = cmdStr.split(/\s+/);
		const streamUrl = parts[parts.length - 1];

		if (!streamUrl || (!streamUrl.startsWith('http://') && !streamUrl.startsWith('https://'))) {
			throw new Error(`create_link returned invalid URL: ${cmdStr}`);
		}

		logger.info('[StalkerPortal] createLink returning URL', { streamUrl });

		return streamUrl;
	}

	/**
	 * Send watchdog keep-alive
	 */
	async watchdog(): Promise<void> {
		await this.ensureAuthenticated();

		await this.request<unknown>('watchdog', 'get_events', {
			event_active_id: '0',
			init: '0',
			cur_play_type: '1'
		});
	}

	/**
	 * Start periodic watchdog keepalive.
	 * Stalker portal sessions expire after inactivity. Both stalkerhek implementations
	 * send watchdog every ~2 minutes to keep the session alive.
	 */
	private startWatchdog(): void {
		this.stopWatchdog(); // Clear any existing interval

		this.watchdogInterval = setInterval(() => {
			this.watchdog().catch((err) => {
				logger.warn('[StalkerPortal] Watchdog keepalive failed', {
					portalUrl: this.config.portalUrl,
					error: err instanceof Error ? err.message : String(err)
				});
				// Session likely expired — mark as unauthenticated so next request re-auths
				this.authenticated = false;
				this.stopWatchdog();
			});
		}, StalkerPortalClient.WATCHDOG_INTERVAL_MS);

		// Don't block Node.js exit on the watchdog timer
		if (
			this.watchdogInterval &&
			typeof this.watchdogInterval === 'object' &&
			'unref' in this.watchdogInterval
		) {
			this.watchdogInterval.unref();
		}

		logger.debug('[StalkerPortal] Watchdog started', {
			portalUrl: this.config.portalUrl,
			intervalMs: StalkerPortalClient.WATCHDOG_INTERVAL_MS
		});
	}

	/**
	 * Stop the watchdog keepalive timer
	 */
	private stopWatchdog(): void {
		if (this.watchdogInterval) {
			clearInterval(this.watchdogInterval);
			this.watchdogInterval = null;
		}
	}

	/**
	 * Stop the client — clears watchdog timer and marks as unauthenticated.
	 * Should be called when the client is no longer needed.
	 */
	stop(): void {
		this.stopWatchdog();
		this.authenticated = false;
		logger.debug('[StalkerPortal] Client stopped', {
			portalUrl: this.config.portalUrl
		});
	}

	/**
	 * Get account profile information
	 */
	async getProfile(): Promise<StalkerRawProfile> {
		await this.ensureAuthenticated();
		return this.request<StalkerRawProfile>('stb', 'get_profile');
	}

	/**
	 * Get account info (contains expiry in phone field for many providers)
	 */
	async getAccountInfo(): Promise<AccountInfoResponse | null> {
		await this.ensureAuthenticated();
		try {
			return await this.request<AccountInfoResponse>('account_info', 'get_main_info');
		} catch {
			// Some portals don't support this endpoint
			return null;
		}
	}

	/**
	 * Get channel categories/genres
	 */
	async getGenres(): Promise<StalkerCategory[]> {
		await this.ensureAuthenticated();
		const genres = await this.request<GenresResponse[]>('itv', 'get_genres');

		return genres.map((g) => ({
			id: g.id,
			title: g.title,
			alias: g.alias,
			censored: g.censored === '1'
		}));
	}

	/**
	 * Get fresh stream URL for a channel by stalker_id.
	 * Always uses create_link with a normalized localhost cmd format.
	 * This is the format the portal expects — passing full URLs causes
	 * the portal to strip the stream ID, returning broken URLs.
	 */
	async getFreshStreamUrl(
		stalkerId: string,
		_urlType: 'direct' | 'create_link' | 'unknown' | null = 'unknown'
	): Promise<string> {
		// Always use the normalized localhost cmd format for create_link.
		// Portals expect: "ffmpeg http://localhost/ch/{channelId}_"
		// When full URLs are passed, many portals strip the stream ID (returning stream=&id=null).
		// The portal resolves the localhost template to the real streaming URL with a fresh token.
		const normalizedCmd = `ffmpeg http://localhost/ch/${stalkerId}_`;

		logger.debug('[StalkerPortal] Using create_link for fresh stream URL', {
			stalkerId,
			normalizedCmd
		});
		return this.createLink(normalizedCmd);
	}

	/**
	 * Get all channels
	 */
	async getChannels(): Promise<StalkerChannel[]> {
		await this.ensureAuthenticated();
		const result = await this.request<ChannelsResponse | ChannelData[]>('itv', 'get_all_channels');

		// Some portals return an array directly, others return {data: [], total_items: N}
		const channels: ChannelData[] = Array.isArray(result)
			? result
			: (result as ChannelsResponse).data;
		if (!channels || !Array.isArray(channels)) {
			return [];
		}

		return channels.map((ch) => ({
			id: ch.id,
			name: ch.name,
			number: ch.number,
			logo: ch.logo,
			genreId: ch.tv_genre_id,
			cmd: ch.cmd,
			tvArchive: ch.tv_archive === '1',
			archiveDuration: parseInt(ch.tv_archive_duration, 10) || 0
		}));
	}

	/**
	 * Get channel count (more efficient than fetching all channels)
	 */
	async getChannelCount(): Promise<number> {
		await this.ensureAuthenticated();
		const result = await this.request<ChannelsResponse | ChannelData[]>('itv', 'get_all_channels');

		// Some portals return an array directly, others return {data: [], total_items: N}
		if (Array.isArray(result)) {
			return result.length;
		}
		const response = result as ChannelsResponse;
		return response.total_items || response.data?.length || 0;
	}

	/**
	 * Get EPG (Electronic Program Guide) data for all channels.
	 * @param period - Number of hours of EPG data to fetch (default: 24)
	 * @returns Map of channel ID to array of programs
	 */
	async getEpgInfo(period: number = 24): Promise<Map<string, EpgProgramRaw[]>> {
		await this.ensureAuthenticated();

		logger.debug('[StalkerPortal] Fetching EPG info', {
			portalUrl: this.config.portalUrl,
			period
		});

		try {
			const result = await this.request<EpgInfoResponse | Record<string, EpgProgramData[]>>(
				'itv',
				'get_epg_info',
				{ period: period.toString() }
			);

			// Response can be either { data: { channelId: programs[] } } or just { channelId: programs[] }
			let epgData: Record<string, EpgProgramData[]>;
			if ('data' in result && typeof result.data === 'object' && result.data !== null) {
				epgData = result.data as Record<string, EpgProgramData[]>;
			} else {
				epgData = result as Record<string, EpgProgramData[]>;
			}

			const programMap = new Map<string, EpgProgramRaw[]>();

			for (const [channelId, programs] of Object.entries(epgData)) {
				if (!Array.isArray(programs)) continue;

				const mappedPrograms: EpgProgramRaw[] = programs.map((p) => ({
					id: p.id,
					ch_id: p.ch_id || channelId,
					time: p.time,
					time_to: p.time_to,
					duration: Math.abs(p.duration), // Duration can be negative in some responses
					name: p.name || '',
					descr: p.descr || '',
					category: p.category || '',
					director: p.director || '',
					actor: p.actor || '',
					start_timestamp: p.start_timestamp,
					stop_timestamp: p.stop_timestamp,
					mark_archive: p.mark_archive || 0
				}));

				if (mappedPrograms.length > 0) {
					programMap.set(channelId, mappedPrograms);
				}
			}

			logger.debug('[StalkerPortal] EPG fetch complete', {
				channelCount: programMap.size,
				totalPrograms: Array.from(programMap.values()).reduce((sum, arr) => sum + arr.length, 0)
			});

			return programMap;
		} catch (error) {
			logger.error('[StalkerPortal] EPG fetch failed', {
				portalUrl: this.config.portalUrl,
				error: error instanceof Error ? error.message : 'Unknown error'
			});
			return new Map();
		}
	}

	/**
	 * Get short EPG (current and next program) for a single channel.
	 * More efficient than getEpgInfo when you only need current/next for one channel.
	 * @param channelId - Stalker channel ID
	 * @returns Array of programs (typically 1-2 items for current and next)
	 */
	async getShortEpg(channelId: string): Promise<EpgProgramRaw[]> {
		await this.ensureAuthenticated();

		try {
			const result = await this.request<EpgProgramData[]>('itv', 'get_short_epg', {
				ch_id: channelId
			});

			if (!Array.isArray(result)) {
				return [];
			}

			return result.map((p) => ({
				id: p.id,
				ch_id: p.ch_id || channelId,
				time: p.time,
				time_to: p.time_to,
				duration: Math.abs(p.duration),
				name: p.name || '',
				descr: p.descr || '',
				category: p.category || '',
				director: p.director || '',
				actor: p.actor || '',
				start_timestamp: p.start_timestamp,
				stop_timestamp: p.stop_timestamp,
				mark_archive: p.mark_archive || 0
			}));
		} catch {
			return [];
		}
	}

	/**
	 * Parse expiration date from a string.
	 * Handles various formats like:
	 * - "January 19, 2027, 7:19 pm"
	 * - "2027-01-19 19:19:00"
	 * - "Jan 19, 2027"
	 */
	private parseExpiryFromString(value: string | null | undefined): string | null {
		if (!value || value === '0000-00-00 00:00:00' || value === '') {
			return null;
		}

		// Try direct parse first
		const parsed = new Date(value);
		if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 2000) {
			return parsed.toISOString();
		}

		// Try to extract date from string (e.g., "January 19, 2027, 7:19 pm" or "Expires: Jan 19, 2027")
		const dateMatch = value.match(
			/(\w+\s+\d{1,2},?\s+\d{4})|(\d{4}-\d{2}-\d{2})|(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/
		);
		if (dateMatch) {
			const extracted = new Date(dateMatch[0]);
			if (!isNaN(extracted.getTime()) && extracted.getFullYear() > 2000) {
				return extracted.toISOString();
			}
		}

		return null;
	}

	/**
	 * Parse expiration date from profile data and account info.
	 * Different portals store expiry in different fields/endpoints.
	 */
	private parseExpiryDate(
		profile: StalkerRawProfile,
		accountInfo: AccountInfoResponse | null
	): string | null {
		// Try account_info phone field first (most reliable for many providers)
		if (accountInfo?.phone) {
			const fromAccountInfo = this.parseExpiryFromString(accountInfo.phone);
			if (fromAccountInfo) return fromAccountInfo;
		}

		// Try profile fields
		const candidates = [profile.expire_billing_date, profile.tariff_expired_date, profile.phone];

		for (const candidate of candidates) {
			const parsed = this.parseExpiryFromString(candidate);
			if (parsed) return parsed;
		}

		return null;
	}

	/**
	 * Determine account status from profile
	 */
	private getAccountStatus(
		profile: StalkerRawProfile,
		accountInfo: AccountInfoResponse | null
	): 'active' | 'blocked' | 'expired' {
		if (profile.blocked === '1') {
			return 'blocked';
		}

		// Check expiry
		const expiryDate = this.parseExpiryDate(profile, accountInfo);
		if (expiryDate) {
			const expiry = new Date(expiryDate);
			if (expiry < new Date()) {
				return 'expired';
			}
		}

		// Check status field
		if (profile.status === 0) {
			return 'blocked';
		}

		return 'active';
	}

	/**
	 * Test connection and fetch account metadata
	 */
	async testConnection(): Promise<StalkerAccountTestResult> {
		try {
			// Step 1: Start (handshake + auth)
			await this.start();

			// Step 2: Get profile
			const profile = await this.getProfile();

			// Step 3: Get account info (for expiry date)
			const accountInfo = await this.getAccountInfo();

			// Step 4: Get genres (categories)
			const genres = await this.getGenres();

			// Step 5: Get channel count
			const channelCount = await this.getChannelCount();

			// No channels = useless account
			if (channelCount === 0) {
				return {
					success: false,
					error: 'No channels available (portal may block API access)'
				};
			}

			const expiresAt = this.parseExpiryDate(profile, accountInfo);
			const status = this.getAccountStatus(profile, accountInfo);

			return {
				success: true,
				profile: {
					playbackLimit: profile.playback_limit || 1,
					channelCount,
					categoryCount: genres.length,
					expiresAt,
					serverTimezone: profile.default_timezone || 'UTC',
					status
				}
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			logger.error('[StalkerPortal] Connection test failed', {
				portalUrl: this.config.portalUrl,
				error: message
			});

			return {
				success: false,
				error: message
			};
		}
	}
}

/**
 * Create a new Stalker Portal client instance
 */
export function createStalkerClient(config: StalkerPortalConfig): StalkerPortalClient {
	return new StalkerPortalClient(config);
}
