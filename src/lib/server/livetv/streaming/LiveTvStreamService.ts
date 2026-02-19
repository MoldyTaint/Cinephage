/**
 * Live TV Stream Service
 *
 * Main orchestration service for Live TV streaming.
 * Handles stream URL resolution with failover support across multiple provider types.
 * Supports Stalker Portal, XStream Codes, and M3U playlist sources.
 */

import { createChildLogger } from '$lib/logging';
import { channelLineupService } from '$lib/server/livetv/lineup/ChannelLineupService';
import { getProvider } from '$lib/server/livetv/providers';
import { db } from '$lib/server/db';
import { livetvAccounts, type LivetvAccountRecord } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { isUrlSafe } from '$lib/server/http/ssrf-protection';
import type { BackgroundService, ServiceStatus } from '$lib/server/services/background-service.js';
import { ValidationError, ExternalServiceError } from '$lib/errors';
import type { FetchStreamResult, StreamError, LiveTvAccount } from '$lib/types/livetv';

const logger = createChildLogger({ module: 'LiveTvStreamService' });

/**
 * Stream source info for failover
 */
interface StreamSource {
	accountId: string;
	channelId: string;
	providerType: 'stalker' | 'xstream' | 'm3u' | 'iptvorg';
	priority: number;
}

export class LiveTvStreamService implements BackgroundService {
	readonly name = 'LiveTvStreamService';
	private _status: ServiceStatus = 'pending';
	private _error?: Error;

	// Metrics
	private totalResolutions = 0;
	private failovers = 0;

	get status(): ServiceStatus {
		return this._status;
	}

	get error(): Error | undefined {
		return this._error;
	}

	/**
	 * Start the service (non-blocking)
	 * Implements BackgroundService.start()
	 */
	start(): void {
		if (this._status === 'ready' || this._status === 'starting') {
			logger.debug('LiveTvStreamService already running');
			return;
		}

		this._status = 'starting';
		logger.info('Starting LiveTvStreamService');

		// Service initialization is synchronous for this service
		setImmediate(() => {
			this._status = 'ready';
			logger.info('LiveTvStreamService ready');
		});
	}

	/**
	 * Stop the service gracefully
	 * Implements BackgroundService.stop()
	 */
	async stop(): Promise<void> {
		if (this._status === 'pending') {
			return;
		}

		logger.info('Stopping LiveTvStreamService');
		this._status = 'pending';
		logger.info('LiveTvStreamService stopped');
	}

