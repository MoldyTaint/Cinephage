/**
 * Stalker Stream Service
 *
 * Main orchestration service for Live TV streaming.
 * Handles stream URL resolution with failover support.
 *
 * Stream URLs from Stalker portals expire very quickly, so we don't cache them.
 * Each stream request gets a fresh URL.
 */

import { logger } from '$lib/logging';
import { channelLineupService } from '$lib/server/livetv/lineup/ChannelLineupService';
import { getStalkerAccountManager } from '$lib/server/livetv/stalker/StalkerAccountManager';
import {
	StalkerPortalClient,
	type StalkerPortalConfig
} from '$lib/server/livetv/stalker/StalkerPortalClient';
import { db } from '$lib/server/db';
import { stalkerAccounts, type StalkerAccountRecord } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Stream source info
 */
interface StreamSource {
	accountId: string;
	channelId: string;
	cmd: string;
	priority: number;
}

/**
 * Result of fetching a stream (includes response and metadata)
 */
export interface FetchStreamResult {
	response: Response;
	url: string;
	type: 'hls' | 'direct' | 'unknown';
	accountId: string;
	channelId: string;
	lineupItemId: string;
}

/**
 * Stream error with additional context
 */
export interface StreamError extends Error {
	code:
		| 'LINEUP_ITEM_NOT_FOUND'
		| 'ACCOUNT_NOT_FOUND'
		| 'ALL_SOURCES_FAILED'
		| 'STREAM_FETCH_FAILED';
	accountId?: string;
	channelId?: string;
	attempts?: number;
}

// User agent for proxying streams
const PROXY_USER_AGENT =
	'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 4 rev: 2116 Mobile Safari/533.3';

export class StalkerStreamService {
	// Cache of authenticated clients per account
	private clients: Map<string, StalkerPortalClient> = new Map();

	// Metrics
	private totalResolutions = 0;
	private failovers = 0;

	/**
	 * Fetch stream directly - gets fresh URL and immediately fetches.
	 * This is the main method used by the stream endpoint.
	 */
	async fetchStream(lineupItemId: string): Promise<FetchStreamResult> {
		this.totalResolutions++;

		// Get lineup item with backups
		const item = await channelLineupService.getChannelWithBackups(lineupItemId);
		if (!item) {
			throw this.createError('LINEUP_ITEM_NOT_FOUND', `Lineup item not found: ${lineupItemId}`);
		}

		// Build source list: primary first, then backups in priority order
		const sources: StreamSource[] = [
			{
				accountId: item.accountId,
				channelId: item.channelId,
				cmd: item.channel.cmd,
				priority: 0
			}
		];

		for (const backup of item.backups) {
			sources.push({
				accountId: backup.accountId,
				channelId: backup.channelId,
				cmd: backup.channel.cmd,
				priority: backup.priority
			});
		}

		// Try each source
		const errors: Array<{ source: StreamSource; error: Error }> = [];

		for (const source of sources) {
			try {
				const result = await this.fetchFromSource(source, lineupItemId);

				// If we used a backup, log it
				if (source.priority > 0) {
					this.failovers++;
					logger.info('[StalkerStreamService] Used backup source', {
						lineupItemId,
						primaryAccountId: sources[0].accountId,
						backupAccountId: source.accountId,
						backupPriority: source.priority
					});
				}

				return result;
			} catch (error) {
				const err = error instanceof Error ? error : new Error(String(error));
				errors.push({ source, error: err });

				logger.warn('[StalkerStreamService] Source failed', {
					lineupItemId,
					accountId: source.accountId,
					channelId: source.channelId,
					priority: source.priority,
					error: err.message,
					remainingSources: sources.length - errors.length
				});

				// Invalidate client on error so next attempt gets fresh auth
				this.clients.delete(source.accountId);
			}
		}

		// All sources failed
		const errorMessages = errors.map((e) => `[${e.source.priority}] ${e.error.message}`).join('; ');
		throw this.createError(
			'ALL_SOURCES_FAILED',
			`All ${sources.length} sources failed: ${errorMessages}`,
			sources[0].accountId,
			sources[0].channelId,
			sources.length
		);
	}

	/**
	 * Fetch stream from a single source
	 */
	private async fetchFromSource(
		source: StreamSource,
		lineupItemId: string
	): Promise<FetchStreamResult> {
		const { accountId, channelId, cmd } = source;

		// Validate account exists and is enabled before attempting fetch
		const account = db
			.select({ id: stalkerAccounts.id, enabled: stalkerAccounts.enabled })
			.from(stalkerAccounts)
			.where(eq(stalkerAccounts.id, accountId))
			.get();

		if (!account) {
			throw this.createError('ACCOUNT_NOT_FOUND', `Account not found: ${accountId}`, accountId);
		}

		if (!account.enabled) {
			throw new Error(`Account is disabled: ${accountId}`);
		}

		// Extract stream URL directly from cmd (skip broken create_link)
		// The cmd format is "ffmpeg http://..." - we just need the URL part
		const streamUrl = this.extractUrlFromCmd(cmd);
		if (!streamUrl) {
			throw new Error(`Invalid cmd format: ${cmd}`);
		}

		// Determine stream type from URL
		const type = this.detectStreamType(streamUrl);

		logger.info('[StalkerStreamService] Fetching stream', {
			lineupItemId,
			accountId,
			streamUrl,
			type
		});

		const fetchStart = Date.now();

		// Fetch the stream - try minimal headers first
		// Some IPTV servers reject requests with STB-specific headers
		const response = await fetch(streamUrl, {
			headers: {
				'User-Agent': PROXY_USER_AGENT,
				Accept: '*/*'
			},
			redirect: 'follow'
		});

		const fetchMs = Date.now() - fetchStart;

		if (!response.ok) {
			logger.error('[StalkerStreamService] Stream fetch failed', {
				lineupItemId,
				accountId,
				streamUrl,
				status: response.status,
				statusText: response.statusText,
				fetchMs
			});
			throw new Error(`Upstream error: ${response.status}`);
		}

		logger.debug('[StalkerStreamService] Stream fetched successfully', {
			lineupItemId,
			accountId,
			type,
			fetchMs
		});

		return {
			response,
			url: streamUrl,
			type,
			accountId,
			channelId,
			lineupItemId
		};
	}

	/**
	 * Get or create an authenticated client for an account
	 */
	private async getClient(accountId: string): Promise<StalkerPortalClient> {
		// Check cache
		const cached = this.clients.get(accountId);
		if (cached && cached.isAuthenticated()) {
			return cached;
		}

		// Get account from database (raw record to access all fields)
		const account = db
			.select()
			.from(stalkerAccounts)
			.where(eq(stalkerAccounts.id, accountId))
			.get();

		if (!account) {
			throw this.createError('ACCOUNT_NOT_FOUND', `Account not found: ${accountId}`, accountId);
		}

		if (!account.enabled) {
			throw this.createError('ACCOUNT_NOT_FOUND', `Account is disabled: ${accountId}`, accountId);
		}

		// Create and authenticate new client
		const config = this.buildClientConfig(account);
		const client = new StalkerPortalClient(config);

		await client.start();

		// Cache the authenticated client
		this.clients.set(accountId, client);

		// Save updated token to database if it changed
		const newToken = client.getToken();
		if (newToken !== account.token) {
			await getStalkerAccountManager().updateAccountToken(accountId, newToken);
		}

		return client;
	}

	/**
	 * Build client config from account record
	 */
	private buildClientConfig(account: StalkerAccountRecord): StalkerPortalConfig {
		return {
			portalUrl: account.portalUrl,
			macAddress: account.macAddress,
			serialNumber: account.serialNumber || this.generateSerialNumber(),
			deviceId: account.deviceId || this.generateDeviceId(),
			deviceId2: account.deviceId2 || this.generateDeviceId(),
			model: account.model || 'MAG254',
			timezone: account.timezone || 'Europe/London',
			token: account.token || undefined,
			username: account.username || undefined,
			password: account.password || undefined
		};
	}

	/**
	 * Generate a random serial number (like MAG devices use)
	 */
	private generateSerialNumber(): string {
		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
		let sn = '';
		for (let i = 0; i < 12; i++) {
			sn += chars[Math.floor(Math.random() * chars.length)];
		}
		return sn;
	}

	/**
	 * Generate a random device ID (like MAG devices use)
	 */
	private generateDeviceId(): string {
		const chars = 'ABCDEF0123456789';
		let id = '';
		for (let i = 0; i < 32; i++) {
			id += chars[Math.floor(Math.random() * chars.length)];
		}
		return id;
	}

	/**
	 * Extract the playable URL from the channel cmd field.
	 * The cmd format is typically "ffmpeg http://..." or just the URL.
	 */
	private extractUrlFromCmd(cmd: string): string | null {
		if (!cmd) return null;

		const trimmed = cmd.trim();

		// If it starts with http, it's already a URL
		if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
			return trimmed;
		}

		// Otherwise extract URL from "ffmpeg URL" or similar format
		const parts = trimmed.split(/\s+/);
		for (const part of parts) {
			if (part.startsWith('http://') || part.startsWith('https://')) {
				return part;
			}
		}

		return null;
	}

	/**
	 * Detect stream type from URL
	 */
	private detectStreamType(url: string): 'hls' | 'direct' | 'unknown' {
		const lowerUrl = url.toLowerCase();
		if (lowerUrl.includes('.m3u8') || lowerUrl.includes('/hls/')) {
			return 'hls';
		}
		if (lowerUrl.includes('.ts') || lowerUrl.includes('.mp4')) {
			return 'direct';
		}
		return 'unknown';
	}

	/**
	 * Create a typed stream error
	 */
	private createError(
		code: StreamError['code'],
		message: string,
		accountId?: string,
		channelId?: string,
		attempts?: number
	): StreamError {
		const error = new Error(message) as StreamError;
		error.code = code;
		error.accountId = accountId;
		error.channelId = channelId;
		error.attempts = attempts;
		return error;
	}

	/**
	 * Invalidate cached client for an account
	 */
	invalidateAccount(accountId: string): void {
		this.clients.delete(accountId);
	}

	/**
	 * Invalidate all cached clients
	 */
	invalidateAll(): void {
		this.clients.clear();
	}

	/**
	 * Get service metrics
	 */
	getMetrics(): {
		totalResolutions: number;
		failovers: number;
		cachedClients: number;
	} {
		return {
			totalResolutions: this.totalResolutions,
			failovers: this.failovers,
			cachedClients: this.clients.size
		};
	}

	/**
	 * Shutdown service - cleanup resources
	 */
	shutdown(): void {
		this.clients.clear();
		logger.info('[StalkerStreamService] Service shutdown');
	}
}

// Singleton instance
let streamServiceInstance: StalkerStreamService | null = null;

/**
 * Get the singleton StalkerStreamService instance
 */
export function getStalkerStreamService(): StalkerStreamService {
	if (!streamServiceInstance) {
		streamServiceInstance = new StalkerStreamService();
	}
	return streamServiceInstance;
}