	/**
	 * Fetch stream - resolves URL and fetches from appropriate provider.
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
				providerType: item.providerType,
				priority: 0
			}
		];

		for (const backup of item.backups) {
			sources.push({
				accountId: backup.accountId,
				channelId: backup.channelId,
				providerType: backup.providerType,
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
					logger.info('Used backup source', {
						backupAccountId: source.accountId,
						failoverCount: this.failovers
					});
				}

				return result;
			} catch (error) {
				const err = error instanceof Error ? error : new Error(String(error));
				errors.push({ source, error: err });

				logger.warn('Source failed', {
					accountId: source.accountId,
					channelId: source.channelId,
					error: err.message
				});
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
		const { accountId, channelId, providerType } = source;

		// Get account
		const accountRecord = await db
			.select()
			.from(livetvAccounts)
			.where(eq(livetvAccounts.id, accountId))
			.limit(1)
			.then((rows) => rows[0]);

		if (!accountRecord) {
			throw this.createError('ACCOUNT_NOT_FOUND', `Account not found: ${accountId}`, accountId);
		}

		if (!accountRecord.enabled) {
			throw new ValidationError(`Account is disabled: ${accountId}`);
		}

		const account = this.recordToAccount(accountRecord);

		// Get channel (from lineup service's cached data, but we need the full channel)
		const item = await channelLineupService.getChannelById(lineupItemId);
		if (!item) {
			throw this.createError('LINEUP_ITEM_NOT_FOUND', `Lineup item not found: ${lineupItemId}`);
		}

		// Get the appropriate provider
		const provider = getProvider(providerType);

		// Resolve stream URL using the provider
		const resolutionResult = await provider.resolveStreamUrl(account, item.channel);

		if (!resolutionResult.success || !resolutionResult.url) {
			throw new ExternalServiceError(
				providerType,
				resolutionResult.error || 'Failed to resolve stream URL',
				502
			);
		}

		const streamUrl = resolutionResult.url;
		const type = resolutionResult.type;

		// SSRF protection: validate resolved URL before fetching
		const safetyCheck = isUrlSafe(streamUrl);
		if (!safetyCheck.safe) {
			logger.warn('Blocked unsafe stream URL', {
				url: streamUrl.substring(0, 100)
			});
			throw new ValidationError(`Stream URL blocked: ${safetyCheck.reason}`);
		}

		logger.info('Fetching stream', {
			url: streamUrl.substring(0, 100),
			providerType
		});

		const fetchStart = Date.now();

		// Build headers - merge provider headers (e.g., cookies for Stalker) with defaults
		const requestHeaders: Record<string, string> = {
			'User-Agent':
				'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 4 rev: 2116 Mobile Safari/533.3',
			Accept: '*/*',
			...resolutionResult.headers // Include provider-specific headers (cookies, auth, etc.)
		};

		logger.debug('Request headers', {
			lineupItemId,
			headers: Object.keys(requestHeaders)
		});

		// Fetch the stream
		const response = await fetch(streamUrl, {
			headers: requestHeaders,
			redirect: 'follow'
		});

		const fetchMs = Date.now() - fetchStart;

		if (!response.ok) {
			logger.error('Stream fetch failed', {
				status: response.status,
				statusText: response.statusText
			});
			throw new ExternalServiceError(
				providerType,
				`Upstream error: ${response.status}`,
				response.status
			);
		}

		// Note: Content-Length: 0 is valid for live streams (continuous data)
		// Live streams don't have a fixed size, so we skip this check
		const contentLength = response.headers.get('content-length');
		if (contentLength && contentLength !== '0') {
			logger.debug('Stream content length', {
				contentLength: response.headers.get('content-length')
			});
		}

		// For HLS streams, validate the playlist content
		if (type === 'hls' || streamUrl.toLowerCase().includes('.m3u8')) {
			const text = await response.text();
			if (!text.includes('#EXTM3U')) {
				logger.warn('Invalid HLS playlist: missing #EXTM3U', {
					lineupItemId
				});
				throw new ExternalServiceError(providerType, 'Invalid HLS playlist (missing #EXTM3U)', 502);
			}

			// Count segments in playlist
			const segmentCount = text
				.split('\n')
				.filter((line) => line.trim().startsWith('#EXTINF')).length;
			logger.debug('HLS stream validated', {
				segmentCount,
				lineupItemId
			});

			return {
				response: new Response(text, {
					status: response.status,
					headers: response.headers
				}),
				url: streamUrl,
				type: 'hls',
				accountId,
				channelId,
				lineupItemId,
				providerType,
				providerHeaders: resolutionResult.headers
			};
		}

		// For direct streams (TS, MP4, etc.), read first chunk to verify data flows
		const reader = response.body?.getReader();
		if (!reader) {
			throw new ExternalServiceError(providerType, 'Stream has no readable body', 502);
		}

		const firstChunk = await reader.read();
		if (firstChunk.done || !firstChunk.value || firstChunk.value.length === 0) {
			reader.releaseLock();
			logger.warn('Stream returned no data', {
				lineupItemId,
				accountId,
				fetchMs
			});
			throw new ExternalServiceError(providerType, 'Stream returned no data', 502);
		}

		logger.debug('Direct stream validated', {
			lineupItemId,
			accountId,
			type,
			fetchMs,
			firstChunkSize: firstChunk.value.length
		});

		// Create a new stream that includes the chunk we already read
		const reconstructedStream = new ReadableStream({
			start(controller) {
				controller.enqueue(firstChunk.value);
			},
			async pull(controller) {
				const { value, done } = await reader.read();
				if (done) {
					controller.close();
				} else if (value) {
					controller.enqueue(value);
				}
			},
			cancel() {
				reader.releaseLock();
			}
		});

		return {
			response: new Response(reconstructedStream, {
				status: response.status,
				headers: response.headers
			}),
			url: streamUrl,
			type,
			accountId,
			channelId,
			lineupItemId,
			providerType,
			providerHeaders: resolutionResult.headers
		};
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
	 * Convert database record to account type
	 */
	private recordToAccount(record: LivetvAccountRecord): LiveTvAccount {
		return {
			id: record.id,
			name: record.name,
			providerType: record.providerType,
			enabled: record.enabled ?? true,
			stalkerConfig: record.stalkerConfig ?? undefined,
			xstreamConfig: record.xstreamConfig ?? undefined,
			m3uConfig: record.m3uConfig ?? undefined,
			playbackLimit: record.playbackLimit ?? null,
			channelCount: record.channelCount ?? null,
			categoryCount: record.categoryCount ?? null,
			expiresAt: record.expiresAt ?? null,
			serverTimezone: record.serverTimezone ?? null,
			lastTestedAt: record.lastTestedAt ?? null,
			lastTestSuccess: record.lastTestSuccess ?? null,
			lastTestError: record.lastTestError ?? null,
			lastSyncAt: record.lastSyncAt ?? null,
			lastSyncError: record.lastSyncError ?? null,
			syncStatus: record.syncStatus ?? 'never',
			lastEpgSyncAt: record.lastEpgSyncAt ?? null,
			lastEpgSyncError: record.lastEpgSyncError ?? null,
			epgProgramCount: record.epgProgramCount ?? 0,
			hasEpg: record.hasEpg ?? null,
			createdAt: record.createdAt ?? new Date().toISOString(),
			updatedAt: record.updatedAt ?? new Date().toISOString()
		};
	}

	/**
	 * Get service metrics
	 */
	getMetrics(): {
		totalResolutions: number;
		failovers: number;
	} {
		return {
			totalResolutions: this.totalResolutions,
			failovers: this.failovers
		};
	}

	/**
	 * Shutdown service - cleanup resources
	 */
	shutdown(): void {
		logger.info('Service shutdown');
	}
}

// Singleton instance
let streamServiceInstance: LiveTvStreamService | null = null;

/**
 * Get the singleton LiveTvStreamService instance
 */
export function getLiveTvStreamService(): LiveTvStreamService {
	if (!streamServiceInstance) {
		streamServiceInstance = new LiveTvStreamService();
	}
	return streamServiceInstance;
}

export type { FetchStreamResult };
